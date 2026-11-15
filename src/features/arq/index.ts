/** Disciplina ARQUITETURA (S4): ambientes, paredes, esquadrias e acabamentos. */
import type { ModuloDisciplina } from '@/core/model';
import { calcularArquitetura } from './calcular';
import { DISCIPLINA } from './config';
import { PainelArquitetura } from './PainelArquitetura';

export const moduloArquitetura: ModuloDisciplina = {
  disciplina: DISCIPLINA,
  calcular: calcularArquitetura,
  Painel: PainelArquitetura,
};

export { PainelDadosEssenciais } from './PainelDadosEssenciais';
