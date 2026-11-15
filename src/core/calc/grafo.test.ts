import { describe, expect, it } from 'vitest';
import type { GrafoParedes, Ponto, TipoNo } from '@/core/model';
import { classificarNo, comprimentoPolilinha, construirGrafoParedes } from './index';

type Parede = { id: string; pontos: Ponto[] };

const TOL = 2;

const somaArestas = (g: GrafoParedes): number => g.arestas.reduce((s, a) => s + a.comprimento, 0);
const somaParedes = (paredes: Parede[]): number =>
  paredes.reduce((s, p) => s + comprimentoPolilinha(p.pontos), 0);
const contar = (g: GrafoParedes, tipo: TipoNo): number => g.nos.filter((n) => n.tipo === tipo).length;
const noEm = (g: GrafoParedes, x: number, y: number) =>
  g.nos.find((n) => Math.hypot(n.ponto.x - x, n.ponto.y - y) < 1e-6);

function verificarConsistencia(g: GrafoParedes): void {
  const ids = new Set(g.nos.map((n) => n.id));
  expect(ids.size).toBe(g.nos.length);
  g.nos.forEach((n, i) => expect(n.id).toBe(`n${i + 1}`));
  g.arestas.forEach((a, i) => {
    expect(a.id).toBe(`a${i + 1}`);
    expect(ids.has(a.noA)).toBe(true);
    expect(ids.has(a.noB)).toBe(true);
    expect(a.noA).not.toBe(a.noB);
    expect(a.comprimento).toBeGreaterThan(0);
  });
  for (const n of g.nos) {
    const grau = g.arestas.filter((a) => a.noA === n.id || a.noB === n.id).length;
    expect(n.grau).toBe(grau);
  }
  // ordenação: y crescente, depois x crescente
  for (let i = 1; i < g.nos.length; i++) {
    const p = g.nos[i - 1]!.ponto;
    const q = g.nos[i]!.ponto;
    expect(p.y < q.y || (p.y === q.y && p.x <= q.x)).toBe(true);
  }
}

// Planta em "L" com 6 cantos (paredes externas como polilinhas) + 1 parede interna
const plantaL: Parede[] = [
  {
    id: 'ext-1',
    pontos: [
      { x: 0, y: 500 },
      { x: 0, y: 0 },
      { x: 600, y: 0 },
      { x: 600, y: 300 },
    ],
  },
  {
    id: 'ext-2',
    pontos: [
      { x: 600, y: 300 },
      { x: 300, y: 300 },
      { x: 300, y: 500 },
      { x: 0, y: 500 },
    ],
  },
  { id: 'int-1', pontos: [{ x: 200, y: 0 }, { x: 200, y: 500 }] },
];

