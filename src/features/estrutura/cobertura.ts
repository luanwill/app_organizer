/**
 * Cobertura: telhado sugerido por bloco de ambientes cobertos, bordas baixas (calhas), condutores,
 * rufos e quantitativos (área inclinada, cumeeira/espigões). Funções puras; geometria em unidades
 * do PDF salvo indicação.
 *
 * Decisões (documentadas para o usuário ajustar):
 *  - Telhado = contorno externo das paredes do bloco (ambientes cobertos adjacentes + o TRECHO de
 *    cada parede que fica junto deles, com a espessura — muro que continua a parede não entra)
 *    afastado do beiral. Planta ortogonal → offset ortogonal exato; planta com ambiente/parede
 *    inclinados → retângulo envolvente + beiral.
 *  - O contorno é simplificado: degraus menores que DEGRAU_MINIMO_TELHADO_M são absorvidos e um
 *    contorno quase retangular (área ≥ FRACAO_QUASE_RETANGULO da caixa) vira o retângulo envolvente.
 *  - Contorno retangular → 2 águas, cumeeira na direção do maior lado. Contorno recortado (L, T, U)
 *    → 4 águas: mantém o polígono (área certa), todos os beirais ficam na mesma cota (calha em todo
 *    o perímetro) e a cumeeira/espigões é estimada decompondo o contorno em retângulos (o maior
 *    primeiro) e somando o telhado de 4 águas de cada um — aproximação: nas junções os espigões
 *    contados fazem as vezes dos rincões.
 *  - Calhas de bordas baixas contíguas formam uma cadeia (calha contínua que dobra o canto); os
 *    condutores são distribuídos pela cadeia, não por aresta.
 *  - 1 água: a borda baixa é a do lado de maior y (caimento 'vertical') ou de maior x
 *    ('horizontal') na planta; se a água corre para o outro lado, o usuário ajusta a calha.
 */
import type { ParametrosCobertura, Ponto, PropsTelhado } from '@/core/model';
import { areaPoligono, caixaEnvolvente, distancia, distanciaPontoPoligono, pontoEmPoligono, retanguloParaPoligono } from '@/core/calc';
import {
  AGUAS_CONTORNO_RECORTADO,
  AGUAS_CONTORNO_RETANGULAR,
  EPSILON_GRADE,
  FRACAO_QUASE_RETANGULO,
  PERCENTUAL,
} from './config';
import {
  agruparAdjacentes,
  coordenadasUnicas,
  ehOrtogonal,
  pontoInterno,
  uniaoOrtogonal,
  type AmbienteCoberto,
  type Retangulo,
} from './lajes';

export type Aguas = PropsTelhado['aguas'];
export type Direcao = PropsTelhado['direcao'];

export interface SegmentoParede {
  a: Ponto;
  b: Ponto;
  /** Meia espessura (unidades). */
  meiaEspessura: number;
}

export interface TelhadoSugerido {
  pontos: Ponto[];
  ambienteIds: string[];
  aguas: Aguas;
  direcao: Direcao;
}

export interface OpcoesTelhado {
  /** Distância (unidades) que une ambientes num bloco e fecha o vão das paredes. */
  tolerancia: number;
  /** Desvio (unidades) para um lado ainda contar como horizontal/vertical. */
  toleranciaOrtogonal: number;
  /** Beiral (unidades). */
  beiral: number;
  /** Degraus do contorno menores que isto (unidades) são absorvidos. */
  degrauMinimo: number;
}

const meio = (a: Ponto, b: Ponto): Ponto => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Trechos da parede junto aos ambientes do bloco: para cada ambiente a até meia espessura +
 * `tolerancia` do eixo, o intervalo que ele ocupa ao longo da parede, estendido de meia espessura
 * (com o retângulo da parede, que soma outra meia espessura nas pontas, chega à face externa da
 * parede perpendicular). Muro que prolonga a parede além dos ambientes fica de fora.
 */
