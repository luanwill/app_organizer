import { describe, expect, it } from 'vitest';
import { comprimentoPolilinha, contarMudancasDirecao, rotaOrtogonal } from './index';

describe('rotaOrtogonal', () => {
  it('em L: primeiro horizontal, depois vertical', () => {
    const rota = rotaOrtogonal({ x: 10, y: 20 }, { x: 50, y: 5 });
    expect(rota).toEqual([
      { x: 10, y: 20 },
      { x: 50, y: 20 },
      { x: 50, y: 5 },
    ]);
    expect(comprimentoPolilinha(rota)).toBe(55);
    expect(contarMudancasDirecao(rota)).toBe(1);
  });

  it('pontos alinhados: sem ponto intermediário duplicado', () => {
    expect(rotaOrtogonal({ x: 0, y: 7 }, { x: 30, y: 7 })).toEqual([
      { x: 0, y: 7 },
      { x: 30, y: 7 },
    ]);
    expect(rotaOrtogonal({ x: 4, y: 0 }, { x: 4, y: -9 })).toEqual([
      { x: 4, y: 0 },
      { x: 4, y: -9 },
    ]);
  });

  it('pontos coincidentes: um único ponto', () => {
    expect(rotaOrtogonal({ x: 3, y: 3 }, { x: 3, y: 3 })).toEqual([{ x: 3, y: 3 }]);
  });

  it('devolve cópias (não altera nem reaproveita os argumentos)', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 1, y: 1 };
    const rota = rotaOrtogonal(a, b);
    expect(rota[0]).not.toBe(a);
    expect(rota[2]).not.toBe(b);
  });
});

describe('contarMudancasDirecao', () => {
  it('listas degeneradas → 0', () => {
    expect(contarMudancasDirecao([])).toBe(0);
    expect(contarMudancasDirecao([{ x: 1, y: 1 }])).toBe(0);
    expect(contarMudancasDirecao([{ x: 0, y: 0 }, { x: 5, y: 5 }])).toBe(0);
  });

  it('pontos alinhados não contam; pontos repetidos são ignorados', () => {
    expect(
      contarMudancasDirecao([
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 0 },
        { x: 9, y: 0 },
        { x: 20, y: 0 },
      ]),
    ).toBe(0);
  });

  it('conta cada curva, inclusive a inversão de sentido', () => {
    expect(
      contarMudancasDirecao([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 10 },
        { x: 20, y: 0 },
      ]),
    ).toBe(3);
    expect(contarMudancasDirecao([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 4, y: 0 }])).toBe(1);
    // curva de 45°
    expect(contarMudancasDirecao([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }])).toBe(1);
  });

  it('ponto repetido no canto não esconde a curva', () => {
    expect(
      contarMudancasDirecao([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toBe(1);
  });
});
