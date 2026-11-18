/**
 * Legibilidade das etiquetas na planta: onde cada uma fica, quais aparecem (prioridade, zoom,
 * hover/seleção e colisão) e o tamanho dos símbolos quando há muitos. Lógica pura.
 */
import type { Elemento, Ponto } from '@/core/model';
import { centroidePoligono } from '@/core/calc';
import {
  CELULA_COLISAO_PX,
  DESLOCAMENTO_ETIQUETA_PX,
  ESPACO_REF_SIMBOLO_PX,
  ESTILO_TIPO,
  FATOR_MIN_SIMBOLO,
  FOLGA_COLISAO_PX,
  LARGURA_CARACTERE,
  LIMIAR_PX_POR_METRO,
  MARGEM_ROTULO_AMBIENTE_PX,
  PADDING_ETIQUETA_PX,
  PRIORIDADE_ETIQUETA,
  PRIORIDADE_SEMPRE_VISIVEL,
  TAMANHO_FONTE_PEQUENA_PX,
  TAMANHO_FONTE_PX,
} from './config';
import { ancoraRotuloAmbiente, ancoraRotuloTelhado } from './rotulos';

/** Como a etiqueta se prende à âncora: centralizada, com o canto superior esquerdo nela, ou à direita (pontos). */
export type ModoAncora = 'centro' | 'canto' | 'direita';

export interface AncoraEtiqueta {
  /** Unidades do PDF. */
  ponto: Ponto;
  modo: ModoAncora;
  /** Deslocamento horizontal (px de tela) no modo 'direita'. */
  deslocamentoPx: number;
}