describe('construirGrafoParedes', () => {
  it('parede isolada → 2 extremidades e 1 aresta', () => {
    const paredes = [{ id: 'p1', pontos: [{ x: 10, y: 10 }, { x: 110, y: 10 }] }];
    const g = construirGrafoParedes(paredes, TOL);
    verificarConsistencia(g);
    expect(g.nos).toHaveLength(2);
    expect(g.nos.every((n) => n.tipo === 'extremidade' && n.grau === 1)).toBe(true);
    expect(g.arestas).toEqual([{ id: 'a1', noA: 'n1', noB: 'n2', paredeId: 'p1', comprimento: 100 }]);
  });

  it('cruzamento em X → 1 nó X de grau 4', () => {
    const paredes = [
      { id: 'h', pontos: [{ x: 0, y: 50 }, { x: 100, y: 50 }] },
      { id: 'v', pontos: [{ x: 40, y: 0 }, { x: 40, y: 100 }] },
    ];
    const g = construirGrafoParedes(paredes, TOL);
    verificarConsistencia(g);
    expect(g.nos).toHaveLength(5);
    expect(contar(g, 'X')).toBe(1);
    expect(contar(g, 'extremidade')).toBe(4);
    const x = g.nos.find((n) => n.tipo === 'X')!;
    expect(x.grau).toBe(4);
    expect(x.ponto).toEqual({ x: 40, y: 50 });
    expect(g.arestas).toHaveLength(4);
    expect(somaArestas(g)).toBeCloseTo(200, 9);
    expect(g.arestas.filter((a) => a.paredeId === 'h')).toHaveLength(2);
  });

  it('planta em L + parede interna: 6 nós L, T nos encontros, soma das arestas = soma das paredes', () => {
    const g = construirGrafoParedes(plantaL, TOL);
    verificarConsistencia(g);
    expect(contar(g, 'L')).toBe(6);
    expect(contar(g, 'T')).toBe(2);
    expect(g.nos).toHaveLength(8);
    expect(noEm(g, 200, 0)).toMatchObject({ tipo: 'T', grau: 3 });
    expect(noEm(g, 200, 500)).toMatchObject({ tipo: 'T', grau: 3 });
    for (const [x, y] of [
      [0, 0],
      [600, 0],
      [600, 300],
      [300, 300],
      [300, 500],
      [0, 500],
    ] as const) {
      expect(noEm(g, x, y)).toMatchObject({ tipo: 'L', grau: 2 });
    }
    expect(g.arestas).toHaveLength(9);
    expect(somaParedes(plantaL)).toBe(2700);
    expect(somaArestas(g)).toBeCloseTo(somaParedes(plantaL), 9);
    // ids: de cima para baixo, da esquerda para a direita
    expect(g.nos.map((n) => [n.ponto.x, n.ponto.y])).toEqual([
      [0, 0],
      [200, 0],
      [600, 0],
      [300, 300],
      [600, 300],
      [0, 500],
      [200, 500],
      [300, 500],
    ]);
  });

  it('parede interna que para no meio do ambiente: 1 T + 1 extremidade', () => {
    const paredes = [...plantaL.slice(0, 2), { id: 'int-1', pontos: [{ x: 200, y: 0 }, { x: 200, y: 250 }] }];
    const g = construirGrafoParedes(paredes, TOL);
    verificarConsistencia(g);
    expect(contar(g, 'L')).toBe(6);
    expect(contar(g, 'T')).toBe(1);
    expect(contar(g, 'extremidade')).toBe(1);
    expect(somaArestas(g)).toBeCloseTo(somaParedes(paredes), 9);
  });

  it('é determinístico e não altera a entrada', () => {
    const copia = JSON.parse(JSON.stringify(plantaL)) as Parede[];
    const g1 = construirGrafoParedes(plantaL, TOL);
    const g2 = construirGrafoParedes(plantaL, TOL);
    expect(g1).toEqual(g2);
    expect(plantaL).toEqual(copia);
  });

  it('une vértices dentro da tolerância e ajusta o T desenhado com folga', () => {
    const paredes = [
      { id: 'a', pontos: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      { id: 'b', pontos: [{ x: 100.8, y: 0.5 }, { x: 100, y: 80 }] }, // canto com folga
      { id: 'c', pontos: [{ x: 50, y: 1.2 }, { x: 50, y: 60 }] }, // T que não chega a encostar
    ];
    const g = construirGrafoParedes(paredes, TOL);
    verificarConsistencia(g);
    expect(g.nos).toHaveLength(5);
    expect(noEm(g, 100, 0)).toMatchObject({ tipo: 'L', grau: 2 });
    expect(noEm(g, 50, 0)).toMatchObject({ tipo: 'T', grau: 3 }); // projetado sobre a parede hospedeira
    expect(contar(g, 'extremidade')).toBe(3);
    // a parede hospedeira mantém o comprimento exato; o total difere no máximo pela folga do desenho
    const daParedeA = g.arestas.filter((x) => x.paredeId === 'a').reduce((s, x) => s + x.comprimento, 0);
    expect(daParedeA).toBeCloseTo(100, 9);
    expect(Math.abs(somaArestas(g) - somaParedes(paredes))).toBeLessThan(2 * TOL);
  });

  it('fora da tolerância não une nem divide', () => {
    const paredes = [
      { id: 'a', pontos: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      { id: 'c', pontos: [{ x: 50, y: 5 }, { x: 50, y: 60 }] },
    ];
    const g = construirGrafoParedes(paredes, TOL);
    expect(g.nos).toHaveLength(4);
    expect(contar(g, 'extremidade')).toBe(4);
    expect(g.arestas).toHaveLength(2);
  });

  it('grau 2 colinear → passagem (vértice intermediário e duas paredes em sequência)', () => {
    const g1 = construirGrafoParedes(
      [{ id: 'p', pontos: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 120, y: 0 }] }],
      TOL,
    );
    expect(g1.nos.map((n) => n.tipo)).toEqual(['extremidade', 'passagem', 'extremidade']);
    const g2 = construirGrafoParedes(
      [
        { id: 'p1', pontos: [{ x: 0, y: 0 }, { x: 50, y: 0 }] },
        { id: 'p2', pontos: [{ x: 120, y: 0 }, { x: 50, y: 0 }] },
      ],
      TOL,
    );
    expect(g2.nos.map((n) => n.tipo)).toEqual(['extremidade', 'passagem', 'extremidade']);
    expect(somaArestas(g2)).toBe(120);
  });

  it('trechos colineares sobrepostos não geram arestas duplicadas', () => {
    const parcial = construirGrafoParedes(
      [
        { id: 'p1', pontos: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
        { id: 'p2', pontos: [{ x: 50, y: 0 }, { x: 150, y: 0 }] },
      ],
      TOL,
    );
    verificarConsistencia(parcial);
    expect(parcial.arestas).toHaveLength(3);
    expect(somaArestas(parcial)).toBeCloseTo(150, 9); // comprimento da união, sem sobreposição
    expect(parcial.nos.map((n) => n.tipo)).toEqual(['extremidade', 'passagem', 'passagem', 'extremidade']);

    const contida = construirGrafoParedes(
      [
        { id: 'p1', pontos: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
        { id: 'p2', pontos: [{ x: 20, y: 0 }, { x: 80, y: 0 }] },
      ],
      TOL,
    );
    expect(contida.arestas).toHaveLength(3);
    expect(somaArestas(contida)).toBeCloseTo(100, 9);

    const identica = construirGrafoParedes(
      [
        { id: 'p1', pontos: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
        { id: 'p2', pontos: [{ x: 100, y: 0 }, { x: 0, y: 0 }] },
      ],
      TOL,
    );
    expect(identica.arestas).toEqual([{ id: 'a1', noA: 'n1', noB: 'n2', paredeId: 'p1', comprimento: 100 }]);
  });

  it('três paredes cruzando no mesmo ponto → um único nó X de grau 6', () => {
    const g = construirGrafoParedes(
      [
        { id: 'h', pontos: [{ x: 0, y: 50 }, { x: 100, y: 50 }] },
        { id: 'v', pontos: [{ x: 50, y: 0 }, { x: 50, y: 100 }] },
        { id: 'd', pontos: [{ x: 0, y: 0 }, { x: 100, y: 100 }] },
      ],
      TOL,
    );
    verificarConsistencia(g);
    expect(g.nos).toHaveLength(7);
    expect(contar(g, 'X')).toBe(1);
    expect(g.nos.find((n) => n.tipo === 'X')!.grau).toBe(6);
  });

  it('polilinha fechada (último ponto = primeiro) → só nós L', () => {
    const g = construirGrafoParedes(
      [
        {
          id: 'p',
          pontos: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 80 },
            { x: 0, y: 80 },
            { x: 0, y: 0 },
          ],
        },
      ],
      TOL,
    );
    verificarConsistencia(g);
    expect(g.nos).toHaveLength(4);
    expect(contar(g, 'L')).toBe(4);
    expect(somaArestas(g)).toBe(360);
  });

  it('entradas degeneradas', () => {
    expect(construirGrafoParedes([], TOL)).toEqual({ nos: [], arestas: [] });
    expect(construirGrafoParedes([{ id: 'p', pontos: [] }], TOL)).toEqual({ nos: [], arestas: [] });
    expect(construirGrafoParedes([{ id: 'p', pontos: [{ x: 1, y: 1 }] }], TOL)).toEqual({ nos: [], arestas: [] });
    // parede menor que a tolerância colapsa em um ponto
    expect(
      construirGrafoParedes([{ id: 'p', pontos: [{ x: 1, y: 1 }, { x: 1.5, y: 1 }] }], TOL),
    ).toEqual({ nos: [], arestas: [] });
    // tolerância zero ainda une vértices idênticos
    const g = construirGrafoParedes(
      [
        { id: 'a', pontos: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
        { id: 'b', pontos: [{ x: 10, y: 0 }, { x: 10, y: 10 }] },
      ],
      0,
    );
    expect(g.nos.map((n) => n.tipo)).toEqual(['extremidade', 'L', 'extremidade']);
  });

  it('classificarNo', () => {
    const o = { x: 0, y: 0 };
    expect(classificarNo(o, [])).toBe('extremidade');
    expect(classificarNo(o, [{ x: 1, y: 0 }])).toBe('extremidade');
    expect(classificarNo(o, [{ x: -1, y: 0 }, { x: 1, y: 0 }])).toBe('passagem');
    expect(classificarNo(o, [{ x: -1, y: 0 }, { x: 0, y: 1 }])).toBe('L');
    expect(classificarNo(o, [{ x: 1, y: 0 }, { x: 2, y: 0.01 }])).toBe('L'); // dobra sobre si mesma
    expect(classificarNo(o, [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }])).toBe('T');
    expect(classificarNo(o, [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }])).toBe('X');
  });
});
