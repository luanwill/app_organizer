/**
 * Pilares automáticos: nós do grafo (L, T, X, extremidade) + intermediários nos vãos acima do
 * máximo, fusão dos muito próximos e ordem de numeração. Funções puras; geometria em unidades do PDF.
 */
import type { GrafoParedes, Ponto } from '@/core/model';
import { distancia } from '@/core/calc';
import { acumulados, estacaNaCadeia, pontoNaEstaca, type Cadeia } from './cadeias';
import { EPSILON_VAO, FORCA_NO, type NoTipoPilar } from './config';

export interface PilarSugerido {
  ponto: Ponto;
  noTipo: NoTipoPilar;
}

/** Nº de pilares intermediários de um vão (m): ceil(vão / máximo) − 1; vão igual ao máximo → 0. */
export function pilaresIntermediarios(vao: number, vaoMaximo: number): number {
  if (!(vaoMaximo > 0) || !(vao > 0)) return 0;
  return Math.max(0, Math.ceil(vao / vaoMaximo - EPSILON_VAO) - 1);
}

/**
 * Ordem de leitura: de cima para baixo (y crescente) e, na mesma "linha" (diferença de y menor
 * que a tolerância em relação ao 1º da linha), da esquerda para a direita.
 */
export function ordenarLeitura<T>(itens: T[], pontoDe: (item: T) => Ponto, toleranciaLinha: number): T[] {
  const porY = [...itens].sort((a, b) => pontoDe(a).y - pontoDe(b).y || pontoDe(a).x - pontoDe(b).x);
  const ordenados: T[] = [];
  let linha: T[] = [];
  const fecharLinha = (): void => {
    ordenados.push(...linha.sort((a, b) => pontoDe(a).x - pontoDe(b).x));
    linha = [];
  };
  for (const item of porY) {
    if (linha.length > 0 && pontoDe(item).y - pontoDe(linha[0]!).y >= toleranciaLinha) fecharLinha();
    linha.push(item);
  }
  fecharLinha();
  return ordenados;
}

/** Funde candidatos a menos de `distanciaFusao` (unidades): fica o de nó mais forte, na posição dele. */
export function fundirPilares(
  candidatos: PilarSugerido[],
  distanciaFusao: number,
  existentes: Ponto[] = [],
): PilarSugerido[] {
  const porForca = [...candidatos].sort(
    (a, b) => FORCA_NO[b.noTipo] - FORCA_NO[a.noTipo] || a.ponto.y - b.ponto.y || a.ponto.x - b.ponto.x,
  );
  const mantidos: PilarSugerido[] = [];
  for (const candidato of porForca) {
    const perto = (p: Ponto): boolean => distancia(p, candidato.ponto) < distanciaFusao;
    if (existentes.some(perto) || mantidos.some((m) => perto(m.ponto))) continue;
    mantidos.push(candidato);
  }
  return mantidos;
}

export interface OpcoesPilares {
  /** Metros por unidade do PDF. */
  escala: number;
  vaoMaximo: number; // m
  distanciaFusao: number; // m
  /** Tolerância (unidades) para considerar um pilar existente sobre o eixo de uma parede. */
  tolerancia: number;
  /** Tolerância (unidades) da "linha" na ordem de numeração. */
  toleranciaLinha: number;
  /** Pilares já confirmados/desenhados na página (respeitados: dividem vãos e bloqueiam vizinhos). */
  existentes?: Ponto[];
}

/** Pilares sugeridos para o grafo, já fundidos e na ordem de numeração. */
export function posicionarPilares(grafo: GrafoParedes, cadeias: Cadeia[], opcoes: OpcoesPilares): PilarSugerido[] {
  const existentes = opcoes.existentes ?? [];
  const candidatos: PilarSugerido[] = grafo.nos
    .filter((no) => no.tipo !== 'passagem')
    .map((no) => ({ ponto: { ...no.ponto }, noTipo: no.tipo }));

  for (const cadeia of cadeias) {
    const acum = acumulados(cadeia.pontos);
    const total = acum[acum.length - 1]!;
    const estacas = [0, total];
    for (const p of existentes) {
      const estaca = estacaNaCadeia(p, cadeia.pontos, acum, opcoes.tolerancia);
      if (estaca !== null) estacas.push(estaca);
    }
    estacas.sort((a, b) => a - b);
    for (let i = 0; i + 1 < estacas.length; i++) {
      const de = estacas[i]!;
      const ate = estacas[i + 1]!;
      const n = pilaresIntermediarios((ate - de) * opcoes.escala, opcoes.vaoMaximo);
      for (let k = 1; k <= n; k++) {
        candidatos.push({
          ponto: pontoNaEstaca(cadeia.pontos, acum, de + (k * (ate - de)) / (n + 1)),
          noTipo: 'intermediario',
        });
      }
    }
  }

  const fundidos = fundirPilares(candidatos, opcoes.distanciaFusao / opcoes.escala, existentes);
  return ordenarLeitura(fundidos, (p) => p.ponto, opcoes.toleranciaLinha);
}