export function trechosAdjacentes(s: SegmentoParede, ambientes: AmbienteCoberto[], tolerancia: number): SegmentoParede[] {
  const comprimento = distancia(s.a, s.b);
  if (comprimento === 0) return [];
  const ux = (s.b.x - s.a.x) / comprimento;
  const uy = (s.b.y - s.a.y) / comprimento;
  const intervalos: [number, number][] = [];
  for (const amb of ambientes) {
    const ts = amb.pontos.map((p) => (p.x - s.a.x) * ux + (p.y - s.a.y) * uy);
    const ds = amb.pontos.map((p) => (p.x - s.a.x) * uy - (p.y - s.a.y) * ux);
    const atravessa = Math.min(...ds) < 0 && Math.max(...ds) > 0;
    const perto = Math.min(...ds.map(Math.abs)) <= s.meiaEspessura + tolerancia;
    if (!atravessa && !perto) continue;
    const de = Math.max(0, Math.min(...ts) - s.meiaEspessura);
    const ate = Math.min(comprimento, Math.max(...ts) + s.meiaEspessura);
    if (ate > de) intervalos.push([de, ate]);
  }
  intervalos.sort((p, q) => p[0] - q[0]);
  const unidos: [number, number][] = [];
  for (const iv of intervalos) {
    const ultimo = unidos[unidos.length - 1];
    if (ultimo && iv[0] <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], iv[1]);
    else unidos.push([...iv]);
  }
  const ponto = (t: number): Ponto => ({ x: s.a.x + t * ux, y: s.a.y + t * uy });
  return unidos.map(([de, ate]) => ({ a: ponto(de), b: ponto(ate), meiaEspessura: s.meiaEspessura }));
}

/** Trechos de parede que cercam o bloco (ver `trechosAdjacentes`). */
export function paredesDoBloco(ambientes: AmbienteCoberto[], paredes: SegmentoParede[], tolerancia: number): SegmentoParede[] {
  return paredes.flatMap((s) => trechosAdjacentes(s, ambientes, tolerancia));
}

/** Remove vértices repetidos e colineares (polígono ortogonal). */
function limparContorno(pontos: Ponto[], tolerancia: number): Ponto[] {
  let atual = pontos;
  for (let mudou = true; mudou && atual.length > 3; ) {
    mudou = false;
    for (let i = 0; i < atual.length; i++) {
      const a = atual[(i + atual.length - 1) % atual.length]!;
      const b = atual[i]!;
      const c = atual[(i + 1) % atual.length]!;
      const repetido = distancia(a, b) <= tolerancia;
      const colinear = Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) <= tolerancia * (distancia(a, b) + distancia(b, c));
      if (repetido || colinear) {
        atual = atual.filter((_, k) => k !== i);
        mudou = true;
        break;
      }
    }
  }
  return atual;
}

/**
 * Absorve degraus de um contorno ORTOGONAL: lado curto (< `degrauMinimo`) entre dois lados
 * paralelos de mesmo sentido (escada). O mais curto dos dois lados vizinhos é levado ao
 * alinhamento do outro — o degrau some e a área muda no máximo degrau × lado curto.
 */
export function simplificarDegraus(pontos: Ponto[], degrauMinimo: number, tolerancia: number = EPSILON_GRADE): Ponto[] {
  let atual = limparContorno(pontos.map((p) => ({ ...p })), tolerancia);
  for (let guarda = 0; guarda < pontos.length * 4 && atual.length > 4; guarda++) {
    const n = atual.length;
    let alterado = false;
    for (let i = 0; i < n && !alterado; i++) {
      const p0 = atual[(i + n - 1) % n]!;
      const p1 = atual[i]!;
      const p2 = atual[(i + 1) % n]!;
      const p3 = atual[(i + 2) % n]!;
      if (distancia(p1, p2) >= degrauMinimo) continue;
      const d0 = { x: p1.x - p0.x, y: p1.y - p0.y };
      const d2 = { x: p3.x - p2.x, y: p3.y - p2.y };
      if (d0.x * d2.x + d0.y * d2.y <= 0) continue; // não é escada (vizinhos em sentidos opostos)
      const horizontal = Math.abs(d0.x) >= Math.abs(d0.y);
      const novo = atual.map((p) => ({ ...p }));
      const moverAnterior = distancia(p0, p1) <= distancia(p2, p3);
      const mover = moverAnterior ? [(i + n - 1) % n, i] : [(i + 1) % n, (i + 2) % n];
      const alvo = moverAnterior ? p2 : p1;
      for (const k of mover) {
        if (horizontal) novo[k]!.y = alvo.y;
        else novo[k]!.x = alvo.x;
      }
      atual = limparContorno(novo, tolerancia);
      alterado = true;
    }
    if (!alterado) break;
  }
  return atual;
}

function segmentoOrtogonal(s: SegmentoParede, tolerancia: number): boolean {
  return Math.abs(s.b.x - s.a.x) <= tolerancia || Math.abs(s.b.y - s.a.y) <= tolerancia;
}

