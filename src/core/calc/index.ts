/**
 * Núcleo de cálculo geométrico (S2): funções puras, sem React/store/DOM.
 * Exporta por nome todas as funções de CalcApi + alguns helpers.
 */
import type { CalcApi } from '@/core/model';
import {
  areaPoligono,
  caixaEnvolvente,
  centroidePoligono,
  comprimentoPolilinha,
  distancia,
  perimetroPoligono,
  pontoEmPoligono,
  projetarNaPolilinha,
  projetarNoSegmento,
  restringirOrtogonal,
  retanguloParaPoligono,
  snapVertice,
} from './geometria';
import { calcularEscala, paraM2, paraMetros, paraUnidades } from './escala';
import { construirGrafoParedes } from './grafo';
import { contarMudancasDirecao, rotaOrtogonal } from './rotas';
import { arredondar, formatarNumero, formatarQuantidade, lerNumero } from './formato';

export {
  // geometria
  distancia,
  comprimentoPolilinha,
  areaPoligono,
  perimetroPoligono,
  centroidePoligono,
  pontoEmPoligono,
  projetarNoSegmento,
  projetarNaPolilinha,
  restringirOrtogonal,
  snapVertice,
  retanguloParaPoligono,
  caixaEnvolvente,
  // escala
  calcularEscala,
  paraMetros,
  paraM2,
  paraUnidades,
  // grafo de paredes
  construirGrafoParedes,
  // rotas
  rotaOrtogonal,
  contarMudancasDirecao,
  // formatação pt-BR
  arredondar,
  formatarNumero,
  formatarQuantidade,
  lerNumero,
};

// helpers adicionais
export {
  areaComSinal,
  distanciaPontoPoligono,
  intersecaoSegmentos,
  pontoNoSegmento,
  segmentosDaPolilinha,
} from './geometria';
export type { CaixaEnvolvente, Segmento } from './geometria';
export { escalaValida } from './escala';
export { classificarNo } from './grafo';
export { mesmaDirecao } from './rotas';
export * from './config';

/** Verificação de tipo: o módulo satisfaz o contrato CalcApi. */
export const calcApi = {
  distancia,
  comprimentoPolilinha,
  areaPoligono,
  perimetroPoligono,
  centroidePoligono,
  pontoEmPoligono,
  projetarNoSegmento,
  projetarNaPolilinha,
  restringirOrtogonal,
  snapVertice,
  retanguloParaPoligono,
  caixaEnvolvente,
  calcularEscala,
  paraMetros,
  paraM2,
  paraUnidades,
  construirGrafoParedes,
  rotaOrtogonal,
  contarMudancasDirecao,
  arredondar,
  formatarNumero,
  formatarQuantidade,
  lerNumero,
} satisfies CalcApi;
