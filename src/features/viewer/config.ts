/** Constantes e estilos do visualizador (sem números mágicos espalhados). */
import type { TipoElemento } from '@/core/model';

// ---------------------------------------------------------------- zoom / vista
export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 16;
/** Fator por "clique" da roda do mouse. */
export const FATOR_ZOOM_RODA = 1.12;
/** Fator dos botões + / −. */
export const FATOR_ZOOM_BOTAO = 1.25;
/** Margem (px) ao ajustar a página à tela. */
export const MARGEM_AJUSTE_PX = 24;

// ---------------------------------------------------------------- renderização do PDF
/** Espera (ms) após o último zoom antes de re-renderizar o PDF em nova resolução. */
export const ATRASO_RENDER_MS = 180;
/** Limite de pixels do canvas do PDF (largura × altura). */
export const MAX_PIXELS_CANVAS = 16_000_000;
/** Resolução da captura (pixels por unidade do PDF). */
export const PIXEL_RATIO_CAPTURA = 2;

// ---------------------------------------------------------------- desenho
/** Tolerância do snap a vértices, em pixels de tela. */
export const TOLERANCIA_SNAP_PX = 10;
/** Distância máxima (px de tela) entre o clique e a parede para posicionar uma esquadria. */
export const TOLERANCIA_PAREDE_PX = 30;
/** Dois cliques a menos que isso (px de tela) contam como o mesmo ponto. */
export const TOLERANCIA_MESMO_PONTO_PX = 0.5;
/** Casas decimais das medidas exibidas (m, m²). */
export const CASAS_MEDIDA = 2;
/** Casas decimais da escala exibida (m por unidade). */
export const CASAS_ESCALA = 4;

// ---------------------------------------------------------------- aparência (px de tela)
export const ESPESSURA_MIN_PAREDE_PX = 3;
export const OPACIDADE_PAREDE = 0.55;
export const RAIO_ALCA_PX = 5;
export const RAIO_VERTICE_PREVIA_PX = 3;
export const TAMANHO_INDICADOR_SNAP_PX = 12;
export const TAMANHO_FONTE_PX = 11;
export const PADDING_ETIQUETA_PX = 2;
export const DESLOCAMENTO_ETIQUETA_PX = 6;
export const LARGURA_EXTRA_SELECAO_PX = 5;
export const LARGURA_TOQUE_PX = 12;
export const LARGURA_DERIVADO_PX = 1;
export const LARGURA_PREVIA_PX = 1.5;
export const TRACEJADO_PENDENTE = [6, 4];
export const TRACEJADO_DERIVADO = [5, 4];
export const TRACEJADO_PREVIA = [4, 3];
export const OPACIDADE_PREVIA = 0.15;

export const COR_SELECAO = '#00e5ff';
export const COR_CALIBRACAO = '#ffb020';
export const COR_SNAP = '#ff3df2';
export const COR_FUNDO_ETIQUETA = '#14161a';
export const OPACIDADE_FUNDO_ETIQUETA = 0.82;
export const COR_TEXTO_ETIQUETA = '#ffffff';
export const COR_TEXTO_SIMBOLO = '#08121f';

// ---------------------------------------------------------------- estilo por tipo de elemento
export type FormaSimbolo = 'circulo' | 'losango' | 'quadrado';

export interface EstiloTipo {
  /** Espessura do traço (px de tela) de linhas e contornos. */
  larguraPx: number;
  /** Tracejado próprio do tipo (px de tela). */
  tracejado?: number[];
  /** Opacidade do preenchimento de polígonos (0 = sem preenchimento). */
  preenchimento: number;
  /** Símbolo usado quando a geometria é um ponto. */
  simbolo: FormaSimbolo;
  /** Lado/diâmetro do símbolo (px de tela). */
  tamanhoPx: number;
  /** Símbolo preenchido (true) ou só contorno (false). */
  simboloCheio: boolean;
  /** Letra dentro do símbolo. */
  letra: string;
}

export const ESTILO_TIPO: Record<TipoElemento, EstiloTipo> = {
  ambiente: { larguraPx: 1.5, preenchimento: 0.18, simbolo: 'circulo', tamanhoPx: 12, simboloCheio: true, letra: '' },
  parede: { larguraPx: ESPESSURA_MIN_PAREDE_PX, preenchimento: 0, simbolo: 'circulo', tamanhoPx: 8, simboloCheio: true, letra: '' },
  esquadria: { larguraPx: 2, preenchimento: 0, simbolo: 'quadrado', tamanhoPx: 12, simboloCheio: true, letra: '' },
  medicao: { larguraPx: 2, preenchimento: 0.12, simbolo: 'circulo', tamanhoPx: 18, simboloCheio: true, letra: '' },
  pilar: { larguraPx: 1.5, preenchimento: 0, simbolo: 'quadrado', tamanhoPx: 10, simboloCheio: true, letra: '' },
  'viga-baldrame': { larguraPx: 3, preenchimento: 0, simbolo: 'quadrado', tamanhoPx: 8, simboloCheio: true, letra: '' },
  'viga-superior': { larguraPx: 2, tracejado: [10, 4], preenchimento: 0, simbolo: 'quadrado', tamanhoPx: 8, simboloCheio: true, letra: '' },
  laje: { larguraPx: 1.5, tracejado: [8, 3, 2, 3], preenchimento: 0.1, simbolo: 'quadrado', tamanhoPx: 12, simboloCheio: false, letra: 'L' },
  fundacao: { larguraPx: 1.5, tracejado: [4, 3], preenchimento: 0.08, simbolo: 'quadrado', tamanhoPx: 24, simboloCheio: false, letra: '' },
  'ponto-eletrico': { larguraPx: 1.5, preenchimento: 0, simbolo: 'circulo', tamanhoPx: 15, simboloCheio: true, letra: '' },
  quadro: { larguraPx: 1.5, preenchimento: 0, simbolo: 'quadrado', tamanhoPx: 16, simboloCheio: true, letra: 'Q' },
  eletroduto: { larguraPx: 1.5, preenchimento: 0, simbolo: 'circulo', tamanhoPx: 8, simboloCheio: true, letra: '' },
  'ponto-hidraulico': { larguraPx: 1.5, preenchimento: 0, simbolo: 'losango', tamanhoPx: 18, simboloCheio: true, letra: 'H' },
  reservatorio: { larguraPx: 1.5, preenchimento: 0, simbolo: 'quadrado', tamanhoPx: 18, simboloCheio: true, letra: 'R' },
  'caixa-inspecao': { larguraPx: 1.5, preenchimento: 0, simbolo: 'quadrado', tamanhoPx: 14, simboloCheio: false, letra: 'C' },
  tubo: { larguraPx: 2, preenchimento: 0, simbolo: 'losango', tamanhoPx: 8, simboloCheio: true, letra: '' },
};

/** Letra do símbolo de ponto elétrico, por tipo de ponto. */
export const LETRA_PONTO_ELETRICO = { luz: 'L', tug: 'T', tue: 'E', interruptor: 'I' } as const;

/** Cor hexadecimal (#rrggbb) com opacidade → #rrggbbaa. */
export function comAlfa(corHex: string, opacidade: number): string {
  const a = Math.round(Math.min(1, Math.max(0, opacidade)) * 255);
  return corHex + a.toString(16).padStart(2, '0');
}
