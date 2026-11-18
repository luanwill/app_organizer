/**
 * Apresentação "analisando a planta": regras puras de revelação dos elementos em função de
 * (fase, progresso). O app controla o tempo; o viewer só desenha o estado recebido.
 */
import type { Disciplina, GeometriaDerivada, Ponto } from '@/core/model';
import { distancia } from '@/core/calc';
import { DURACAO_ELEMENTO_FRACAO } from './config';

export type FaseAnimacao =
  | 'varredura'
  | 'paredes'
  | 'ambientes'
  | 'estrutura'
  | 'eletrica'
  | 'hidraulica'
  | 'materiais'
  | 'concluida';

/** Estado da apresentação (estruturalmente igual ao EstadoAnalise do app). */
export interface AnimacaoPlanta {
  ativa: boolean;
  fase: FaseAnimacao;
  /** 0..1 dentro da fase atual. */
  progresso: number;
  /** Página (1-based) em que a análise acontece. */
  pagina: number;
  /** Ids revelados em cada fase, na ordem em que aparecem. */
  porFase: Partial<Record<FaseAnimacao, string[]>>;
}

export const ORDEM_FASES_ANIMACAO: readonly FaseAnimacao[] = [
  'varredura',
  'paredes',
  'ambientes',
  'estrutura',
  'eletrica',
  'hidraulica',
  'materiais',
  'concluida',
];

export const ROTULO_FASE_ANIMACAO: Record<FaseAnimacao, string> = {
  varredura: 'Lendo a planta…',
  paredes: 'Identificando paredes…',
  ambientes: 'Medindo ambientes…',
  estrutura: 'Lançando estrutura…',
  eletrica: 'Distribuindo pontos elétricos…',
  hidraulica: 'Distribuindo pontos hidráulicos…',
  materiais: 'Levantando materiais…',
  concluida: 'Análise concluída',
};

const indiceFase = (f: FaseAnimacao) => ORDEM_FASES_ANIMACAO.indexOf(f);
const limitar01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** A apresentação está acontecendo (ativa e ainda não concluída). */
export function animacaoEmCurso(a: AnimacaoPlanta | null | undefined): a is AnimacaoPlanta {
  return !!a && a.ativa && a.fase !== 'concluida';
}

/** Fases efetivamente exibidas (mesma regra do app): varredura e materiais sempre; as demais só com elementos. */
export function fasesExibidas(porFase: AnimacaoPlanta['porFase']): FaseAnimacao[] {
  return ORDEM_FASES_ANIMACAO.filter(
    (f) => f !== 'concluida' && (f === 'varredura' || f === 'materiais' || (porFase[f]?.length ?? 0) > 0),
  );
}

/** Progresso geral 0..1 (cada fase exibida pesa igual). */
export function progressoGeral(a: AnimacaoPlanta): number {
  if (a.fase === 'concluida') return 1;
  const fases = fasesExibidas(a.porFase);
  const i = fases.indexOf(a.fase);
  if (i < 0 || fases.length === 0) return 0;
  return (i + limitar01(a.progresso)) / fases.length;
}

export interface PosicaoRevelacao {
  fase: FaseAnimacao;
  /** Posição do id na sequência da fase. */
  ordem: number;
  total: number;
}

/** Índice id → (fase, ordem). Se um id aparece em mais de uma fase, vale a primeira. */
export function indexarRevelacao(porFase: AnimacaoPlanta['porFase']): Map<string, PosicaoRevelacao> {
  const mapa = new Map<string, PosicaoRevelacao>();
  for (const fase of ORDEM_FASES_ANIMACAO) {
    const ids = porFase[fase] ?? [];
    ids.forEach((id, ordem) => {
      if (!mapa.has(id)) mapa.set(id, { fase, ordem, total: ids.length });
    });
  }
  return mapa;
}

/** Instante (0..1 da fase) em que o elemento `ordem` de `total` começa a aparecer. */
export function inicioNaFase(ordem: number, total: number, duracao = DURACAO_ELEMENTO_FRACAO): number {
  if (total <= 1) return 0;
  return (ordem / (total - 1)) * (1 - duracao);
}

/** Progresso (0..1) da animação própria do elemento, dado o progresso da fase. */
export function progressoDoElemento(ordem: number, total: number, progresso: number, duracao = DURACAO_ELEMENTO_FRACAO): number {
  return limitar01((limitar01(progresso) - inicioNaFase(ordem, total, duracao)) / duracao);
}

export type EstadoRevelacao =
  | { tipo: 'normal' }
  | { tipo: 'oculto' }
  | { tipo: 'animando'; fase: FaseAnimacao; t: number };

const NORMAL: EstadoRevelacao = { tipo: 'normal' };
const OCULTO: EstadoRevelacao = { tipo: 'oculto' };

