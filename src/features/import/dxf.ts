/**
 * Importação de DXF (função PURA): polilinhas fechadas → ambientes; textos → nomes/tipos;
 * pares de linhas paralelas próximas → paredes no eixo. Tudo entra como 'importado' + 'pendente'.
 */
import DxfParserPadrao from 'dxf-parser';
import type { Elemento, ElementoDe, Ponto, ResultadoImportacao } from '@/core/model';
import { arredondar, distancia, formatarNumero } from '@/core/calc';
import { novoId } from '@/core/store';
import { atribuirTextos, classificarAmbiente, escolherNome } from './ambientes';
import {
  MARGEM_PAGINA_FRACAO,
  METROS_POR_UNIDADE_DXF,
  MINIMO_VERTICES_POLIGONO,
  PAREDE_DXF,
  type ConfigParede,
  TOLERANCIA_FECHAMENTO_FRACAO,
  type UnidadeDxf,
} from './config';

export interface OpcoesDXF {
  /** Página (1-based) que recebe os elementos. */
  pagina: number;
  /** Unidade do desenho, informada pelo usuário. */
  unidadeDxf: UnidadeDxf;
  /** Dimensões da página, em unidades da página. */
  larguraPagina: number;
  alturaPagina: number;
}

export type ResultadoDXF = ResultadoImportacao & {
  /** Metros por unidade da página. */
  escala: number;
};

// ---------------------------------------------------------------- leitura das entidades

interface EntidadeDxf {
  type: string;
  vertices?: { x: number; y: number; bulge?: number }[];
  shape?: boolean;
  text?: string;
  startPoint?: { x: number; y: number };
  position?: { x: number; y: number };
}

interface TextoDxf {
  texto: string;
  ponto: Ponto;
}

interface DesenhoDxf {
  poligonos: Ponto[][];
  /** Segmentos de LINE e de polilinhas abertas. */
  segmentos: [Ponto, Ponto][];
  textos: TextoDxf[];
  ignoradas: Map<string, number>;
  polilinhasComArco: number;
}

type ConstrutorParser = new () => { parseSync(texto: string): { entities?: EntidadeDxf[] } | null };

/** O pacote é UMD: conforme o empacotador, o construtor vem direto ou dentro de `.default`/`.DxfParser`. */
function construtorDoParser(): ConstrutorParser {
  const modulo = DxfParserPadrao as unknown as { default?: unknown; DxfParser?: unknown };
  const candidato = typeof modulo === 'function' ? modulo : (modulo.DxfParser ?? modulo.default);
  return candidato as ConstrutorParser;
}

const pontoValido = <T extends { x: number; y: number }>(p: T | undefined): p is T =>
  p !== undefined && Number.isFinite(p.x) && Number.isFinite(p.y);