/** Retângulo ocupado por uma parede ortogonal (eixo ± meia espessura, pontas incluídas). */
function retanguloDaParede(s: SegmentoParede): Ponto[] {
  const h = s.meiaEspessura;
  return retanguloParaPoligono(
    { x: Math.min(s.a.x, s.b.x) - h, y: Math.min(s.a.y, s.b.y) - h },
    { x: Math.max(s.a.x, s.b.x) + h, y: Math.max(s.a.y, s.b.y) + h },
  );
}

export function ehRetangulo(pontos: Ponto[], toleranciaOrtogonal: number): boolean {
  return pontos.length === 4 && ehOrtogonal(pontos, toleranciaOrtogonal);
}

/** Contorno(s) do telhado de um bloco (projeção horizontal já com o beiral). */
export function contornoTelhado(ambientes: AmbienteCoberto[], paredes: SegmentoParede[], opcoes: OpcoesTelhado): Ponto[][] {
  const ortogonal =
    ambientes.every((a) => ehOrtogonal(a.pontos, opcoes.toleranciaOrtogonal)) &&
    paredes.every((s) => segmentoOrtogonal(s, opcoes.toleranciaOrtogonal));
  if (ortogonal) {
    const contornos = uniaoOrtogonal(
      [...ambientes.map((a) => a.pontos), ...paredes.filter((s) => s.meiaEspessura > 0 || distancia(s.a, s.b) > 0).map(retanguloDaParede)],
      opcoes.tolerancia / 2,
      opcoes.beiral,
    );
    return contornos.filter((c) =>
      ambientes.some((a) => {
        const p = pontoInterno(a.pontos);
        return p !== null && pontoEmPoligono(p, c);
      }),
    );
  }
  const caixa = caixaEnvolvente([...ambientes.flatMap((a) => a.pontos), ...paredes.flatMap((s) => [s.a, s.b])]);
  const folga = Math.max(0, ...paredes.map((s) => s.meiaEspessura)) + opcoes.beiral;
  return [retanguloParaPoligono({ x: caixa.minX - folga, y: caixa.minY - folga }, { x: caixa.maxX + folga, y: caixa.maxY + folga })];
}

/** Direção da cumeeira sugerida: a do maior lado da caixa envolvente. */
export function direcaoDoMaiorLado(pontos: Ponto[]): Direcao {
  const c = caixaEnvolvente(pontos);
  return c.maxX - c.minX >= c.maxY - c.minY ? 'horizontal' : 'vertical';
}

/** Um telhado por bloco de ambientes cobertos adjacentes. */
export function sugerirTelhados(ambientes: AmbienteCoberto[], paredes: SegmentoParede[], opcoes: OpcoesTelhado): TelhadoSugerido[] {
  const telhados: TelhadoSugerido[] = [];
  const validos = ambientes.filter((a) => a.pontos.length >= 3);
  for (const grupo of agruparAdjacentes(validos, opcoes.tolerancia)) {
    const contornos = contornoTelhado(grupo, paredesDoBloco(grupo, paredes, opcoes.tolerancia), opcoes);
    for (const bruto of contornos) {
      let pontos = ehOrtogonal(bruto, opcoes.toleranciaOrtogonal)
        ? simplificarDegraus(bruto, opcoes.degrauMinimo, opcoes.toleranciaOrtogonal)
        : bruto;
      const caixa = caixaEnvolvente(pontos);
      const areaCaixa = (caixa.maxX - caixa.minX) * (caixa.maxY - caixa.minY);
      if (pontos.length > 4 && areaPoligono(pontos) >= FRACAO_QUASE_RETANGULO * areaCaixa) {
        pontos = retanguloParaPoligono({ x: caixa.minX, y: caixa.minY }, { x: caixa.maxX, y: caixa.maxY });
      }
      const membros = grupo.filter((a) => {
        const p = pontoInterno(a.pontos);
        return p !== null && pontoEmPoligono(p, pontos);
      });
      telhados.push({
        pontos,
        ambienteIds: (membros.length > 0 ? membros : grupo).map((a) => a.id),
        aguas: ehRetangulo(pontos, opcoes.toleranciaOrtogonal) ? AGUAS_CONTORNO_RETANGULAR : AGUAS_CONTORNO_RECORTADO,
        direcao: direcaoDoMaiorLado(pontos),
      });
    }
  }
  return telhados;
}

// ---------------------------------------------------------------- calhas, condutores e rufos

/**
 * Bordas baixas do telhado (onde a água escorre → calha).
 * 4 águas: todo o perímetro. 2 águas: os lados paralelos à cumeeira. 1 água: o(s) lado(s)
 * perpendiculares ao caimento no extremo de maior y ('vertical') ou maior x ('horizontal').
 */