/**
 * Como desenhar o elemento agora: fases futuras → oculto; fase atual → oculto até a sua vez,
 * depois animando (t de 0 a 1) e, ao terminar, normal; fases passadas e ids fora da análise → normal.
 */
export function estadoRevelacao(
  id: string,
  indice: Map<string, PosicaoRevelacao>,
  fase: FaseAnimacao,
  progresso: number,
): EstadoRevelacao {
  const pos = indice.get(id);
  if (!pos) return NORMAL;
  const atual = indiceFase(fase);
  const doElemento = indiceFase(pos.fase);
  if (doElemento < atual) return NORMAL;
  if (doElemento > atual) return OCULTO;
  const p = limitar01(progresso);
  if (p < inicioNaFase(pos.ordem, pos.total)) return OCULTO;
  const t = progressoDoElemento(pos.ordem, pos.total, p);
  return t >= 1 ? NORMAL : { tipo: 'animando', fase: pos.fase, t };
}

/** Quantos elementos da fase já começaram a aparecer (contador da faixa). */
export function quantosRevelados(total: number, progresso: number): number {
  if (total <= 0) return 0;
  const p = limitar01(progresso);
  let n = 0;
  for (let i = 0; i < total; i++) if (p >= inicioNaFase(i, total)) n++;
  return n;
}

/** Fase em que as geometrias derivadas de cada disciplina (sem elemento associado) aparecem. */
const FASE_DA_DISCIPLINA: Record<Disciplina, FaseAnimacao> = {
  arquitetura: 'paredes',
  estrutura: 'estrutura',
  eletrica: 'eletrica',
  hidraulica: 'hidraulica',
  materiais: 'materiais',
};

/**
 * O elemento já fica na camada principal (estático)? Sim para ids fora da análise e de fases
 * passadas. Os da fase atual são desenhados pela camada de animação até a fase terminar — assim a
 * camada principal (com centenas de elementos) só muda nas trocas de fase, não a cada quadro.
 */
export function naCamadaPrincipal(id: string, indice: Map<string, PosicaoRevelacao>, fase: FaseAnimacao): boolean {
  const pos = indice.get(id);
  return !pos || indiceFase(pos.fase) < indiceFase(fase);
}

/**
 * Rota derivada fica oculta até terminar a fase do elemento associado; sem elemento associado
 * (ou com um fora da análise), até terminar a fase da sua disciplina.
 */
export function derivadoOculto(
  d: Pick<GeometriaDerivada, 'disciplina' | 'elementoId'>,
  indice: Map<string, PosicaoRevelacao>,
  fase: FaseAnimacao,
): boolean {
  const pos = d.elementoId !== undefined ? indice.get(d.elementoId) : undefined;
  const faseDaRota = pos ? pos.fase : FASE_DA_DISCIPLINA[d.disciplina];
  return indiceFase(fase) <= indiceFase(faseDaRota);
}

/** Trecho inicial da polilinha com a fração `fracao` (0..1) do comprimento ("traço sendo desenhado"). */
export function polilinhaParcial(pontos: Ponto[], fracao: number, fechada = false): Ponto[] {
  const pts = fechada && pontos.length > 2 ? [...pontos, pontos[0]] : pontos;
  if (pts.length < 2) return pts.slice();
  const f = limitar01(fracao);
  const trechos = pts.slice(1).map((p, i) => distancia(pts[i], p));
  const total = trechos.reduce((s, d) => s + d, 0);
  if (f >= 1 || total === 0) return pts.slice();
  let resta = f * total;
  const saida: Ponto[] = [{ ...pts[0] }];
  for (let i = 0; i < trechos.length; i++) {
    const d = trechos[i];
    if (resta >= d) {
      saida.push({ ...pts[i + 1] });
      resta -= d;
      continue;
    }
    const k = d === 0 ? 0 : resta / d;
    saida.push({ x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k });
    break;
  }
  return saida;
}

export function suavizarSaida(t: number): number {
  const u = 1 - limitar01(t);
  return 1 - u * u * u;
}

/** Ultrapassa um pouco o 1 antes de assentar (efeito "pop"). */
export function suavizarPop(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = limitar01(t) - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

/** Posições das linhas de uma grade (unidades do PDF) que cobre [0, largura] × [0, altura]. */
export function linhasGrade(largura: number, altura: number, passo: number): { xs: number[]; ys: number[] } {
  if (!(passo > 0) || !(largura > 0) || !(altura > 0)) return { xs: [], ys: [] };
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = 0; x <= largura + 1e-9; x += passo) xs.push(x);
  for (let y = 0; y <= altura + 1e-9; y += passo) ys.push(y);
  return { xs, ys };
}
