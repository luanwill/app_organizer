import { describe, expect, it } from 'vitest';
import {
  areaComSinal,
  areaPoligono,
  caixaEnvolvente,
  centroidePoligono,
  comprimentoPolilinha,
  distancia,
  distanciaPontoPoligono,
  intersecaoSegmentos,
  perimetroPoligono,
  pontoEmPoligono,
  pontoNoSegmento,
  projetarNaPolilinha,
  projetarNoSegmento,
  restringirOrtogonal,
  retanguloParaPoligono,
  segmentosDaPolilinha,
  snapVertice,
} from './index';

const quadradoHorario = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];
const quadradoAntiHorario = [...quadradoHorario].reverse();
// "L": 20×20 sem o quadrante 10×10 inferior direito
const formaL = [
  { x: 0, y: 0 },
  { x: 20, y: 0 },
  { x: 20, y: 10 },
  { x: 10, y: 10 },
  { x: 10, y: 20 },
  { x: 0, y: 20 },
];

describe('distância e comprimento', () => {
  it('distancia', () => {
    expect(distancia({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(distancia({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(0);
  });

  it('comprimentoPolilinha aberta e fechada', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 4 },
    ];
    expect(comprimentoPolilinha(pts)).toBe(7);
    expect(comprimentoPolilinha(pts, true)).toBe(12);
  });

  it('casos de borda: lista vazia, 1 e 2 pontos', () => {
    expect(comprimentoPolilinha([])).toBe(0);
    expect(comprimentoPolilinha([{ x: 1, y: 1 }], true)).toBe(0);
    // 2 pontos "fechados" não duplicam o segmento
    expect(comprimentoPolilinha([{ x: 0, y: 0 }, { x: 5, y: 0 }], true)).toBe(5);
    expect(segmentosDaPolilinha([])).toEqual([]);
    expect(segmentosDaPolilinha(quadradoHorario, true)).toHaveLength(4);
    expect(segmentosDaPolilinha(quadradoHorario)).toHaveLength(3);
  });
});

describe('polígonos', () => {
  it('área absoluta independe do sentido', () => {
    expect(areaPoligono(quadradoHorario)).toBe(100);
    expect(areaPoligono(quadradoAntiHorario)).toBe(100);
    expect(areaComSinal(quadradoHorario)).toBe(-areaComSinal(quadradoAntiHorario));
    expect(areaPoligono(formaL)).toBe(300);
  });

  it('área/perímetro degenerados', () => {
    expect(areaPoligono([])).toBe(0);
    expect(areaPoligono([{ x: 0, y: 0 }, { x: 5, y: 5 }])).toBe(0);
    expect(perimetroPoligono([])).toBe(0);
  });

  it('perímetro', () => {
    expect(perimetroPoligono(quadradoHorario)).toBe(40);
    expect(perimetroPoligono(formaL)).toBe(80);
  });

  it('centroide', () => {
    expect(centroidePoligono(quadradoHorario)).toEqual({ x: 5, y: 5 });
    expect(centroidePoligono(quadradoAntiHorario)).toEqual({ x: 5, y: 5 });
    const c = centroidePoligono(formaL);
    // (200·(10,5) + 100·(5,15)) / 300
    expect(c.x).toBeCloseTo(25 / 3, 10);
    expect(c.y).toBeCloseTo(25 / 3, 10);
    expect(centroidePoligono([])).toEqual({ x: 0, y: 0 });
    expect(centroidePoligono([{ x: 0, y: 0 }, { x: 4, y: 2 }])).toEqual({ x: 2, y: 1 });
  });

  it('pontoEmPoligono: dentro, fora, borda, vértice, nos dois sentidos', () => {
    for (const poligono of [quadradoHorario, quadradoAntiHorario]) {
      expect(pontoEmPoligono({ x: 5, y: 5 }, poligono)).toBe(true);
      expect(pontoEmPoligono({ x: 15, y: 5 }, poligono)).toBe(false);
      expect(pontoEmPoligono({ x: -1, y: 5 }, poligono)).toBe(false);
      expect(pontoEmPoligono({ x: 5, y: 10.001 }, poligono)).toBe(false);
      expect(pontoEmPoligono({ x: 10, y: 5 }, poligono)).toBe(true); // borda
      expect(pontoEmPoligono({ x: 0, y: 0 }, poligono)).toBe(true); // vértice
      // raio passando exatamente por vértices (y = 0 e y = 10)
      expect(pontoEmPoligono({ x: -5, y: 0 }, poligono)).toBe(false);
      expect(pontoEmPoligono({ x: -5, y: 10 }, poligono)).toBe(false);
    }
  });

  it('pontoEmPoligono: polígono côncavo e listas degeneradas', () => {
    expect(pontoEmPoligono({ x: 5, y: 15 }, formaL)).toBe(true);
    expect(pontoEmPoligono({ x: 15, y: 5 }, formaL)).toBe(true);
    expect(pontoEmPoligono({ x: 15, y: 15 }, formaL)).toBe(false); // reentrância
    expect(pontoEmPoligono({ x: 5, y: 10 }, formaL)).toBe(true); // alinhado com o vértice reentrante
    expect(pontoEmPoligono({ x: 0, y: 0 }, [])).toBe(false);
    expect(pontoEmPoligono({ x: 1, y: 1 }, [{ x: 0, y: 0 }, { x: 2, y: 2 }])).toBe(false);
  });

  it('distanciaPontoPoligono', () => {
    expect(distanciaPontoPoligono({ x: 5, y: 5 }, quadradoHorario)).toBe(5);
    expect(distanciaPontoPoligono({ x: 13, y: 5 }, quadradoHorario)).toBe(3);
    expect(distanciaPontoPoligono({ x: 0, y: 5 }, quadradoHorario)).toBe(0); // aresta de fechamento
    expect(distanciaPontoPoligono({ x: 0, y: 0 }, [])).toBe(Infinity);
  });

  it('retanguloParaPoligono e caixaEnvolvente', () => {
    const r = retanguloParaPoligono({ x: 10, y: 20 }, { x: 2, y: 5 });
    expect(r).toEqual([
      { x: 10, y: 20 },
      { x: 2, y: 20 },
      { x: 2, y: 5 },
      { x: 10, y: 5 },
    ]);
    expect(areaPoligono(r)).toBe(120);
    expect(caixaEnvolvente(r)).toEqual({ minX: 2, minY: 5, maxX: 10, maxY: 20 });
    expect(caixaEnvolvente([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
    expect(caixaEnvolvente([{ x: -3, y: 7 }])).toEqual({ minX: -3, minY: 7, maxX: -3, maxY: 7 });
  });
});

describe('projeções', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };

  it('projetarNoSegmento: meio, antes, depois e segmento degenerado', () => {
    expect(projetarNoSegmento({ x: 4, y: 3 }, a, b)).toEqual({ ponto: { x: 4, y: 0 }, t: 0.4, distancia: 3 });
    expect(projetarNoSegmento({ x: -3, y: 4 }, a, b)).toEqual({ ponto: { x: 0, y: 0 }, t: 0, distancia: 5 });
    expect(projetarNoSegmento({ x: 13, y: -4 }, a, b)).toEqual({ ponto: { x: 10, y: 0 }, t: 1, distancia: 5 });
    expect(projetarNoSegmento({ x: 3, y: 4 }, a, a)).toEqual({ ponto: { x: 0, y: 0 }, t: 0, distancia: 5 });
  });

  it('pontoNoSegmento', () => {
    expect(pontoNoSegmento({ x: 5, y: 0 }, a, b)).toBe(true);
    expect(pontoNoSegmento({ x: 10, y: 0 }, a, b)).toBe(true);
    expect(pontoNoSegmento({ x: 11, y: 0 }, a, b)).toBe(false);
    expect(pontoNoSegmento({ x: 5, y: 0.5 }, a, b)).toBe(false);
    expect(pontoNoSegmento({ x: 5, y: 0.5 }, a, b, 1)).toBe(true);
  });

  it('projetarNaPolilinha: segmento mais próximo, aberta × fechada', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(projetarNaPolilinha({ x: 9, y: 4 }, pts)).toEqual({
      ponto: { x: 10, y: 4 },
      t: 0.4,
      distancia: 1,
      indiceSegmento: 1,
    });
    // perto do lado de fechamento (x = 0)
    const aberta = projetarNaPolilinha({ x: 1, y: 5 }, pts);
    expect(aberta).toEqual({ ponto: { x: 1, y: 0 }, t: 0.1, distancia: 5, indiceSegmento: 0 });
    const fechada = projetarNaPolilinha({ x: 1, y: 5 }, pts, true);
    expect(fechada).toEqual({ ponto: { x: 0, y: 5 }, t: 0.5, distancia: 1, indiceSegmento: 3 });
  });

  it('projetarNaPolilinha: lista vazia e ponto único', () => {
    expect(projetarNaPolilinha({ x: 1, y: 2 }, [])).toEqual({
      ponto: { x: 1, y: 2 },
      t: 0,
      distancia: Infinity,
      indiceSegmento: -1,
    });
    expect(projetarNaPolilinha({ x: 3, y: 4 }, [{ x: 0, y: 0 }])).toEqual({
      ponto: { x: 0, y: 0 },
      t: 0,
      distancia: 5,
      indiceSegmento: 0,
    });
  });

  it('intersecaoSegmentos', () => {
    expect(intersecaoSegmentos({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toEqual({
      x: 5,
      y: 5,
    });
    expect(intersecaoSegmentos(a, b, { x: 5, y: 1 }, { x: 5, y: 9 })).toBeNull(); // não alcança
    expect(intersecaoSegmentos(a, b, { x: 0, y: 2 }, { x: 10, y: 2 })).toBeNull(); // paralelos
    expect(intersecaoSegmentos(a, b, { x: 5, y: 0 }, { x: 15, y: 0 })).toBeNull(); // colineares
  });
});

describe('snap e trava ortogonal', () => {
  it('restringirOrtogonal', () => {
    const o = { x: 10, y: 10 };
    expect(restringirOrtogonal(o, { x: 30, y: 14 })).toEqual({ x: 30, y: 10 });
    expect(restringirOrtogonal(o, { x: 12, y: -40 })).toEqual({ x: 10, y: -40 });
    expect(restringirOrtogonal(o, { x: 15, y: 15 })).toEqual({ x: 15, y: 10 }); // empate → horizontal
    expect(restringirOrtogonal(o, o)).toEqual(o);
  });

  it('snapVertice: mais próximo dentro da tolerância', () => {
    const candidatos = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10.5, y: 0 },
    ];
    expect(snapVertice({ x: 10.4, y: 0.1 }, candidatos, 2)).toEqual({ x: 10.5, y: 0 });
    expect(snapVertice({ x: 5, y: 0 }, candidatos, 2)).toBeNull();
    expect(snapVertice({ x: 2, y: 0 }, candidatos, 2)).toEqual({ x: 0, y: 0 }); // limite inclusive
    expect(snapVertice({ x: 0, y: 0 }, [], 5)).toBeNull();
  });

  it('funções não alteram os argumentos', () => {
    const pts = [{ x: 1, y: 1 }];
    const resultado = snapVertice({ x: 1, y: 1 }, pts, 1);
    expect(resultado).not.toBe(pts[0]);
    expect(pts).toEqual([{ x: 1, y: 1 }]);
  });
});
