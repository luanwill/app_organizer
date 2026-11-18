/**
 * Extração dos traços vetoriais e dos textos de uma página de PDF (pdfjs-dist), nas MESMAS coordenadas
 * dos elementos: viewport em escala 1 (origem no canto superior esquerdo, y para baixo, rotação aplicada).
 * Este arquivo não importa o pdfjs: recebe a página aberta e a tabela OPS de quem chama.
 */
import type { Ponto } from '@/core/model';
import type { TextoPosicionado } from './ambientes';

type Matriz = [number, number, number, number, number, number];

/** O mínimo da página do pdfjs usado aqui (PDFPageProxy satisfaz). */
export interface PaginaPdf {
  getOperatorList(): Promise<{ fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }>;
  getTextContent(): Promise<{ items: unknown[] }>;
  getViewport(parametros: { scale: number }): { transform: number[] };
}

export interface TracoVetorial {
  a: Ponto;
  b: Ponto;
  /** Cor do traço (#rrggbb) ou null se desconhecida. */
  cor: string | null;
  /** Largura da linha em unidades da página. */
  largura: number;
  tracejado: boolean;
  /** Veio de um caminho só preenchido (sem contorno). */
  soPreenchido: boolean;
}

/** Área preenchida (poché, hachura sólida, mobiliário...): um ou mais contornos fechados. */
export interface PreenchimentoVetorial {
  /** Contornos fechados (implicitamente; o 1º ponto não se repete), em unidades da página. */
  contornos: Ponto[][];
  /** Cor do preenchimento (#rrggbb) ou null (padrão/sombreamento). */
  cor: string | null;
  /** Regra de preenchimento do PDF: par-ímpar (eoFill) ou não nulo (fill). */
  parImpar: boolean;
}

export interface VetoresDaPagina {
  tracos: TracoVetorial[];
  preenchimentos: PreenchimentoVetorial[];
  /** Cordas dos trechos curvos contornados (início → fim de cada sequência de curvas): giro de portas. */
  arcos: [Ponto, Ponto][];
  textos: TextoPosicionado[];
  /** Curvas encontradas (ignoradas: só trechos retos viram traços). */
  curvasIgnoradas: number;
}

const IDENTIDADE: Matriz = [1, 0, 0, 1, 0, 0];

