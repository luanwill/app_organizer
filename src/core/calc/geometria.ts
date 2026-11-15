/**
 * Geometria plana em unidades do PDF (origem no canto superior esquerdo, y para baixo).
 * Funções puras: nunca alteram os argumentos.
 */
import type { Ponto, ProjecaoPolilinha, ProjecaoSegmento } from '@/core/model';
import { EPSILON_GEOMETRICO, EPSILON_PARALELISMO } from './config';

export interface Segmento {
  a: Ponto;
  b: Ponto;
}

export interface CaixaEnvolvente {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function distancia(a: Ponto, b: Ponto): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Segmentos consecutivos de uma polilinha; com `fechada`, inclui o segmento último → primeiro. */
export function segmentosDaPolilinha(pontos: Ponto[], fechada = false): Segmento[] {
  const segmentos: Segmento[] = [];
  for (let i = 0; i + 1 < pontos.length; i++) {
    segmentos.push({ a: pontos[i]!, b: pontos[i + 1]! });
  }
  if (fechada && pontos.length > 2) {
    segmentos.push({ a: pontos[pontos.length - 1]!, b: pontos[0]! });
  }
  return segmentos;
}

export function comprimentoPolilinha(pontos: Ponto[], fechada = false): number {
  let total = 0;
  for (const s of segmentosDaPolilinha(pontos, fechada)) total += distancia(s.a, s.b);
  return total;
}

/** Área com sinal (shoelace). Com y para baixo, positivo = sentido horário na tela. */
export function areaComSinal(pontos: Ponto[]): number {
  if (pontos.length < 3) return 0;
  let soma = 0;
  for (let i = 0; i < pontos.length; i++) {
    const p = pontos[i]!;
    const q = pontos[(i + 1) % pontos.length]!;
    soma += p.x * q.y - q.x * p.y;
  }
  return soma / 2;
}

/** Área em valor absoluto (shoelace). Polígono fechado implicitamente; menos de 3 pontos → 0. */
export function areaPoligono(pontos: Ponto[]): number {
  return Math.abs(areaComSinal(pontos));
}

/** Perímetro do polígono fechado implicitamente; menos de 3 pontos → comprimento da linha aberta. */
export function perimetroPoligono(pontos: Ponto[]): number {
  return comprimentoPolilinha(pontos, true);
}

/**
 * Centroide (centro de área). Polígono degenerado (área nula) → média dos vértices;
 * lista vazia → (0, 0).
 */
export function centroidePoligono(pontos: Ponto[]): Ponto {
  if (pontos.length === 0) return { x: 0, y: 0 };
  const area = areaComSinal(pontos);
  if (Math.abs(area) <= EPSILON_GEOMETRICO) {
    let sx = 0;
    let sy = 0;
    for (const p of pontos) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / pontos.length, y: sy / pontos.length };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pontos.length; i++) {
    const p = pontos[i]!;
    const q = pontos[(i + 1) % pontos.length]!;
    const cruz = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * cruz;
    cy += (p.y + q.y) * cruz;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

/** Projeção de `p` no segmento a–b (t limitado a 0..1). Segmento degenerado (a = b) → t = 0. */
export function projetarNoSegmento(p: Ponto, a: Ponto, b: Ponto): ProjecaoSegmento {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comprimento2 = dx * dx + dy * dy;
  let t = 0;
  if (comprimento2 > 0) {
    t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / comprimento2;
    t = Math.min(1, Math.max(0, t));
  }
  const ponto =
    t === 0 ? { x: a.x, y: a.y } : t === 1 ? { x: b.x, y: b.y } : { x: a.x + t * dx, y: a.y + t * dy };
  return { ponto, t, distancia: distancia(p, ponto) };
}

/**
 * Projeção de `p` no segmento mais próximo da polilinha.
 * Lista vazia → { ponto: p, t: 0, distancia: Infinity, indiceSegmento: -1 }.
 * Um único ponto → esse ponto, indiceSegmento 0. Em empate vence o primeiro segmento.
 */
export function projetarNaPolilinha(p: Ponto, pontos: Ponto[], fechada = false): ProjecaoPolilinha {
  if (pontos.length === 0) {
    return { ponto: { x: p.x, y: p.y }, t: 0, distancia: Infinity, indiceSegmento: -1 };
  }
  if (pontos.length === 1) {
    const unico = pontos[0]!;
    return { ponto: { x: unico.x, y: unico.y }, t: 0, distancia: distancia(p, unico), indiceSegmento: 0 };
  }
  const segmentos = segmentosDaPolilinha(pontos, fechada);
  let melhor: ProjecaoPolilinha | null = null;
  segmentos.forEach((s, indiceSegmento) => {
    const proj = projetarNoSegmento(p, s.a, s.b);
    if (melhor === null || proj.distancia < melhor.distancia) melhor = { ...proj, indiceSegmento };
  });
  return melhor!;
}

/** true se `p` está sobre o segmento a–b (extremidades incluídas), dentro da tolerância. */
export function pontoNoSegmento(p: Ponto, a: Ponto, b: Ponto, tolerancia = EPSILON_GEOMETRICO): boolean {
  return projetarNoSegmento(p, a, b).distancia <= tolerancia;
}

/**
 * Ponto dentro do polígono (ray casting; independe do sentido horário/anti-horário).
 * Pontos sobre a borda ou sobre um vértice contam como dentro. Menos de 3 vértices → false.
 */
export function pontoEmPoligono(p: Ponto, poligono: Ponto[]): boolean {
  if (poligono.length < 3) return false;
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i]!;
    const b = poligono[j]!;
    if (pontoNoSegmento(p, a, b)) return true;
    const cruza = a.y > p.y !== b.y > p.y;
    if (cruza && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro;
}

/** Menor distância de `p` à borda do polígono (0 se estiver sobre a borda); lista vazia → Infinity. */
export function distanciaPontoPoligono(p: Ponto, poligono: Ponto[]): number {
  return projetarNaPolilinha(p, poligono, true).distancia;
}

/**
 * Trava `p` na horizontal ou na vertical em relação à origem (Shift): mantém o eixo de maior
 * deslocamento. Em empate (45°) prevalece a horizontal.
 */
export function restringirOrtogonal(origem: Ponto, p: Ponto): Ponto {
  const dx = Math.abs(p.x - origem.x);
  const dy = Math.abs(p.y - origem.y);
  return dx >= dy ? { x: p.x, y: origem.y } : { x: origem.x, y: p.y };
}

/** Candidato mais próximo de `p` dentro da tolerância (inclusive), ou null. Em empate vence o primeiro. */
export function snapVertice(p: Ponto, candidatos: Ponto[], tolerancia: number): Ponto | null {
  let melhor: Ponto | null = null;
  let melhorDistancia = Infinity;
  for (const c of candidatos) {
    const d = distancia(p, c);
    if (d <= tolerancia && d < melhorDistancia) {
      melhor = c;
      melhorDistancia = d;
    }
  }
  return melhor === null ? null : { x: melhor.x, y: melhor.y };
}

/** 4 vértices do retângulo alinhado aos eixos com diagonal a–b: a, (b.x, a.y), b, (a.x, b.y). */
export function retanguloParaPoligono(a: Ponto, b: Ponto): Ponto[] {
  return [
    { x: a.x, y: a.y },
    { x: b.x, y: a.y },
    { x: b.x, y: b.y },
    { x: a.x, y: b.y },
  ];
}

/** Caixa envolvente; lista vazia → tudo zero. */
export function caixaEnvolvente(pontos: Ponto[]): CaixaEnvolvente {
  if (pontos.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pontos) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Interseção de dois segmentos NÃO paralelos (extremidades incluídas), ou null.
 * Segmentos paralelos/colineares/degenerados → null (sobreposição não é um ponto único).
 */
export function intersecaoSegmentos(a1: Ponto, a2: Ponto, b1: Ponto, b2: Ponto): Ponto | null {
  const rx = a2.x - a1.x;
  const ry = a2.y - a1.y;
  const sx = b2.x - b1.x;
  const sy = b2.y - b1.y;
  const denominador = rx * sy - ry * sx;
  const escala = Math.hypot(rx, ry) * Math.hypot(sx, sy);
  if (escala === 0 || Math.abs(denominador) <= EPSILON_PARALELISMO * escala) return null;
  const qx = b1.x - a1.x;
  const qy = b1.y - a1.y;
  const t = (qx * sy - qy * sx) / denominador;
  const u = (qx * ry - qy * rx) / denominador;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a1.x + t * rx, y: a1.y + t * ry };
}
