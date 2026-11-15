/** Conversões tela ↔ PDF e operações de zoom/enquadramento. Lógica pura. */
import type { Ponto } from '@/core/model';
import { ZOOM_MAX, ZOOM_MIN } from './config';

/** Transformação da vista: tela = pdf × zoom + (x, y). */
export interface Vista {
  zoom: number;
  x: number;
  y: number;
}

export const VISTA_INICIAL: Vista = { zoom: 1, x: 0, y: 0 };

export function telaParaPdf(vista: Vista, tela: Ponto): Ponto {
  return { x: (tela.x - vista.x) / vista.zoom, y: (tela.y - vista.y) / vista.zoom };
}

export function pdfParaTela(vista: Vista, pdf: Ponto): Ponto {
  return { x: pdf.x * vista.zoom + vista.x, y: pdf.y * vista.zoom + vista.y };
}

export function limitarZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** Muda o zoom mantendo fixo o ponto do PDF que está sob `pontoTela` (cursor). */
export function zoomNoPonto(vista: Vista, pontoTela: Ponto, novoZoom: number): Vista {
  const zoom = limitarZoom(novoZoom);
  const pdf = telaParaPdf(vista, pontoTela);
  return { zoom, x: pontoTela.x - pdf.x * zoom, y: pontoTela.y - pdf.y * zoom };
}

/** Enquadra a página inteira no contêiner, centralizada, com margem. */
export function ajustarATela(
  larguraPagina: number,
  alturaPagina: number,
  larguraConteiner: number,
  alturaConteiner: number,
  margem: number,
): Vista {
  if (larguraPagina <= 0 || alturaPagina <= 0) return VISTA_INICIAL;
  const livreL = Math.max(1, larguraConteiner - 2 * margem);
  const livreA = Math.max(1, alturaConteiner - 2 * margem);
  const zoom = limitarZoom(Math.min(livreL / larguraPagina, livreA / alturaPagina));
  return {
    zoom,
    x: (larguraConteiner - larguraPagina * zoom) / 2,
    y: (alturaConteiner - alturaPagina * zoom) / 2,
  };
}

/** Escala de renderização do PDF (px por unidade) para ficar nítido no zoom, respeitando o limite de pixels. */
export function escalaRenderizacao(
  zoom: number,
  pixelRatio: number,
  larguraPagina: number,
  alturaPagina: number,
  maxPixels: number,
): number {
  const desejada = zoom * pixelRatio;
  const maxima = Math.sqrt(maxPixels / Math.max(1, larguraPagina * alturaPagina));
  return Math.min(desejada, maxima);
}
