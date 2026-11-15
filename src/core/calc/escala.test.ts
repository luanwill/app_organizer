import { describe, expect, it } from 'vitest';
import {
  areaPoligono,
  arredondar,
  calcularEscala,
  distancia,
  escalaValida,
  formatarQuantidade,
  paraM2,
  paraMetros,
  paraUnidades,
  perimetroPoligono,
  retanguloParaPoligono,
} from './index';

describe('calibração por cota', () => {
  // linha inclinada desenhada sobre uma cota de 3,07 m
  const p1 = { x: 112.4, y: 318.9 };
  const p2 = { x: 265.1, y: 331.2 };
  const escala = calcularEscala(p1, p2, 3.07);

  it('medir a mesma linha devolve 3,07 m (erro < 1%)', () => {
    const medido = paraMetros(distancia(p1, p2), escala);
    expect(Math.abs(medido - 3.07) / 3.07).toBeLessThan(0.01);
    expect(medido).toBeCloseTo(3.07, 10);
  });

  it('outra linha de proporção conhecida (2×, em outra direção) devolve 6,14 m (erro < 1%)', () => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    // perpendicular com o dobro do comprimento
    const q1 = { x: 50, y: 60 };
    const q2 = { x: q1.x - 2 * dy, y: q1.y + 2 * dx };
    const medido = paraMetros(distancia(q1, q2), escala);
    expect(Math.abs(medido - 6.14) / 6.14).toBeLessThan(0.01);
  });

  it('entradas inválidas → NaN (nunca um valor assumido)', () => {
    expect(calcularEscala(p1, p1, 3.07)).toBeNaN();
    expect(calcularEscala(p1, p2, 0)).toBeNaN();
    expect(calcularEscala(p1, p2, -2)).toBeNaN();
    expect(calcularEscala(p1, p2, NaN)).toBeNaN();
    expect(escalaValida(escala)).toBe(true);
    expect(escalaValida(NaN)).toBe(false);
    expect(escalaValida(0)).toBe(false);
    expect(escalaValida(null)).toBe(false);
  });
});

describe('conversões', () => {
  it('paraMetros, paraM2 e paraUnidades', () => {
    expect(paraMetros(150, 0.02)).toBeCloseTo(3, 12);
    expect(paraM2(10000, 0.02)).toBeCloseTo(4, 12);
    expect(paraUnidades(3, 0.02)).toBeCloseTo(150, 9);
    expect(paraUnidades(paraMetros(123.4, 0.0137), 0.0137)).toBeCloseTo(123.4, 9);
    expect(paraUnidades(3, 0)).toBeNaN();
  });

  it('ambiente retangular 3,07 × 2,98 m: área 9,15 m² e perímetro 12,10 m', () => {
    const escala = 0.02;
    const origem = { x: 40, y: 75 };
    const oposto = { x: origem.x + paraUnidades(3.07, escala), y: origem.y + paraUnidades(2.98, escala) };
    const ambiente = retanguloParaPoligono(origem, oposto);
    const area = arredondar(paraM2(areaPoligono(ambiente), escala));
    const perimetro = arredondar(paraMetros(perimetroPoligono(ambiente), escala));
    expect(area).toBe(9.15);
    expect(perimetro).toBe(12.1);
    expect(formatarQuantidade(area, 'm²')).toBe('9,15 m²');
    expect(formatarQuantidade(perimetro, 'm')).toBe('12,10 m');
  });
});
