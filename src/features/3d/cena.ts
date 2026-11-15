/**
 * Cena 3D derivada do projeto — função PURA (sem three.js nem React), em METROS.
 * Origem no canto da caixa envolvente dos elementos da página; eixo Y para cima;
 * planta x → X, planta y → Z. Nível 0 = piso.
 */
import type {
  Disciplina,
  Elemento,
  ElementoDe,
  Ponto,
  Projeto,
  Status,
  TipoElemento,
  TipoEsquadria,
} from '@/core/model';
import { caixaEnvolvente, distancia, escalaValida, projetarNaPolilinha } from '@/core/calc';
import { alturaDoPilar } from '@/features/estrutura/calcular';
import { DIMENSAO_MINIMA_M, NIVEL_PISO_M } from './config';

export interface Vetor3 {
  x: number;
  y: number;
  z: number;
}

interface Identidade {
  elementoId: string;
  disciplina: Disciplina;
  status: Status;
  tipo: TipoElemento;
}

/** Parte de uma parede recortada por vãos. */
export type ParteParede = 'pano' | 'peitoril' | 'verga';

export interface SolidoCaixa extends Identidade {
  forma: 'caixa';
  centro: Vetor3;
  /** Ao longo do eixo local X (antes da rotação). */
  comprimento: number;
  /** Ao longo de Y. */
  altura: number;
  /** Ao longo do eixo local Z. */
  largura: number;
  /** Rotação em torno de Y (rad), na convenção do three.js: o eixo local X aponta para (cos, 0, −sen). */
  rotacaoY: number;
  parte?: ParteParede;
}

export interface SolidoPrisma extends Identidade {
  forma: 'prisma';
  /** Contorno em planta (m). */
  contorno: { x: number; z: number }[];
  /** Nível da face inferior (m). */
  base: number;
  altura: number;
}

export type Solido = SolidoCaixa | SolidoPrisma;

export interface Marcador extends Identidade {
  posicao: Vetor3;
}

export interface Cena {
  solidos: Solido[];
  marcadores: Marcador[];
  alertas: string[];
}

/** Volume do sólido (m³). */
export function volumeDoSolido(s: Solido): number {
  if (s.forma === 'caixa') return s.comprimento * s.altura * s.largura;
  let soma = 0;
  for (let i = 0; i < s.contorno.length; i++) {
    const p = s.contorno[i]!;
    const q = s.contorno[(i + 1) % s.contorno.length]!;
    soma += p.x * q.z - q.x * p.z;
  }
  return (Math.abs(soma) / 2) * s.altura;
}

const informado = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