export function bordasBaixas(pontos: Ponto[], aguas: Aguas, direcao: Direcao, tolerancia: number): [Ponto, Ponto][] {
  const arestas = pontos
    .map((p, i): [Ponto, Ponto] => [p, pontos[(i + 1) % pontos.length]!])
    .filter(([a, b]) => distancia(a, b) > tolerancia);
  const horizontal = ([a, b]: [Ponto, Ponto]): boolean => Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  if (aguas === 4) return arestas;
  if (aguas === 2) return arestas.filter((ar) => horizontal(ar) === (direcao === 'horizontal'));
  const caixa = caixaEnvolvente(pontos);
  return direcao === 'vertical'
    ? arestas.filter((ar) => horizontal(ar) && meio(...ar).y >= caixa.maxY - tolerancia)
    : arestas.filter((ar) => !horizontal(ar) && meio(...ar).x >= caixa.maxX - tolerancia);
}

/** Nº de condutores de uma calha (m): ceil(comprimento / calha por condutor), mínimo 1. */
export function numeroCondutores(comprimentoM: number, calhaPorCondutorM: number): number {
  if (!(calhaPorCondutorM > 0)) return 1;
  return Math.max(1, Math.ceil(comprimentoM / calhaPorCondutorM - EPSILON_GRADE));
}

/**
 * Agrupa bordas consecutivas (o fim de uma é o início da seguinte) em cadeias: cada cadeia é uma
 * calha contínua que dobra os cantos. Devolve os pontos de cada cadeia (fechada: último = primeiro).
 */
export function cadeiasDeBordas(bordas: [Ponto, Ponto][], tolerancia: number): Ponto[][] {
  const cadeias: Ponto[][] = [];
  for (const [a, b] of bordas) {
    const ultima = cadeias[cadeias.length - 1];
    if (ultima && distancia(ultima[ultima.length - 1]!, a) <= tolerancia) ultima.push(b);
    else cadeias.push([a, b]);
  }
  // a última cadeia continua na primeira (o contorno é fechado)
  if (cadeias.length > 1) {
    const primeira = cadeias[0]!;
    const ultima = cadeias[cadeias.length - 1]!;
    if (distancia(ultima[ultima.length - 1]!, primeira[0]!) <= tolerancia) {
      cadeias[0] = [...ultima, ...primeira.slice(1)];
      cadeias.pop();
    }
  }
  return cadeias;
}

/**
 * Condutores ao longo de uma cadeia de calha (pontos), em k/n do comprimento (k = 1..n): sempre
 * um na ponta final (numa cadeia fechada, a ponta final é o ponto de partida).
 */
export function posicoesCondutores(cadeia: Ponto[], n: number): Ponto[] {
  const acum = [0];
  for (let i = 1; i < cadeia.length; i++) acum.push(acum[i - 1]! + distancia(cadeia[i - 1]!, cadeia[i]!));
  const total = acum[acum.length - 1]!;
  return Array.from({ length: n }, (_, k) => {
    const alvo = ((k + 1) / n) * total;
    let i = 1;
    while (i < cadeia.length - 1 && acum[i]! < alvo) i++;
    const a = cadeia[i - 1]!;
    const b = cadeia[i]!;
    const trecho = acum[i]! - acum[i - 1]!;
    const t = trecho > 0 ? (alvo - acum[i - 1]!) / trecho : 0;
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  });
}

/** Partes do segmento a–b que ficam dentro do polígono (borda incluída), mais longas que `tolerancia`. */
export function recortarSegmentoNoPoligono(a: Ponto, b: Ponto, poligono: Ponto[], tolerancia: number): [Ponto, Ponto][] {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const ts = [0, 1];
  for (let i = 0; i < poligono.length; i++) {
    const c = poligono[i]!;
    const d = poligono[(i + 1) % poligono.length]!;
    const sx = d.x - c.x;
    const sy = d.y - c.y;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) <= EPSILON_GRADE * Math.hypot(rx, ry) * Math.hypot(sx, sy)) continue;
    const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
    const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  const ponto = (t: number): Ponto => ({ x: a.x + t * rx, y: a.y + t * ry });
  const ordenados = [...new Set(ts)].sort((m, n) => m - n);
  const partes: [number, number][] = [];
  for (let i = 0; i + 1 < ordenados.length; i++) {
    const t0 = ordenados[i]!;
    const t1 = ordenados[i + 1]!;
    if (!pontoEmPoligono(ponto((t0 + t1) / 2), poligono)) continue;
    const ultima = partes[partes.length - 1];
    if (ultima && ultima[1] === t0) ultima[1] = t1;
    else partes.push([t0, t1]);
  }
  return partes
    .map(([t0, t1]): [Ponto, Ponto] => [ponto(t0), ponto(t1)])
    .filter(([p, q]) => distancia(p, q) > tolerancia);
}

