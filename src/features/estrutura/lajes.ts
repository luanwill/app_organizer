/**
 * Lajes: uma por ambiente coberto ou uma por grupo de ambientes adjacentes (união de polígonos
 * ortogonais por decomposição em grade) + quantitativos por tipo. Funções puras.
 */
import type { ParametrosEstrutura, Ponto, PropsLaje } from '@/core/model';
import { areaPoligono, distanciaPontoPoligono, pontoEmPoligono } from '@/core/calc';
import { COMPRIMENTO_ENCHIMENTO_M, EPSILON_GRADE, FATOR_CONCRETO_LAJE, FATOR_TRANSPASSE_TELA } from './config';

// ---------------------------------------------------------------- união ortogonal

export interface Retangulo {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Valores ordenados, sem repetição (dentro de EPSILON_GRADE). */
export function coordenadasUnicas(valores: number[]): number[] {
  const unicas: number[] = [];
  for (const v of [...valores].sort((a, b) => a - b)) {
    if (unicas.length === 0 || v - unicas[unicas.length - 1]! > EPSILON_GRADE) unicas.push(v);
  }
  return unicas;
}

/** true se todos os lados são horizontais ou verticais (dentro da tolerância, em unidades). */
export function ehOrtogonal(pontos: Ponto[], tolerancia: number): boolean {
  if (pontos.length < 4) return false;
  return pontos.every((p, i) => {
    const q = pontos[(i + 1) % pontos.length]!;
    return Math.abs(q.x - p.x) <= tolerancia || Math.abs(q.y - p.y) <= tolerancia;
  });
}

/** Decompõe um polígono ortogonal nos retângulos da grade formada pelos seus próprios vértices. */
export function retangulosDoPoligono(pontos: Ponto[]): Retangulo[] {
  const xs = coordenadasUnicas(pontos.map((p) => p.x));
  const ys = coordenadasUnicas(pontos.map((p) => p.y));
  const retangulos: Retangulo[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      const centro = { x: (xs[i]! + xs[i + 1]!) / 2, y: (ys[j]! + ys[j + 1]!) / 2 };
      if (pontoEmPoligono(centro, pontos)) retangulos.push({ x0: xs[i]!, y0: ys[j]!, x1: xs[i + 1]!, y1: ys[j + 1]! });
    }
  }
  return retangulos;
}

/** Ponto garantidamente interno de um polígono ortogonal (centro do 1º retângulo da decomposição). */
export function pontoInterno(pontos: Ponto[]): Ponto | null {
  const r = retangulosDoPoligono(pontos)[0];
  return r ? { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 } : null;
}

