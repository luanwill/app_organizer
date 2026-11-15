/**
 * Escala = metros por unidade do PDF.
 */
import type { Ponto } from '@/core/model';
import { distancia } from './geometria';

/** true se a escala é um número finito e positivo. */
export function escalaValida(escala: number | null | undefined): escala is number {
  return typeof escala === 'number' && Number.isFinite(escala) && escala > 0;
}

/**
 * Metros por unidade a partir de 2 pontos sobre uma cota e da medida real (m).
 * Entrada inválida (pontos coincidentes, medida ≤ 0 ou não finita) → NaN — nunca um valor
 * "assumido"; confira com `escalaValida` antes de gravar.
 */
export function calcularEscala(p1: Ponto, p2: Ponto, medidaRealM: number): number {
  const unidades = distancia(p1, p2);
  if (!(unidades > 0) || !Number.isFinite(unidades)) return NaN;
  if (!(medidaRealM > 0) || !Number.isFinite(medidaRealM)) return NaN;
  return medidaRealM / unidades;
}

export function paraMetros(unidades: number, escala: number): number {
  return unidades * escala;
}

/** Área: unidades² × escala². */
export function paraM2(unidadesQuadradas: number, escala: number): number {
  return unidadesQuadradas * escala * escala;
}

/** Metros → unidades do PDF. Escala inválida → NaN. */
export function paraUnidades(metros: number, escala: number): number {
  if (!escalaValida(escala)) return NaN;
  return metros / escala;
}
