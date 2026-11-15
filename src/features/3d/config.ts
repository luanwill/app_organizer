/** Constantes da vista 3D. */
import type { Disciplina } from '@/core/model';

/** Abaixo disto (m) um trecho/caixa é desprezado (evita sólidos degenerados). */
export const DIMENSAO_MINIMA_M = 1e-6;

/**
 * Altura dos marcadores sem altura própria no contrato:
 *  - quadro: na posição "média" da elétrica (parametros.eletrica.alturas.media);
 *  - reservatório: no nível do teto (pé-direito);
 *  - caixa de inspeção: no nível do piso.
 */
export const NIVEL_PISO_M = 0;

/** Disciplinas com objetos na cena (botões de camada). */
export const DISCIPLINAS_3D: Disciplina[] = ['arquitetura', 'estrutura', 'eletrica', 'hidraulica'];

export const VISUAL = {
  corFundo: '#14161a',
  corGrade: '#3a4050',
  corGradeEixo: '#566074',
  corSelecao: '#ffffff',
  /** Intensidade do brilho (emissive) do objeto selecionado. */
  brilhoSelecao: 0.45,
  opacidadePendente: 0.5,
  raioMarcadorM: 0.08,
  segmentosMarcador: 16,
  luzAmbiente: 1.4,
  luzDirecional: 1.6,
  /** De onde vem a luz direcional e de onde a câmera olha (vetores relativos ao centro da cena). */
  direcaoLuz: [0.6, 1, 0.4] as [number, number, number],
  direcaoCamera: [0.7, 0.8, 1] as [number, number, number],
  campoVisaoGraus: 50,
  planoProximoM: 0.05,
  planoDistanteM: 2000,
  /** Distância da câmera = maior dimensão da cena × este fator. */
  fatorDistanciaCamera: 1.4,
  /** Tamanho mínimo da grade e da cena enquadrada (m). */
  extensaoMinimaM: 4,
  /** Folga da grade além da cena (fator) e espaçamento das linhas (m). */
  fatorGrade: 1.5,
  passoGradeM: 1,
  /** Movimento máximo do ponteiro (px) para um clique ainda contar como seleção, não como giro. */
  toleranciaCliquePx: 4,
  maxPixelRatio: 2,
};
