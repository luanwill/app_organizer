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
/** Fonte do rótulo sempre visível de elementos de ponto (ex.: P1 do pilar). */
export const TAMANHO_FONTE_PEQUENA_PX = 9;
/** Margem (px de tela) do nome do ambiente em relação ao canto superior esquerdo interno. */
export const MARGEM_ROTULO_AMBIENTE_PX = 6;
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
  telhado: { larguraPx: 1.5, preenchimento: 0.07, simbolo: 'quadrado', tamanhoPx: 12, simboloCheio: false, letra: 'T' },
  // calha/rufo: linha grossa (rufo tracejado: TRACEJADO_RUFO); condutor (ponto): círculo "CD"
  calha: { larguraPx: 3.5, preenchimento: 0, simbolo: 'circulo', tamanhoPx: 19, simboloCheio: true, letra: 'CD' },
};

/** Tracejado do rufo (px de tela). */
export const TRACEJADO_RUFO = [7, 3, 2, 3];
/** Polígonos com hachura diagonal discreta. */
export const TIPOS_HACHURADOS: readonly TipoElemento[] = ['laje', 'telhado'];
/** Espaçamento da hachura (px de tela) e opacidade das linhas. */
export const PASSO_HACHURA_PX = 10;
export const OPACIDADE_HACHURA = 0.35;
/** Cumeeira/espigões do telhado (px de tela). */
export const LARGURA_CUMEEIRA_PX = 1.5;
export const TRACEJADO_CUMEEIRA = [8, 4];

/**
 * Elementos de ponto cujo rótulo de texto fica sempre visível (em fonte pequena). Nos demais, o
 * texto só aparece com o elemento selecionado ou sob o mouse — evita rótulos sobrepostos.
 */
export const TIPOS_PONTO_COM_ROTULO_FIXO: readonly TipoElemento[] = ['pilar', 'esquadria'];

/** Letra do símbolo de ponto elétrico, por tipo de ponto. */
export const LETRA_PONTO_ELETRICO = { luz: 'L', tug: 'T', tue: 'E', interruptor: 'I' } as const;

/** Cor hexadecimal (#rrggbb) com opacidade → #rrggbbaa. */
export function comAlfa(corHex: string, opacidade: number): string {
  const a = Math.round(Math.min(1, Math.max(0, opacidade)) * 255);
  return corHex + a.toString(16).padStart(2, '0');
}

// ---------------------------------------------------------------- animação "analisando a planta"
/** Cor de destaque do tema (= --destaque de src/app/tema.css; o Konva precisa do valor literal). */
export const COR_DESTAQUE = '#4da3ff';
/** Cor das calhas e condutores na apresentação. */
export const COR_CALHA_ANIMACAO = '#8fd8ff';
/** Quanto o telhado "sobe" ao aparecer (px de tela). */
export const SUBIDA_TELHADO_PX = 18;
/** Preenchimento mínimo dos polígonos enquanto surgem. */
export const OPACIDADE_MIN_PREENCHIMENTO_ANIMACAO = 0.12;
/** Fração da fase que a animação de UM elemento dura (os elementos entram em sequência). */
export const DURACAO_ELEMENTO_FRACAO = 0.3;
/** Escurecimento do PDF na faixa ainda não varrida. */
export const OPACIDADE_ESCURECIMENTO = 0.25;
/** Halo do scanner (px de tela, acima da linha). */
export const HALO_SCANNER_PX = 70;
export const LARGURA_SCANNER_PX = 2;
export const BRILHO_SCANNER_PX = 14;
/** Espaçamento da grade técnica (px de tela) e a cada quantas linhas vem uma principal. */
export const PASSO_GRADE_PX = 28;
export const GRADE_PRINCIPAL_A_CADA = 5;
export const OPACIDADE_GRADE = 0.22;
/** Opacidade da grade nas fases seguintes à varredura. */
export const OPACIDADE_GRADE_FUNDO = 0.08;
/** Brilho que acompanha o traço sendo desenhado: px de tela além da largura do traço. */
export const BRILHO_TRACO_PX = 9;
export const OPACIDADE_BRILHO_TRACO = 0.55;
export const RAIO_CABECA_TRACO_PX = 3.5;
/** Fração da animação do ponto dedicada ao "pop" (o resto é o pulso). */
export const FRACAO_POP = 0.45;
/** Raio máximo do pulso (px de tela) a partir do símbolo. */
export const RAIO_PULSO_PX = 22;
/** Brilho final rápido no início da fase 'materiais' (fração da fase) e sua opacidade máxima. */
export const FRACAO_BRILHO_FINAL = 0.25;
export const OPACIDADE_BRILHO_FINAL = 0.22;