/** m1 × m2 no sentido do PDF: aplica m2 primeiro, depois m1. */
function multiplicar(m1: Matriz, m2: Matriz): Matriz {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

const aplicar = (m: Matriz, x: number, y: number): Ponto => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

/** Fator de escala médio da matriz (para a largura da linha). */
const fatorDeEscala = (m: Matriz): number => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

const comoMatriz = (v: unknown): Matriz | null =>
  Array.isArray(v) || ArrayBuffer.isView(v)
    ? (() => {
        const n = Array.from(v as ArrayLike<number>);
        return n.length >= 6 && n.slice(0, 6).every(Number.isFinite) ? (n.slice(0, 6) as Matriz) : null;
      })()
    : null;

const hex = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

interface Estado {
  ctm: Matriz;
  cor: string | null;
  corPreenchimento: string | null;
  largura: number;
  tracejado: boolean;
}

/** Subcaminho em coordenadas da página (já transformado). */
interface Subcaminho {
  pontos: Ponto[];
  /** curva[i]: o trecho que chega em pontos[i] é curvo (vira corda no preenchimento, não vira traço). */
  curva: boolean[];
  fechado: boolean;
}

/**
 * Lê os traços (caminhos contornados ou preenchidos; recortes são descartados) e os textos da página.
 * `OPS` é a tabela de operadores do pdfjs-dist em uso (`import { OPS } from 'pdfjs-dist'`).
 */
export async function extrairVetores(pagina: PaginaPdf, OPS: Record<string, number>): Promise<VetoresDaPagina> {
  const viewport = comoMatriz(pagina.getViewport({ scale: 1 }).transform) ?? IDENTIDADE;
  const { fnArray, argsArray } = await pagina.getOperatorList();

  const tracos: TracoVetorial[] = [];
  let curvasIgnoradas = 0;
  let estado: Estado = { ctm: viewport, cor: '#000000', corPreenchimento: '#000000', largura: 1, tracejado: false };
  const preenchimentos: PreenchimentoVetorial[] = [];
  const arcos: [Ponto, Ponto][] = [];
  const pilha: Estado[] = [];
  let pendentes: Subcaminho[] = [];

  const CONTORNA = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const PREENCHE = new Set([OPS.fill, OPS.eoFill]);
  /** Todos os operadores que preenchem (com ou sem contorno). */
  const COM_PREENCHIMENTO = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const PAR_IMPAR = new Set([OPS.eoFill, OPS.eoFillStroke, OPS.closeEOFillStroke]);
  const FECHA = new Set([OPS.closeStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);

  const lerCaminho = (ops: ArrayLike<number>, coords: ArrayLike<number>): void => {
    let atual: Subcaminho | null = null;
    let j = 0;
    const iniciar = (x: number, y: number): void => {
      atual = { pontos: [aplicar(estado.ctm, x, y)], curva: [false], fechado: false };
      pendentes.push(atual);
    };
    const ate = (x: number, y: number, curvo = false): void => {
      if (atual === null) {
        iniciar(x, y);
        return;
      }
      (atual as Subcaminho).pontos.push(aplicar(estado.ctm, x, y));
      (atual as Subcaminho).curva.push(curvo);
    };
    for (let i = 0; i < ops.length; i++) {
      switch (ops[i]) {
        case OPS.moveTo:
          iniciar(coords[j]!, coords[j + 1]!);
          j += 2;
          break;
        case OPS.lineTo:
          ate(coords[j]!, coords[j + 1]!);
          j += 2;
          break;
        case OPS.rectangle: {
          const x = coords[j]!;
          const y = coords[j + 1]!;
          const l = coords[j + 2]!;
          const a = coords[j + 3]!;
          j += 4;
          iniciar(x, y);
          ate(x + l, y);
          ate(x + l, y + a);
          ate(x, y + a);
          (atual as unknown as Subcaminho).fechado = true;
          atual = null;
          break;
        }
        // curvas: só o ponto final interessa — o trecho curvo não vira traço, mas fecha o preenchimento pela corda
        case OPS.curveTo:
          curvasIgnoradas++;
          ate(coords[j + 4]!, coords[j + 5]!, true);
          j += 6;
          break;
        case OPS.curveTo2:
        case OPS.curveTo3:
          curvasIgnoradas++;
          ate(coords[j + 2]!, coords[j + 3]!, true);
          j += 4;
          break;
        case OPS.closePath:
          if (atual !== null) (atual as Subcaminho).fechado = true;
          atual = null;
          break;
        default:
          break;
      }
    }
  };

  const registrarPreenchimento = (parImpar: boolean): void => {
    const contornos = pendentes.map((sub) => sub.pontos).filter((pts) => pts.length >= 3);
    if (contornos.length > 0) preenchimentos.push({ contornos, cor: estado.corPreenchimento, parImpar });
  };

  const emitir = (soPreenchido: boolean, fecharUltimo: boolean): void => {
    const largura = estado.largura * fatorDeEscala(estado.ctm);
    pendentes.forEach((sub, indice) => {
      if (!soPreenchido) {
        // sequências de trechos curvos → uma corda cada
        let inicio = -1;
        for (let i = 1; i <= sub.pontos.length; i++) {
          const curvo = i < sub.pontos.length && sub.curva[i];
          if (curvo && inicio < 0) inicio = i - 1;
          if (!curvo && inicio >= 0) {
            arcos.push([sub.pontos[inicio]!, sub.pontos[i - 1]!]);
            inicio = -1;
          }
        }
      }
      const fechado = sub.fechado || (fecharUltimo && indice === pendentes.length - 1) || soPreenchido;
      const n = sub.pontos.length;
      const total = fechado && n > 2 ? n : n - 1;
      for (let i = 0; i < total; i++) {
        if (i + 1 < n && sub.curva[i + 1]) continue;
        const a = sub.pontos[i]!;
        const b = sub.pontos[(i + 1) % n]!;
        if (a.x === b.x && a.y === b.y) continue;
        tracos.push({ a, b, cor: estado.cor, largura, tracejado: estado.tracejado, soPreenchido });
      }
    });
    pendentes = [];
  };

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i]!;
    const args = argsArray[i] as unknown[] | null;
    if (fn === OPS.save) {
      pilha.push({ ...estado });
    } else if (fn === OPS.restore) {
      estado = pilha.pop() ?? estado;
    } else if (fn === OPS.transform) {
      const m = comoMatriz(args);
      if (m) estado.ctm = multiplicar(estado.ctm, m);
    } else if (fn === OPS.paintFormXObjectBegin) {
      // o pdfjs salva o estado e aplica a matriz do formulário; paintFormXObjectEnd restaura
      pilha.push({ ...estado });
      const m = comoMatriz(args?.[0]);
      if (m) estado.ctm = multiplicar(estado.ctm, m);
    } else if (fn === OPS.paintFormXObjectEnd) {
      estado = pilha.pop() ?? estado;
    } else if (fn === OPS.setLineWidth) {
      if (typeof args?.[0] === 'number') estado.largura = args[0];
    } else if (fn === OPS.setDash) {
      estado.tracejado = Array.isArray(args?.[0]) && args[0].length > 0;
    } else if (fn === OPS.setStrokeRGBColor) {
      const [r, g, b] = (args ?? []) as unknown[];
      if (typeof r === 'number' && typeof g === 'number' && typeof b === 'number') estado.cor = `#${hex(r)}${hex(g)}${hex(b)}`;
      else if (typeof r === 'string') estado.cor = r.toLowerCase();
    } else if (fn === OPS.setFillRGBColor) {
      const [r, g, b] = (args ?? []) as unknown[];
      if (typeof r === 'number' && typeof g === 'number' && typeof b === 'number') estado.corPreenchimento = `#${hex(r)}${hex(g)}${hex(b)}`;
      else if (typeof r === 'string') estado.corPreenchimento = r.toLowerCase();
    } else if (fn === OPS.setFillColorN) {
      estado.corPreenchimento = null; // padrão/sombreamento
    } else if (fn === OPS.setStrokeColorN) {
      estado.cor = null; // padrão/sombreamento
    } else if (fn === OPS.setGState) {
      for (const par of (args?.[0] as unknown[] | undefined) ?? []) {
        if (!Array.isArray(par)) continue;
        if (par[0] === 'LW' && typeof par[1] === 'number') estado.largura = par[1];
        if (par[0] === 'D' && Array.isArray(par[1])) estado.tracejado = Array.isArray(par[1][0]) && par[1][0].length > 0;
      }
    } else if (fn === OPS.constructPath) {
      const ops = args?.[0] as ArrayLike<number> | undefined;
      const coords = args?.[1] as ArrayLike<number> | undefined;
      if (ops && coords) lerCaminho(ops, coords);
    } else if (CONTORNA.has(fn)) {
      if (COM_PREENCHIMENTO.has(fn)) registrarPreenchimento(PAR_IMPAR.has(fn));
      emitir(false, FECHA.has(fn));
    } else if (PREENCHE.has(fn)) {
      registrarPreenchimento(PAR_IMPAR.has(fn));
      emitir(true, false);
    } else if (fn === OPS.endPath) {
      pendentes = []; // caminho de recorte ou descartado
    }
  }

  // --- textos: centro de cada item, na página
  const textos: TextoPosicionado[] = [];
  const conteudo = await pagina.getTextContent();
  for (const bruto of conteudo.items) {
    const item = bruto as { str?: unknown; transform?: unknown; width?: unknown; height?: unknown };
    const m = comoMatriz(item.transform);
    if (typeof item.str !== 'string' || item.str.trim() === '' || !m) continue;
    const largura = typeof item.width === 'number' ? item.width : 0;
    const altura = typeof item.height === 'number' ? item.height : 0;
    const escalaX = Math.hypot(m[0], m[1]);
    const escalaY = Math.hypot(m[2], m[3]);
    // largura/altura já vêm no espaço do usuário: anda meio comprimento na direção do texto e meia altura para cima
    const cx = m[4] + (escalaX > 0 ? (m[0] / escalaX) * (largura / 2) : 0) + (escalaY > 0 ? (m[2] / escalaY) * (altura / 2) : 0);
    const cy = m[5] + (escalaX > 0 ? (m[1] / escalaX) * (largura / 2) : 0) + (escalaY > 0 ? (m[3] / escalaY) * (altura / 2) : 0);
    textos.push({ texto: item.str.trim(), ponto: aplicar(viewport, cx, cy) });
  }

  return { tracos, preenchimentos, arcos, textos, curvasIgnoradas };
}

/**
 * Prepara os vetores da página para o reconhecimento: linhas tracejadas saem (projeções, eixos), os
 * contornos de áreas só preenchidas (hachuras sólidas, setas) ficam sem prioridade de traço e as áreas
 * preenchidas seguem para o método do poché.
 */
export function paraEntradaDoReconhecimento(vetores: VetoresDaPagina): {
  segmentos: [Ponto, Ponto][];
  larguras: number[];
  textos: TextoPosicionado[];
  preenchimentos: PreenchimentoVetorial[];
  arcos: [Ponto, Ponto][];
} {
  const tracos = vetores.tracos.filter((t) => !t.tracejado);
  return {
    segmentos: tracos.map((t): [Ponto, Ponto] => [t.a, t.b]),
    larguras: tracos.map((t) => (t.soPreenchido ? 0 : t.largura)),
    textos: vetores.textos,
    preenchimentos: vetores.preenchimentos,
    arcos: vetores.arcos,
  };
}