function pontoMedio(pontos: Ponto[]): Ponto {
  const i = Math.max(0, Math.floor((pontos.length - 1) / 2));
  const a = pontos[i];
  const b = pontos[Math.min(pontos.length - 1, i + 1)];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Âncora da etiqueta do elemento (`pontos` = vértices atuais; `fatorSimbolo` = tamanho relativo dos símbolos). */
export function ancoraEtiqueta(el: Elemento, pontos: Ponto[], zoom: number, fatorSimbolo = 1): AncoraEtiqueta {
  if (el.geometria.tipo === 'ponto') {
    const meio = (ESTILO_TIPO[el.tipo].tamanhoPx * fatorSimbolo) / 2;
    return { ponto: el.geometria.ponto, modo: 'direita', deslocamentoPx: meio + DESLOCAMENTO_ETIQUETA_PX };
  }
  if (el.geometria.tipo === 'polilinha') return { ponto: pontoMedio(pontos), modo: 'centro', deslocamentoPx: 0 };
  // polígonos: ambiente no canto superior esquerdo interno (o centro costuma ter o ponto de luz);
  // telhado no topo (faixa do beiral); demais no centroide
  if (el.tipo === 'ambiente') {
    return { ponto: ancoraRotuloAmbiente(pontos, MARGEM_ROTULO_AMBIENTE_PX / zoom), modo: 'canto', deslocamentoPx: 0 };
  }
  if (el.tipo === 'telhado') {
    const meiaAltura = (TAMANHO_FONTE_PX / 2 + PADDING_ETIQUETA_PX) / zoom;
    return { ponto: ancoraRotuloTelhado(pontos, MARGEM_ROTULO_AMBIENTE_PX / zoom, meiaAltura), modo: 'centro', deslocamentoPx: 0 };
  }
  return { ponto: centroidePoligono(pontos), modo: 'centro', deslocamentoPx: 0 };
}

/** Tamanho estimado (px) da etiqueta, com fundo e padding. */
export function tamanhoEtiqueta(texto: string, fontePx: number): { largura: number; altura: number } {
  const linhas = texto.split('\n');
  const maior = Math.max(...linhas.map((l) => l.length));
  return {
    largura: maior * fontePx * LARGURA_CARACTERE + 2 * PADDING_ETIQUETA_PX,
    altura: linhas.length * fontePx + 2 * PADDING_ETIQUETA_PX,
  };
}

export interface Caixa {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Caixa da etiqueta em px "de página ampliada" (PDF × zoom; o pan não altera colisões). */
export function caixaEtiqueta(ancora: AncoraEtiqueta, texto: string, fontePx: number, zoom: number): Caixa {
  const { largura, altura } = tamanhoEtiqueta(texto, fontePx);
  const x = ancora.ponto.x * zoom;
  const y = ancora.ponto.y * zoom;
  if (ancora.modo === 'canto') return { x0: x, y0: y, x1: x + largura, y1: y + altura };
  if (ancora.modo === 'direita') {
    const x0 = x + ancora.deslocamentoPx;
    return { x0, y0: y - altura / 2, x1: x0 + largura, y1: y + altura / 2 };
  }
  return { x0: x - largura / 2, y0: y - altura / 2, x1: x + largura / 2, y1: y + altura / 2 };
}

/** Fonte da etiqueta: normal quando destacada (hover/seleção) ou sempre visível; pequena nos demais casos. */
export function fonteEtiqueta(el: Elemento, destacado: boolean): number {
  return destacado || PRIORIDADE_ETIQUETA[el.tipo] >= PRIORIDADE_SEMPRE_VISIVEL || el.geometria.tipo !== 'ponto'
    ? TAMANHO_FONTE_PX
    : TAMANHO_FONTE_PEQUENA_PX;
}

/** A etiqueta pode aparecer sem hover/seleção neste zoom? (`pxPorMetro` null = página sem escala) */
export function liberadaPeloZoom(prioridade: number, pxPorMetro: number | null): boolean {
  if (prioridade >= PRIORIDADE_SEMPRE_VISIVEL) return true;
  const limiar = LIMIAR_PX_POR_METRO[prioridade];
  if (limiar === undefined) return false;
  if (limiar === 0) return true;
  return pxPorMetro !== null && pxPorMetro >= limiar;
}

export interface CandidatoEtiqueta {
  id: string;
  prioridade: number;
  /** Hover ou seleção: aparece sempre e na frente da fila. */
  destacado: boolean;
  caixa: Caixa;
}

const sobrepoe = (a: Caixa, b: Caixa, folga: number) =>
  a.x0 < b.x1 + folga && b.x0 < a.x1 + folga && a.y0 < b.y1 + folga && b.y0 < a.y1 + folga;

/**
 * Escolhe as etiquetas visíveis: destacadas e sempre visíveis entram sempre; as demais, por
 * prioridade (empate: ordem de chegada), só se não colidirem com uma já escolhida.
 * Índice espacial em grade → custo ~linear para centenas de etiquetas.
 */
export function escolherEtiquetas(candidatos: CandidatoEtiqueta[], folga = FOLGA_COLISAO_PX, celula = CELULA_COLISAO_PX): Set<string> {
  const ordem = candidatos
    .map((c, i) => ({ c, i }))
    .sort((a, b) => Number(b.c.destacado) - Number(a.c.destacado) || b.c.prioridade - a.c.prioridade || a.i - b.i);
  const grade = new Map<string, Caixa[]>();
  const celulas = (k: Caixa) => {
    const r: string[] = [];
    for (let cx = Math.floor((k.x0 - folga) / celula); cx <= Math.floor((k.x1 + folga) / celula); cx++)
      for (let cy = Math.floor((k.y0 - folga) / celula); cy <= Math.floor((k.y1 + folga) / celula); cy++) r.push(`${cx},${cy}`);
    return r;
  };
  const escolhidas = new Set<string>();
  for (const { c } of ordem) {
    const chaves = celulas(c.caixa);
    const forcada = c.destacado || c.prioridade >= PRIORIDADE_SEMPRE_VISIVEL;
    if (!forcada && chaves.some((k) => grade.get(k)?.some((o) => sobrepoe(o, c.caixa, folga)))) continue;
    escolhidas.add(c.id);
    for (const k of chaves) {
      const lista = grade.get(k);
      if (lista) lista.push(c.caixa);
      else grade.set(k, [c.caixa]);
    }
  }
  return escolhidas;
}

/**
 * Distância típica (mediana do vizinho mais próximo, unidades do PDF) entre os símbolos de ponto.
 * Mede a densidade local — pontos agrupados num banheiro contam, mesmo numa folha grande.
 * null com menos de 2 pontos. Índice em grade para não ser quadrático.
 */
export function distanciaTipicaEntrePontos(pontos: Ponto[]): number | null {
  if (pontos.length < 2) return null;
  const xs = pontos.map((p) => p.x);
  const ys = pontos.map((p) => p.y);
  const largura = Math.max(...xs) - Math.min(...xs);
  const altura = Math.max(...ys) - Math.min(...ys);
  // célula pela maior dimensão: evita células minúsculas quando os pontos estão alinhados
  const celula = Math.max(1e-9, Math.max(largura, altura) / Math.sqrt(pontos.length));
  const grade = new Map<string, number[]>();
  const chave = (cx: number, cy: number) => `${cx},${cy}`;
  pontos.forEach((p, i) => {
    const k = chave(Math.floor(p.x / celula), Math.floor(p.y / celula));
    const l = grade.get(k);
    if (l) l.push(i);
    else grade.set(k, [i]);
  });
  const vizinhos: number[] = [];
  pontos.forEach((p, i) => {
    const cx = Math.floor(p.x / celula);
    const cy = Math.floor(p.y / celula);
    let melhor = Infinity;
    // anéis crescentes até achar um vizinho e garantir que nenhum anel mais externo seja melhor
    for (let r = 0; r < 1e6; r++) {
      for (let dx = -r; dx <= r; dx++)
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          for (const j of grade.get(chave(cx + dx, cy + dy)) ?? []) {
            if (j === i) continue;
            melhor = Math.min(melhor, Math.hypot(pontos[j].x - p.x, pontos[j].y - p.y));
          }
        }
      if (melhor <= r * celula) break;
    }
    vizinhos.push(melhor);
  });
  vizinhos.sort((a, b) => a - b);
  return vizinhos[Math.floor(vizinhos.length / 2)];
}

/** Fator (mínimo..1) do tamanho dos símbolos de ponto: menores quando ficam apertados na tela. */
export function fatorSimbolo(distanciaTipica: number | null, zoom: number): number {
  if (distanciaTipica === null) return 1;
  return Math.min(1, Math.max(FATOR_MIN_SIMBOLO, (distanciaTipica * zoom) / ESPACO_REF_SIMBOLO_PX));
}

/** Pixels de tela por metro (null sem escala). */
export function pixelsPorMetro(zoom: number, escala: number | null): number | null {
  return escala !== null && escala > 0 ? zoom / escala : null;
}