/** Contorno externo (maior laço) de um conjunto conexo de células da grade. */
function contornoExterno(xs: number[], ys: number[], dentro: (i: number, j: number) => boolean, celulas: [number, number][]): Ponto[] {
  interface Lado {
    de: [number, number];
    ate: [number, number];
    dir: [number, number];
    usado: boolean;
  }
  const chave = (v: [number, number]): number => v[0] * (ys.length + 1) + v[1];
  const porOrigem = new Map<number, Lado[]>();
  const lados: Lado[] = [];
  const adicionar = (de: [number, number], ate: [number, number]): void => {
    const lado: Lado = { de, ate, dir: [Math.sign(ate[0] - de[0]), Math.sign(ate[1] - de[1])], usado: false };
    lados.push(lado);
    const lista = porOrigem.get(chave(de));
    if (lista) lista.push(lado);
    else porOrigem.set(chave(de), [lado]);
  };
  // sentido horário na tela (interior à direita do percurso)
  for (const [i, j] of celulas) {
    if (!dentro(i, j - 1)) adicionar([i, j], [i + 1, j]);
    if (!dentro(i + 1, j)) adicionar([i + 1, j], [i + 1, j + 1]);
    if (!dentro(i, j + 1)) adicionar([i + 1, j + 1], [i, j + 1]);
    if (!dentro(i - 1, j)) adicionar([i, j + 1], [i, j]);
  }

  let melhor: Ponto[] = [];
  let melhorArea = -1;
  for (const inicial of lados) {
    if (inicial.usado) continue;
    const vertices: [number, number][] = [];
    let lado: Lado | undefined = inicial;
    while (lado && !lado.usado) {
      lado.usado = true;
      vertices.push(lado.de);
      const [dx, dy]: [number, number] = lado.dir;
      // preferência: virar à direita, seguir reto, virar à esquerda
      const preferencias: [number, number][] = [
        [-dy, dx],
        [dx, dy],
        [dy, -dx],
      ];
      const candidatos: Lado[] = (porOrigem.get(chave(lado.ate)) ?? []).filter((l) => !l.usado);
      lado = undefined;
      for (const [px, py] of preferencias) {
        lado = candidatos.find((l) => l.dir[0] === px && l.dir[1] === py);
        if (lado) break;
      }
    }
    // remove vértices colineares
    const pontos: Ponto[] = [];
    for (let k = 0; k < vertices.length; k++) {
      const a = vertices[(k + vertices.length - 1) % vertices.length]!;
      const b = vertices[k]!;
      const c = vertices[(k + 1) % vertices.length]!;
      const colinear = (a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1]);
      if (!colinear) pontos.push({ x: xs[b[0]]!, y: ys[b[1]]! });
    }
    const area = areaPoligono(pontos);
    if (area > melhorArea) {
      melhor = pontos;
      melhorArea = area;
    }
  }
  return melhor;
}

/**
 * União de polígonos ORTOGONAIS com fechamento dos vãos de até 2 × `meiaTolerancia` (unidades):
 * cada polígono é expandido em `meiaTolerancia`, a união é feita numa grade e o resultado é
 * recuado na mesma medida — as faces externas voltam ao lugar e só os vãos (paredes) ficam
 * preenchidos. Com `afastamento` > 0, o resultado fica afastado para fora nessa medida (offset
 * ortogonal, cantos em esquadro — usado no beiral do telhado). Devolve o contorno externo de cada
 * parte conexa.
 */
