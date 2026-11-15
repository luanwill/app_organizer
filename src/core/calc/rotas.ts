/**
 * Rotas (eletrodutos, tubos) em unidades do PDF.
 */
import type { Ponto } from '@/core/model';
import { EPSILON_GEOMETRICO, TOLERANCIA_ANGULAR_GRAUS } from './config';

const SENO_TOLERANCIA_ANGULAR = Math.sin((TOLERANCIA_ANGULAR_GRAUS * Math.PI) / 180);

/**
 * true se o trecho de direção (ux, uy) seguido do trecho (vx, vy) continua em linha reta
 * (mesmo sentido, dentro da tolerância angular). Vetores nulos → true.
 */
export function mesmaDirecao(ux: number, uy: number, vx: number, vy: number): boolean {
  const escala = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (escala === 0) return true;
  const escalar = ux * vx + uy * vy;
  const cruz = ux * vy - uy * vx;
  return escalar > 0 && Math.abs(cruz) <= SENO_TOLERANCIA_ANGULAR * escala;
}

/**
 * Rota em L: primeiro horizontal, depois vertical → [a, (b.x, a.y), b].
 * Pontos alinhados (mesma horizontal ou vertical) → [a, b]; pontos coincidentes → [a].
 */
export function rotaOrtogonal(a: Ponto, b: Ponto): Ponto[] {
  const mesmoX = Math.abs(a.x - b.x) <= EPSILON_GEOMETRICO;
  const mesmoY = Math.abs(a.y - b.y) <= EPSILON_GEOMETRICO;
  if (mesmoX && mesmoY) return [{ x: a.x, y: a.y }];
  if (mesmoX || mesmoY) {
    return [
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
    ];
  }
  return [
    { x: a.x, y: a.y },
    { x: b.x, y: a.y },
    { x: b.x, y: b.y },
  ];
}

/**
 * Nº de mudanças de direção (curvas) de uma polilinha aberta. Pontos repetidos são ignorados;
 * vértices intermediários colineares não contam; inversão de sentido (180°) conta.
 */
export function contarMudancasDirecao(pontos: Ponto[]): number {
  let mudancas = 0;
  let anterior: { x: number; y: number } | null = null;
  for (let i = 0; i + 1 < pontos.length; i++) {
    const dx = pontos[i + 1]!.x - pontos[i]!.x;
    const dy = pontos[i + 1]!.y - pontos[i]!.y;
    if (Math.hypot(dx, dy) <= EPSILON_GEOMETRICO) continue;
    if (anterior !== null && !mesmaDirecao(anterior.x, anterior.y, dx, dy)) mudancas++;
    anterior = { x: dx, y: dy };
  }
  return mudancas;
}
