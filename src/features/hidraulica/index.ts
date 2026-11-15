/** Disciplina Hidráulica e Sanitária (S7): regras puras + painel. */
import type { ModuloDisciplina } from '@/core/model';
import { calcularHidraulica } from './calculo';
import { PainelHidraulica } from './Painel';
import { sugerirHidraulica } from './sugestao';

export const moduloHidraulica: ModuloDisciplina = {
  disciplina: 'hidraulica',
  calcular: calcularHidraulica,
  sugerir: sugerirHidraulica,
  Painel: PainelHidraulica,
};

export { calcularHidraulica, capacidadeReservatorioL, diametroDoPonto, pontoTemSistema } from './calculo';
export {
  ambientesDaPagina,
  aparelhosDoAmbiente,
  posicoesNoPerimetro,
  propsPadraoPonto,
  sugerirHidraulica,
  sugerirPontosDoAmbiente,
} from './sugestao';
export { PainelHidraulica } from './Painel';
export * from './config';