export function uniaoOrtogonal(poligonos: Ponto[][], meiaTolerancia: number, afastamento = 0): Ponto[][] {
  const d = Math.max(0, meiaTolerancia);
  const e = d + Math.max(0, afastamento);
  const expandidos = poligonos
    .flatMap(retangulosDoPoligono)
    .map((r) => ({ x0: r.x0 - e, y0: r.y0 - e, x1: r.x1 + e, y1: r.y1 + e }));
  if (expandidos.length === 0) return [];

  // 1) grade da união expandida
  const xs1 = coordenadasUnicas(expandidos.flatMap((r) => [r.x0, r.x1]));
  const ys1 = coordenadasUnicas(expandidos.flatMap((r) => [r.y0, r.y1]));
  const cheia1: boolean[][] = [];
  for (let i = 0; i + 1 < xs1.length; i++) {
    const cx = (xs1[i]! + xs1[i + 1]!) / 2;
    const coluna: boolean[] = [];
    for (let j = 0; j + 1 < ys1.length; j++) {
      const cy = (ys1[j]! + ys1[j + 1]!) / 2;
      coluna.push(expandidos.some((r) => cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1));
    }
    cheia1.push(coluna);
  }

  // 2) recuo: a célula fica se o quadrado de lado 2d centrado nela só toca células cheias
  const xs = coordenadasUnicas(xs1.flatMap((x) => [x - d, x, x + d]));
  const ys = coordenadasUnicas(ys1.flatMap((y) => [y - d, y, y + d]));
  const faixa = (coords: number[], de: number, ate: number): [number, number] | null => {
    if (de < coords[0]! - EPSILON_GRADE || ate > coords[coords.length - 1]! + EPSILON_GRADE) return null;
    let a = 0;
    while (a < coords.length - 2 && coords[a + 1]! <= de + EPSILON_GRADE) a++;
    let b = a;
    while (b < coords.length - 2 && coords[b + 1]! < ate - EPSILON_GRADE) b++;
    return [a, b];
  };
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const cheia: boolean[][] = [];
  for (let i = 0; i < nx; i++) {
    const cx = (xs[i]! + xs[i + 1]!) / 2;
    const fx = faixa(xs1, cx - d, cx + d);
    const coluna: boolean[] = [];
    for (let j = 0; j < ny; j++) {
      const cy = (ys[j]! + ys[j + 1]!) / 2;
      const fy = faixa(ys1, cy - d, cy + d);
      let ok = fx !== null && fy !== null;
      for (let a = fx?.[0] ?? 0; ok && a <= fx![1]; a++) {
        for (let b = fy![0]; ok && b <= fy![1]; b++) ok = cheia1[a]![b]!;
      }
      coluna.push(ok);
    }
    cheia.push(coluna);
  }

  // 3) partes conexas e contorno externo de cada uma
  const parte: number[][] = cheia.map((coluna) => coluna.map(() => -1));
  const contornos: Ponto[][] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      if (!cheia[i]![j]! || parte[i]![j]! !== -1) continue;
      const id = contornos.length;
      const celulas: [number, number][] = [];
      const pilha: [number, number][] = [[i, j]];
      parte[i]![j] = id;
      while (pilha.length > 0) {
        const [a, b] = pilha.pop()!;
        celulas.push([a, b]);
        for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const u = a + da;
          const v = b + db;
          if (u >= 0 && u < nx && v >= 0 && v < ny && cheia[u]![v]! && parte[u]![v]! === -1) {
            parte[u]![v] = id;
            pilha.push([u, v]);
          }
        }
      }
      const dentro = (a: number, b: number): boolean => a >= 0 && a < nx && b >= 0 && b < ny && parte[a]![b]! === id;
      contornos.push(contornoExterno(xs, ys, dentro, celulas));
    }
  }
  return contornos;
}

// ---------------------------------------------------------------- lajes sugeridas

export interface AmbienteCoberto {
  id: string;
  pontos: Ponto[];
}

export interface LajeSugerida {
  pontos: Ponto[];
  ambienteIds: string[];
}

/** Menor distância entre as bordas de dois polígonos (0 se um vértice de um está dentro do outro). */
export function distanciaEntrePoligonos(a: Ponto[], b: Ponto[]): number {
  let menor = Infinity;
  for (const [de, para] of [[a, b], [b, a]] as const) {
    for (const p of de) {
      if (pontoEmPoligono(p, para)) return 0;
      menor = Math.min(menor, distanciaPontoPoligono(p, para));
    }
  }
  return menor;
}

/** Grupos de ambientes adjacentes (bordas a até `tolerancia` unidades), por união-busca, na ordem de entrada. */
export function agruparAdjacentes(ambientes: AmbienteCoberto[], tolerancia: number): AmbienteCoberto[][] {
  const pai = ambientes.map((_, i) => i);
  const raiz = (i: number): number => (pai[i]! === i ? i : (pai[i] = raiz(pai[i]!)));
  for (let i = 0; i < ambientes.length; i++) {
    for (let j = i + 1; j < ambientes.length; j++) {
      if (distanciaEntrePoligonos(ambientes[i]!.pontos, ambientes[j]!.pontos) <= tolerancia) pai[raiz(j)] = raiz(i);
    }
  }
  const grupos = new Map<number, AmbienteCoberto[]>();
  ambientes.forEach((a, i) => {
    const r = raiz(i);
    const grupo = grupos.get(r);
    if (grupo) grupo.push(a);
    else grupos.set(r, [a]);
  });
  return [...grupos.values()];
}