export function montarCena(projeto: Projeto, pagina: number): Cena {
  const solidos: Solido[] = [];
  const marcadores: Marcador[] = [];
  const alertas: string[] = [];
  const alertar = (mensagem: string): void => {
    if (!alertas.includes(mensagem)) alertas.push(mensagem);
  };

  const elementos = projeto.elementos.filter((e) => e.pagina === pagina);
  if (elementos.length === 0) return { solidos, marcadores, alertas };

  const escala = projeto.paginas[pagina]?.escala;
  if (!escalaValida(escala)) {
    alertar(`Página ${pagina} sem escala — calibre a escala para ver o 3D.`);
    return { solidos, marcadores, alertas };
  }

  const { gerais, estrutura, eletrica, hidraulica } = projeto.parametros;
  const peDireito = gerais.peDireito;
  const alturaVigaSuperior = estrutura.vigaSuperior.ativa ? estrutura.vigaSuperior.secaoH : 0;

  // --- planta (unidades da página) → metros, com origem no canto da caixa envolvente
  const caixa = caixaEnvolvente(
    elementos.flatMap((e) => (e.geometria.tipo === 'ponto' ? [e.geometria.ponto] : e.geometria.pontos)),
  );
  const mx = (p: Ponto): number => (p.x - caixa.minX) * escala;
  const mz = (p: Ponto): number => (p.y - caixa.minY) * escala;

  const identidade = (e: Elemento): Identidade => ({
    elementoId: e.id,
    disciplina: e.disciplina,
    status: e.status,
    tipo: e.tipo,
  });

  /** Caixa ao longo do segmento a–b, entre as posições s0..s1 (m) e os níveis y0..y1 (m). */
  const caixaNoSegmento = (
    e: Elemento,
    a: Ponto,
    b: Ponto,
    s0: number,
    s1: number,
    y0: number,
    y1: number,
    largura: number,
    parte?: ParteParede,
  ): void => {
    const comprimentoSegmento = distancia(a, b) * escala;
    if (s1 - s0 <= DIMENSAO_MINIMA_M || y1 - y0 <= DIMENSAO_MINIMA_M || comprimentoSegmento <= DIMENSAO_MINIMA_M) return;
    const dx = (mx(b) - mx(a)) / comprimentoSegmento;
    const dz = (mz(b) - mz(a)) / comprimentoSegmento;
    const meio = (s0 + s1) / 2;
    solidos.push({
      ...identidade(e),
      forma: 'caixa',
      centro: { x: mx(a) + dx * meio, y: (y0 + y1) / 2, z: mz(a) + dz * meio },
      comprimento: s1 - s0,
      altura: y1 - y0,
      largura,
      rotacaoY: -Math.atan2(dz, dx),
      ...(parte ? { parte } : {}),
    });
  };

  const caixaNoPonto = (e: Elemento, p: Ponto, ladoX: number, ladoZ: number, y0: number, y1: number): void => {
    if (y1 - y0 <= DIMENSAO_MINIMA_M) return;
    solidos.push({
      ...identidade(e),
      forma: 'caixa',
      centro: { x: mx(p), y: (y0 + y1) / 2, z: mz(p) },
      comprimento: ladoX,
      altura: y1 - y0,
      largura: ladoZ,
      rotacaoY: 0,
    });
  };

  const prisma = (e: Elemento, pontos: Ponto[], base: number, altura: number): void => {
    if (pontos.length < 3 || altura <= DIMENSAO_MINIMA_M) return;
    solidos.push({
      ...identidade(e),
      forma: 'prisma',
      contorno: pontos.map((p) => ({ x: mx(p), z: mz(p) })),
      base,
      altura,
    });
  };

  const marcador = (e: Elemento, p: Ponto, y: number): void => {
    marcadores.push({ ...identidade(e), posicao: { x: mx(p), y, z: mz(p) } });
  };

  // --- esquadrias por parede hospedeira
  const tiposEsquadria = new Map<string, TipoEsquadria>(projeto.esquadrias.map((t) => [t.id, t]));
  const ambientes = new Map<string, ElementoDe<'ambiente'>>();
  const esquadriasPorParede = new Map<string, { ponto: Ponto; tipo: TipoEsquadria }[]>();
  for (const e of elementos) {
    if (e.tipo === 'ambiente') ambientes.set(e.id, e);
    if (e.tipo !== 'esquadria' || e.geometria.tipo !== 'ponto') continue;
    const paredeId = e.vinculos.paredeId;
    const tipo = tiposEsquadria.get(e.props.tipoEsquadriaId);
    if (!paredeId) {
      alertar('Esquadria sem parede hospedeira — o vão não foi recortado.');
      continue;
    }
    if (!tipo) {
      alertar('Esquadria sem tipo no cadastro — o vão não foi recortado.');
      continue;
    }
    const lista = esquadriasPorParede.get(paredeId) ?? [];
    lista.push({ ponto: e.geometria.ponto, tipo });
    esquadriasPorParede.set(paredeId, lista);
  }

  /** Pé-direito que vale para um ponto: o do ambiente vinculado, senão o geral. */
  const peDireitoDe = (e: Elemento): number | null => {
    const ambiente = e.vinculos.ambienteId ? ambientes.get(e.vinculos.ambienteId) : undefined;
    return ambiente?.props.peDireito ?? peDireito;
  };

  for (const e of elementos) {
    switch (e.tipo) {
      case 'parede': {
        if (e.geometria.tipo !== 'polilinha') break;
        const espessura = e.props.espessura;
        const altura = e.props.altura ?? peDireito;
        if (!informado(altura)) {
          alertar('Pé-direito não informado — paredes e pilares não foram extrudados');
          break;
        }
        if (!informado(espessura)) {
          alertar('Parede sem espessura informada — não foi extrudada');
          break;
        }
        const pontos = e.geometria.pontos;
        const vaosPorSegmento = new Map<number, { inicio: number; fim: number; baixo: number; cima: number }[]>();
        for (const { ponto, tipo } of esquadriasPorParede.get(e.id) ?? []) {
          const proj = projetarNaPolilinha(ponto, pontos);
          if (proj.indiceSegmento < 0) continue;
          const a = pontos[proj.indiceSegmento]!;
          const b = pontos[proj.indiceSegmento + 1];
          if (!b) continue;
          const comprimento = distancia(a, b) * escala;
          const posicao = proj.t * comprimento;
          const vaos = vaosPorSegmento.get(proj.indiceSegmento) ?? [];
          vaos.push({
            inicio: Math.max(0, posicao - tipo.largura / 2),
            fim: Math.min(comprimento, posicao + tipo.largura / 2),
            baixo: Math.min(Math.max(0, tipo.peitoril), altura),
            cima: Math.min(Math.max(0, tipo.peitoril) + tipo.altura, altura),
          });
          vaosPorSegmento.set(proj.indiceSegmento, vaos);
        }

        for (let i = 0; i + 1 < pontos.length; i++) {
          const a = pontos[i]!;
          const b = pontos[i + 1]!;
          const comprimento = distancia(a, b) * escala;
          const vaos = (vaosPorSegmento.get(i) ?? []).sort((p, q) => p.inicio - q.inicio);
          let cursor = 0;
          for (const vao of vaos) {
            const inicio = Math.max(vao.inicio, cursor); // vãos sobrepostos: o segundo começa onde o primeiro acaba
            if (vao.fim <= inicio) continue;
            caixaNoSegmento(e, a, b, cursor, inicio, 0, altura, espessura, 'pano');
            caixaNoSegmento(e, a, b, inicio, vao.fim, 0, vao.baixo, espessura, 'peitoril');
            caixaNoSegmento(e, a, b, inicio, vao.fim, vao.cima, altura, espessura, 'verga');
            cursor = vao.fim;
          }
          caixaNoSegmento(e, a, b, cursor, comprimento, 0, altura, espessura, 'pano');
        }
        break;
      }

      case 'pilar': {
        if (e.geometria.tipo !== 'ponto') break;
        const altura = alturaDoPilar(e, projeto);
        if (altura === null) {
          alertar('Pé-direito não informado — paredes e pilares não foram extrudados');
          break;
        }
        caixaNoPonto(e, e.geometria.ponto, e.props.secaoB, e.props.secaoH, NIVEL_PISO_M, NIVEL_PISO_M + altura);
        break;
      }

      case 'viga-baldrame':
      case 'viga-superior': {
        if (e.geometria.tipo !== 'polilinha') break;
        let topo = NIVEL_PISO_M; // baldrame: topo no nível do piso
        if (e.tipo === 'viga-superior') {
          if (peDireito === null) {
            alertar('Pé-direito não informado — vigas superiores e lajes não foram posicionadas');
            break;
          }
          topo = peDireito + e.props.secaoH; // base no pé-direito (topo das paredes)
        }
        const pontos = e.geometria.pontos;
        for (let i = 0; i + 1 < pontos.length; i++) {
          const a = pontos[i]!;
          const b = pontos[i + 1]!;
          caixaNoSegmento(e, a, b, 0, distancia(a, b) * escala, topo - e.props.secaoH, topo, e.props.secaoB);
        }
        break;
      }

      case 'laje': {
        if (e.geometria.tipo !== 'poligono') break;
        if (peDireito === null) {
          alertar('Pé-direito não informado — vigas superiores e lajes não foram posicionadas');
          break;
        }
        prisma(e, e.geometria.pontos, peDireito + alturaVigaSuperior, e.props.espessura);
        break;
      }

      case 'fundacao': {
        const { sapata, bloco, radier } = estrutura.fundacao;
        if (e.props.tipoFundacao === 'radier') {
          if (e.geometria.tipo === 'poligono') prisma(e, e.geometria.pontos, NIVEL_PISO_M - radier.espessura, radier.espessura);
          break;
        }
        if (e.geometria.tipo !== 'ponto') break;
        const dimensoes = e.props.tipoFundacao === 'sapata' ? sapata : bloco;
        const topo = NIVEL_PISO_M - estrutura.baldrame.secaoH; // logo abaixo do baldrame
        caixaNoPonto(e, e.geometria.ponto, dimensoes.ladoA, dimensoes.ladoB, topo - dimensoes.altura, topo);
        break;
      }

      case 'ponto-eletrico': {
        if (e.geometria.tipo !== 'ponto') break;
        if (e.props.altura === 'teto') {
          const teto = peDireitoDe(e);
          if (!informado(teto)) {
            alertar('Pé-direito não informado — pontos de teto e reservatório não foram posicionados');
            break;
          }
          marcador(e, e.geometria.ponto, teto);
        } else {
          marcador(e, e.geometria.ponto, eletrica.alturas[e.props.altura]);
        }
        break;
      }

      case 'quadro':
        if (e.geometria.tipo === 'ponto') marcador(e, e.geometria.ponto, eletrica.alturas.media);
        break;

      case 'ponto-hidraulico':
        if (e.geometria.tipo === 'ponto') marcador(e, e.geometria.ponto, hidraulica.alturaPontoM[e.props.aparelho]);
        break;

      case 'reservatorio': {
        if (e.geometria.tipo !== 'ponto') break;
        const teto = peDireitoDe(e);
        if (!informado(teto)) {
          alertar('Pé-direito não informado — pontos de teto e reservatório não foram posicionados');
          break;
        }
        marcador(e, e.geometria.ponto, teto);
        break;
      }

      case 'caixa-inspecao':
        if (e.geometria.tipo === 'ponto') marcador(e, e.geometria.ponto, NIVEL_PISO_M);
        break;

      default:
        // ambientes, esquadrias (viram vãos), medições, eletrodutos e tubos não geram sólidos
        break;
    }
  }

  return { solidos, marcadores, alertas };
}
