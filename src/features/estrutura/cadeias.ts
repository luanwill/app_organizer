/**
 * Cadeias do grafo de paredes: sequência de arestas entre dois nós "reais" (L, T, X, extremidade),
 * atravessando os nós 'passagem'. Base para os vãos entre pilares e para os trechos de viga.
 * Funções puras; tudo em unidades do PDF.
 */
import type { ArestaGrafo, GrafoParedes, Ponto } from '@/core/model';
import { distancia, projetarNaPolilinha } from '@/core/calc';

export interface Cadeia {
  /** Posições dos nós, na ordem do percurso. */
  pontos: Ponto[];
  /** Parede de cada segmento (pontos[i] → pontos[i+1]). */
  paredeIds: string[];
}

export function montarCadeias(grafo: GrafoParedes): Cadeia[] {
  const nos = new Map(grafo.nos.map((n) => [n.id, n]));
  const incidentes = new Map<string, ArestaGrafo[]>();
  for (const aresta of grafo.arestas) {
    for (const no of [aresta.noA, aresta.noB]) {
      const lista = incidentes.get(no);
      if (lista) lista.push(aresta);
      else incidentes.set(no, [aresta]);
    }
  }
  const visitadas = new Set<string>();
  const percorrer = (inicio: string, primeira: ArestaGrafo): Cadeia => {
    const cadeia: Cadeia = { pontos: [nos.get(inicio)!.ponto], paredeIds: [] };
    let atual = inicio;
    let aresta: ArestaGrafo | undefined = primeira;
    while (aresta) {
      visitadas.add(aresta.id);
      atual = aresta.noA === atual ? aresta.noB : aresta.noA;
      cadeia.pontos.push(nos.get(atual)!.ponto);
      cadeia.paredeIds.push(aresta.paredeId);
      if (nos.get(atual)!.tipo !== 'passagem' || atual === inicio) break;
      aresta = incidentes.get(atual)!.find((a) => !visitadas.has(a.id));
    }
    return cadeia;
  };

  const cadeias: Cadeia[] = [];
  for (const no of grafo.nos) {
    if (no.tipo === 'passagem') continue;
    for (const aresta of incidentes.get(no.id) ?? []) {
      if (!visitadas.has(aresta.id)) cadeias.push(percorrer(no.id, aresta));
    }
  }
  // anéis formados só por nós 'passagem'
  for (const aresta of grafo.arestas) {
    if (!visitadas.has(aresta.id)) cadeias.push(percorrer(aresta.noA, aresta));
  }
  return cadeias;
}

/** Distância acumulada até cada ponto da cadeia (o último valor é o comprimento total). */
export function acumulados(pontos: Ponto[]): number[] {
  const acum = [0];
  for (let i = 1; i < pontos.length; i++) acum.push(acum[i - 1]! + distancia(pontos[i - 1]!, pontos[i]!));
  return acum;
}

/** Estaca (distância ao longo da cadeia) de um ponto que está sobre ela, ou null se estiver fora da tolerância. */
export function estacaNaCadeia(p: Ponto, pontos: Ponto[], acum: number[], tolerancia: number): number | null {
  const proj = projetarNaPolilinha(p, pontos);
  if (proj.indiceSegmento < 0 || proj.distancia > tolerancia) return null;
  const i = proj.indiceSegmento;
  return acum[i]! + proj.t * (acum[i + 1]! - acum[i]!);
}

function indiceDoSegmento(acum: number[], estaca: number): number {
  let i = 0;
  while (i < acum.length - 2 && estaca > acum[i + 1]!) i++;
  return i;
}

export function pontoNaEstaca(pontos: Ponto[], acum: number[], estaca: number): Ponto {
  const i = indiceDoSegmento(acum, estaca);
  const a = pontos[i]!;
  const b = pontos[i + 1]!;
  const comprimento = acum[i + 1]! - acum[i]!;
  const t = comprimento > 0 ? Math.min(1, Math.max(0, (estaca - acum[i]!) / comprimento)) : 0;
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

/** Parede do segmento da cadeia que contém a estaca. */
export function paredeNaEstaca(cadeia: Cadeia, acum: number[], estaca: number): string {
  return cadeia.paredeIds[indiceDoSegmento(acum, estaca)]!;
}

/** Pontos da cadeia entre duas estacas (extremos incluídos, mais os vértices intermediários). */
export function trechoDaCadeia(pontos: Ponto[], acum: number[], de: number, ate: number): Ponto[] {
  const trecho = [pontoNaEstaca(pontos, acum, de)];
  for (let i = 1; i < pontos.length - 1; i++) {
    if (acum[i]! > de && acum[i]! < ate) trecho.push(pontos[i]!);
  }
  trecho.push(pontoNaEstaca(pontos, acum, ate));
  return trecho;
}