// ---------------------------------------------------------------- quantitativos

/** Inclinação (fração) do telhado: a própria ou a do tipo de telha; null = sem tipo e sem inclinação. */
export function inclinacaoDoTelhado(props: PropsTelhado, cobertura: ParametrosCobertura): number | null {
  const pct = props.inclinacaoPct ?? (props.tipoTelha !== null ? cobertura.inclinacaoPct[props.tipoTelha] : null);
  return pct === null || pct === undefined || !Number.isFinite(pct) ? null : pct / PERCENTUAL;
}

/** Área inclinada = área projetada × √(1 + i²) (todas as águas com a mesma inclinação i). */
export function fatorInclinacao(inclinacao: number): number {
  return Math.sqrt(1 + inclinacao * inclinacao);
}

/**
 * Cumeeira + 4 espigões de um telhado de 4 águas sobre um retângulo a × b (mesma unidade):
 * cumeeira = maior − menor; cada espigão sobe a 45° na planta até a cumeeira:
 * comprimento real = (menor / 2) × √(2 + i²). Total = maior − menor + 2 × menor × √(2 + i²).
 */
export function cumeeiraQuatroAguas(a: number, b: number, inclinacao: number): number {
  const maior = Math.max(a, b);
  const menor = Math.min(a, b);
  return maior - menor + 2 * menor * Math.sqrt(2 + inclinacao * inclinacao);
}

/** Decompõe um polígono ortogonal em retângulos, tomando sempre o maior retângulo restante. */
export function retangulosMaximos(pontos: Ponto[]): Retangulo[] {
  const xs = coordenadasUnicas(pontos.map((p) => p.x));
  const ys = coordenadasUnicas(pontos.map((p) => p.y));
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const livre: boolean[][] = [];
  for (let i = 0; i < nx; i++) {
    livre.push([]);
    for (let j = 0; j < ny; j++) livre[i]!.push(pontoEmPoligono({ x: (xs[i]! + xs[i + 1]!) / 2, y: (ys[j]! + ys[j + 1]!) / 2 }, pontos));
  }
  const retangulos: Retangulo[] = [];
  for (;;) {
    // corrida[i][j] = nº de células livres consecutivas a partir de j (para baixo)
    const corrida = livre.map((coluna) => {
      const r = coluna.map(() => 0);
      for (let j = ny - 1; j >= 0; j--) r[j] = coluna[j] ? (r[j + 1] ?? 0) + 1 : 0;
      return r;
    });
    let melhor: { i0: number; i1: number; j0: number; h: number; area: number } | null = null;
    for (let i0 = 0; i0 < nx; i0++) {
      for (let j0 = 0; j0 < ny; j0++) {
        let h = Infinity;
        for (let i1 = i0; i1 < nx && livre[i1]![j0]; i1++) {
          h = Math.min(h, corrida[i1]![j0]!);
          const area = (xs[i1 + 1]! - xs[i0]!) * (ys[j0 + h]! - ys[j0]!);
          if (melhor === null || area > melhor.area + EPSILON_GRADE) melhor = { i0, i1, j0, h, area };
        }
      }
    }
    if (melhor === null) break;
    for (let i = melhor.i0; i <= melhor.i1; i++) for (let j = melhor.j0; j < melhor.j0 + melhor.h; j++) livre[i]![j] = false;
    retangulos.push({ x0: xs[melhor.i0]!, y0: ys[melhor.j0]!, x1: xs[melhor.i1 + 1]!, y1: ys[melhor.j0 + melhor.h]! });
  }
  return retangulos;
}

/**
 * Comprimento de cumeeira (+ espigões no de 4 águas), na unidade de `pontos`.
 * 1 água: 0. 2 águas: extensão do telhado na direção da cumeeira. 4 águas: soma dos retângulos
 * da decomposição (exato para contorno retangular; ver nota no topo do arquivo).
 */
export function comprimentoCumeeira(pontos: Ponto[], aguas: Aguas, direcao: Direcao, inclinacao: number): number {
  if (aguas === 1) return 0;
  if (aguas === 2) {
    const c = caixaEnvolvente(pontos);
    return direcao === 'horizontal' ? c.maxX - c.minX : c.maxY - c.minY;
  }
  return retangulosMaximos(pontos).reduce((s, r) => s + cumeeiraQuatroAguas(r.x1 - r.x0, r.y1 - r.y0, inclinacao), 0);
}
