/** Disciplina ELÉTRICA E ILUMINAÇÃO — sugestão automática (NBR 5410), circuitos e quantitativos. */
import type { ModuloDisciplina } from '@/core/model';
import { calcularEletrica } from './calculo';
import { PainelEletrica } from './Painel';
import { sugerirEletrica } from './sugestao';

export const moduloEletrica: ModuloDisciplina = {
  disciplina: 'eletrica',
  calcular: calcularEletrica,
  sugerir: sugerirEletrica,
  Painel: PainelEletrica,
};

export { calcularEletrica } from './calculo';
export { agruparCircuitos, calcularCircuitos } from './circuitos';
export type { Circuito, GrupoCircuito } from './circuitos';
export { pontoNoPerimetro, sugerirAmbiente, sugerirEletrica } from './sugestao';
export {
  cargaIluminacaoVA,
  correnteA,
  disjuntorComercialA,
  quantidadeTUGs,
  resumoAmbiente,
  resumoAmbientes,
  trechoVerticalM,
} from './regras';
export type { ResumoAmbiente } from './regras';
export * from './config';