/** Remove os códigos de formatação do MTEXT (\P, \fArial|...;, chaves) e espaços repetidos. */
export function limparTextoDxf(texto: string): string {
  return texto
    .replace(/\\[Pp]/g, ' ')
    .replace(/\\[A-Za-z][^;\\]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lerDesenho(textoDxf: string): DesenhoDxf {
  let entidades: EntidadeDxf[];
  try {
    const Parser = construtorDoParser();
    entidades = new Parser().parseSync(textoDxf)?.entities ?? [];
  } catch {
    throw new Error('Não foi possível ler o DXF: o arquivo está corrompido ou não é um DXF em texto (ASCII).');
  }

  const desenho: DesenhoDxf = { poligonos: [], segmentos: [], textos: [], ignoradas: new Map(), polilinhasComArco: 0 };
  const ignorar = (tipo: string): void => {
    desenho.ignoradas.set(tipo, (desenho.ignoradas.get(tipo) ?? 0) + 1);
  };

  const brutos = entidades.flatMap((e) => (e.vertices ?? []).filter(pontoValido));
  let diagonal = 0;
  if (brutos.length > 0) {
    const xs = brutos.map((p) => p.x);
    const ys = brutos.map((p) => p.y);
    diagonal = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  }
  const toleranciaFechamento = diagonal * TOLERANCIA_FECHAMENTO_FRACAO;

  for (const e of entidades) {
    switch (e.type) {
      case 'LINE': {
        const [a, b] = e.vertices ?? [];
        if (pontoValido(a) && pontoValido(b)) desenho.segmentos.push([{ x: a.x, y: a.y }, { x: b.x, y: b.y }]);
        else ignorar(e.type);
        break;
      }
      case 'LWPOLYLINE':
      case 'POLYLINE': {
        const vertices = (e.vertices ?? []).filter(pontoValido);
        if (vertices.some((v) => typeof v.bulge === 'number' && v.bulge !== 0)) desenho.polilinhasComArco++;
        let pontos: Ponto[] = vertices.map((v) => ({ x: v.x, y: v.y }));
        let fechada = e.shape === true;
        const primeiro = pontos[0];
        const ultimo = pontos[pontos.length - 1];
        if (pontos.length > MINIMO_VERTICES_POLIGONO && primeiro && ultimo && distancia(primeiro, ultimo) <= toleranciaFechamento) {
          pontos = pontos.slice(0, -1);
          fechada = true;
        }
        if (fechada && pontos.length >= MINIMO_VERTICES_POLIGONO) {
          desenho.poligonos.push(pontos);
        } else if (pontos.length >= 2) {
          for (let i = 0; i + 1 < pontos.length; i++) desenho.segmentos.push([pontos[i]!, pontos[i + 1]!]);
        } else {
          ignorar(e.type);
        }
        break;
      }
      case 'TEXT':
      case 'MTEXT': {
        const ponto = e.type === 'TEXT' ? e.startPoint : e.position;
        const texto = limparTextoDxf(e.text ?? '');
        if (pontoValido(ponto) && texto !== '') desenho.textos.push({ texto, ponto: { x: ponto.x, y: ponto.y } });
        else ignorar(e.type);
        break;
      }
      default:
        ignorar(e.type);
    }
  }
  return desenho;
}

// ---------------------------------------------------------------- encaixe na página

interface Encaixe {
  /** DXF (y para cima) → página (y para baixo). */
  mapear(p: Ponto): Ponto;
  /** Metros por unidade da página. */
  escala: number;
}

function encaixarNaPagina(pontos: Ponto[], opcoes: OpcoesDXF): Encaixe {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pontos) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const largura = maxX - minX;
  const altura = maxY - minY;
  const utilX = opcoes.larguraPagina * (1 - 2 * MARGEM_PAGINA_FRACAO);
  const utilY = opcoes.alturaPagina * (1 - 2 * MARGEM_PAGINA_FRACAO);
  // unidades da página por unidade do desenho (fator uniforme)
  const fator = Math.min(largura > 0 ? utilX / largura : Infinity, altura > 0 ? utilY / altura : Infinity);
  if (!Number.isFinite(fator) || !(fator > 0)) {
    throw new Error('O DXF não tem geometria com dimensões para importar.');
  }
  const origemX = (opcoes.larguraPagina - largura * fator) / 2;
  const origemY = (opcoes.alturaPagina - altura * fator) / 2;
  return {
    mapear: (p) => ({ x: origemX + (p.x - minX) * fator, y: origemY + (maxY - p.y) * fator }),
    escala: METROS_POR_UNIDADE_DXF[opcoes.unidadeDxf] / fator,
  };
}

// ---------------------------------------------------------------- paredes (pares de paralelas)

interface Seg {
  a: Ponto;
  comprimento: number;
  ux: number;
  uy: number;
  meio: Ponto;
  /** Trechos já usados em algum par (parâmetro ao longo do próprio segmento). */
  usados: [number, number][];
  peso: number;
}

interface Par {
  i: number;
  j: number;
  distancia: number;
  /** Distância com sinal de j em relação a i (lado da normal). */
  lado: number;
  inicio: number;
  fim: number;
  /** Menor peso (largura do traço) entre os dois segmentos. */
  peso: number;
}

export interface ParedeDetectada {
  /** Eixo (2 pontos), nas mesmas unidades dos segmentos. */
  eixo: [Ponto, Ponto];
  /** Espessura (m), arredondada ao centímetro. */
  espessura: number;
  /** Menor peso entre as duas faces (0 quando os pesos não são informados). */
  peso: number;
}

/**
 * Pares de segmentos paralelos com sobreposição longitudinal e distância de parede.
 * `escala` = metros por unidade dos segmentos. Cada trecho de segmento entra em no máximo um par.
 * `pesos` (opcional, um por segmento; ex.: largura do traço no PDF): pares de traços mais pesados são
 * formados primeiro — em planta baixa, o que é cortado (parede) sai com a pena mais grossa.
 */
export function detectarParedes(
  segmentos: [Ponto, Ponto][],
  escala: number,
  cfg: ConfigParede = PAREDE_DXF,
  pesos?: number[],
): ParedeDetectada[] {
  const senoMax = Math.sin((cfg.toleranciaAngularGraus * Math.PI) / 180);
  const folga = cfg.folgaDistanciaM / escala;

  const segs: Seg[] = [];
  for (const [indice, [a, b]] of segmentos.entries()) {
    const comprimento = distancia(a, b);
    if (!(comprimento > 0)) continue;
    segs.push({
      a,
      comprimento,
      ux: (b.x - a.x) / comprimento,
      uy: (b.y - a.y) / comprimento,
      meio: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      usados: [],
      peso: pesos?.[indice] ?? 0,
    });
  }

  const ao_longo = (s: Seg, p: Ponto): number => (p.x - s.a.x) * s.ux + (p.y - s.a.y) * s.uy;
  const pontoEm = (s: Seg, t: number): Ponto => ({ x: s.a.x + t * s.ux, y: s.a.y + t * s.uy });

  const pares: Par[] = [];
  for (let i = 0; i < segs.length; i++) {
    const si = segs[i]!;
    for (let j = i + 1; j < segs.length; j++) {
      const sj = segs[j]!;
      if (Math.abs(si.ux * sj.uy - si.uy * sj.ux) > senoMax) continue;
      // distância com sinal do meio de j à reta de i (normal = (-uy, ux))
      const lado = -(sj.meio.x - si.a.x) * si.uy + (sj.meio.y - si.a.y) * si.ux;
      const d = Math.abs(lado);
      const dM = d * escala;
      if (dM < cfg.distanciaMinM - cfg.folgaDistanciaM || dM > cfg.distanciaMaxM + cfg.folgaDistanciaM) continue;
      const t1 = ao_longo(si, sj.a);
      const t2 = ao_longo(si, pontoEm(sj, sj.comprimento));
      const inicio = Math.max(0, Math.min(t1, t2));
      const fim = Math.min(si.comprimento, Math.max(t1, t2));
      if ((fim - inicio) * escala < cfg.sobreposicaoMinM) continue;
      pares.push({ i, j, distancia: d, lado, inicio, fim, peso: Math.min(si.peso, sj.peso) });
    }
  }
  // traços mais pesados primeiro; depois as faces mais próximas; em empate, a maior sobreposição
  pares.sort((p, q) => q.peso - p.peso || p.distancia - q.distancia || q.fim - q.inicio - (p.fim - p.inicio));

  const livre = (s: Seg, ini: number, fim: number): boolean =>
    s.usados.every(([u0, u1]) => fim <= u0 + folga || ini >= u1 - folga);

  const paredes: ParedeDetectada[] = [];
  for (const par of pares) {
    const si = segs[par.i]!;
    const sj = segs[par.j]!;
    const p0 = pontoEm(si, par.inicio);
    const p1 = pontoEm(si, par.fim);
    const j0 = ao_longo(sj, p0);
    const j1 = ao_longo(sj, p1);
    const trechoJ: [number, number] = [Math.min(j0, j1), Math.max(j0, j1)];
    if (!livre(si, par.inicio, par.fim) || !livre(sj, trechoJ[0], trechoJ[1])) continue;
    si.usados.push([par.inicio, par.fim]);
    sj.usados.push(trechoJ);
    const nx = (-si.uy * par.lado) / 2;
    const ny = (si.ux * par.lado) / 2;
    paredes.push({
      eixo: [
        { x: p0.x + nx, y: p0.y + ny },
        { x: p1.x + nx, y: p1.y + ny },
      ],
      espessura: arredondar(par.distancia * escala, cfg.casasEspessura),
      peso: par.peso,
    });
  }
  return paredes;
}

// ---------------------------------------------------------------- importação

function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

export function importarDXF(textoDxf: string, opcoes: OpcoesDXF): ResultadoDXF {
  const desenho = lerDesenho(textoDxf);
  const todosPontos: Ponto[] = [
    ...desenho.poligonos.flat(),
    ...desenho.segmentos.flat(),
    ...desenho.textos.map((t) => t.ponto),
  ];
  if (todosPontos.length === 0) {
    throw new Error('O DXF não tem polilinhas, linhas nem textos para importar.');
  }
  const { mapear, escala } = encaixarNaPagina(todosPontos, opcoes);

  const elementos: Elemento[] = [];
  const pendencias: string[] = [
    `Confira a unidade do desenho (${opcoes.unidadeDxf}) e a escala calculada: meça uma cota conhecida na planta ` +
      `(1 unidade da página = ${formatarNumero(escala, 4)} m).`,
  ];
  const base = { pagina: opcoes.pagina, vinculos: {}, origem: 'importado', status: 'pendente' } as const;

  // --- ambientes: polígonos + textos internos (o texto vai para o menor polígono que o contém)
  const poligonos = desenho.poligonos.map((pts) => pts.map(mapear));
  const { porPoligono: textosPorPoligono, soltos: textosSoltos } = atribuirTextos(
    poligonos,
    desenho.textos.map((t) => ({ texto: t.texto, ponto: mapear(t.ponto) })),
  );

  poligonos.forEach((pontos, i) => {
    const textos = textosPorPoligono[i]!;
    const nomeLido = escolherNome(textos);
    const nome = nomeLido ?? `Ambiente ${i + 1}`;
    const classe = nomeLido === undefined ? null : classificarAmbiente(nomeLido);
    if (nomeLido === undefined) pendencias.push(`${nome} sem nome`);
    else if (classe === null) pendencias.push(`${nome}: tipo de ambiente não reconhecido — escolha o tipo`);
    const ambiente: ElementoDe<'ambiente'> = {
      ...base,
      id: novoId(),
      tipo: 'ambiente',
      disciplina: 'arquitetura',
      geometria: { tipo: 'poligono', pontos },
      rotulo: nome,
      props: { nome, tipoAmbiente: classe?.tipo ?? 'outro', areaMolhada: classe?.areaMolhada ?? false, coberto: true },
    };
    elementos.push(ambiente);
  });

  // --- paredes
  const segmentos = desenho.segmentos.map(([a, b]): [Ponto, Ponto] => [mapear(a), mapear(b)]);
  const paredes = detectarParedes(segmentos, escala);
  for (const p of paredes) {
    const parede: ElementoDe<'parede'> = {
      ...base,
      id: novoId(),
      tipo: 'parede',
      disciplina: 'arquitetura',
      geometria: { tipo: 'polilinha', pontos: [p.eixo[0], p.eixo[1]] },
      props: { espessura: p.espessura },
    };
    elementos.push(parede);
  }

  // --- o que falta / avisos
  if (elementos.length === 0) pendencias.push('Nenhum ambiente (polilinha fechada) ou parede (linhas paralelas) foi reconhecido.');
  if (paredes.length > 0) pendencias.push('Paredes: confira as espessuras detectadas e os encontros entre trechos.');
  pendencias.push('O DXF não informa o pé-direito nem a altura das paredes: preencha nos dados essenciais.');
  if (textosSoltos > 0) pendencias.push(`${plural(textosSoltos, 'texto fora de ambientes foi ignorado', 'textos fora de ambientes foram ignorados')}.`);
  if (desenho.polilinhasComArco > 0) {
    pendencias.push(`${plural(desenho.polilinhasComArco, 'polilinha com arco foi simplificada', 'polilinhas com arcos foram simplificadas')} em trechos retos.`);
  }
  const totalIgnoradas = [...desenho.ignoradas.values()].reduce((s, n) => s + n, 0);
  if (totalIgnoradas > 0) {
    const porTipo = [...desenho.ignoradas.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([tipo, n]) => `${n} ${tipo}`)
      .join(', ');
    pendencias.push(`${plural(totalIgnoradas, 'entidade ignorada', 'entidades ignoradas')}: ${porTipo}.`);
  }

  return { elementos, pendencias, escala };
}
