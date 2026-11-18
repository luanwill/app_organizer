/** Disciplina Estrutura (S5): sugestão automática + quantitativos + painel. */
import type { ModuloDisciplina } from '@/core/model';
import { calcularEstrutura } from './calcular';
import { PainelEstrutura } from './PainelEstrutura';
import { sugerirEstrutura } from './sugerir';

export const moduloEstrutura: ModuloDisciplina = {
  disciplina: 'estrutura',
  calcular: calcularEstrutura,
  sugerir: sugerirEstrutura,
  Painel: PainelEstrutura,
};

export { alturaDoCondutor, alturaDoPilar, calcularEstrutura } from './calcular';
export {
  bordasBaixas,
  comprimentoCumeeira,
  contornoTelhado,
  cumeeiraQuatroAguas,
  fatorInclinacao,
  inclinacaoDoTelhado,
  numeroCondutores,
  posicoesCondutores,
  recortarSegmentoNoPoligono,
  retangulosMaximos,
  sugerirTelhados,
} from './cobertura';
export { sugerirEstrutura } from './sugerir';
export { acumulados, montarCadeias } from './cadeias';
export { fundirPilares, ordenarLeitura, pilaresIntermediarios, posicionarPilares } from './pilares';
export {
  acoPecaLinear,
  comprimentoEstribo,
  dividirEmTrechos,
  pesoLinearAco,
  quantitativosPilar,
  quantitativosViga,
} from './vigas';
export { agruparAdjacentes, distanciaEntrePoligonos, ehOrtogonal, montarLajes, quantitativosLaje, uniaoOrtogonal } from './lajes';
export { quantitativosBloco, quantitativosRadier, quantitativosSapata } from './fundacoes';
export * from './config';