/**
 * Lajes a partir dos ambientes cobertos.
 * 'por-ambiente' → uma por ambiente. 'uniao' → uma por grupo de ambientes adjacentes (bordas a
 * até `tolerancia` unidades); grupo com polígono não ortogonal cai no modo por ambiente.
 */
export function montarLajes(
  ambientes: AmbienteCoberto[],
  modo: 'por-ambiente' | 'uniao',
  tolerancia: number,
  toleranciaOrtogonal: number,
): LajeSugerida[] {
  const validos = ambientes.filter((a) => a.pontos.length >= 3);
  const individual = (a: AmbienteCoberto): LajeSugerida => ({ pontos: a.pontos.map((p) => ({ ...p })), ambienteIds: [a.id] });
  if (modo === 'por-ambiente') return validos.map(individual);

  const lajes: LajeSugerida[] = [];
  for (const grupo of agruparAdjacentes(validos, tolerancia)) {
    if (grupo.length === 1 || !grupo.every((a) => ehOrtogonal(a.pontos, toleranciaOrtogonal))) {
      lajes.push(...grupo.map(individual));
      continue;
    }
    const contornos = uniaoOrtogonal(grupo.map((a) => a.pontos), tolerancia / 2);
    const membros: AmbienteCoberto[][] = contornos.map(() => []);
    for (const a of grupo) {
      const interno = pontoInterno(a.pontos);
      const k = interno ? contornos.findIndex((c) => pontoEmPoligono(interno, c)) : -1;
      if (k >= 0) membros[k]!.push(a);
      else lajes.push(individual(a));
    }
    contornos.forEach((pontos, k) => {
      if (membros[k]!.length > 0) lajes.push({ pontos, ambienteIds: membros[k]!.map((a) => a.id) });
    });
  }
  return lajes;
}

// ---------------------------------------------------------------- quantitativos

export interface QuantitativosLaje {
  concreto: number; // m³
  escoramento: number; // m²
  /** Maciça: aço (kg) = volume × taxa. */
  aco?: number;
  /** Treliçadas. */
  vao?: number; // m (menor lado da caixa envolvente)
  numeroTrelicas?: number;
  trelicas?: number; // m
  enchimento?: number; // un (EPS ou lajotas)
  tela?: number; // m²
}

/**
 * Quantitativos de uma laje de área `area` (m²) cuja caixa envolvente mede `ladoA` × `ladoB` (m).
 * Treliçadas: vão = menor lado; nº de treliças = ceil(maior lado / intereixo); enchimento =
 * fiadas entre treliças (nº de treliças − 1, mínimo 1) × vão / comprimento da peça.
 * Intereixo inválido (≤ 0) → treliças/enchimento não saem (o chamador gera o alerta).
 */
export function quantitativosLaje(
  area: number,
  ladoA: number,
  ladoB: number,
  props: PropsLaje,
  estrutura: ParametrosEstrutura,
): QuantitativosLaje {
  const concreto = area * props.espessura * FATOR_CONCRETO_LAJE[props.tipoLaje];
  const q: QuantitativosLaje = { concreto, escoramento: area };
  if (props.tipoLaje === 'macica') {
    q.aco = concreto * estrutura.aco.taxaLaje;
    return q;
  }
  q.tela = area * FATOR_TRANSPASSE_TELA;
  const intereixo = estrutura.laje.intereixo;
  if (!(intereixo > 0)) return q;
  const vao = Math.min(ladoA, ladoB);
  const largura = Math.max(ladoA, ladoB);
  const numeroTrelicas = Math.ceil(largura / intereixo - EPSILON_GRADE);
  const fiadas = Math.max(numeroTrelicas - 1, 1);
  q.vao = vao;
  q.numeroTrelicas = numeroTrelicas;
  q.trelicas = numeroTrelicas * vao;
  q.enchimento = Math.ceil((fiadas * vao) / COMPRIMENTO_ENCHIMENTO_M[props.tipoLaje] - EPSILON_GRADE);
  return q;
}
