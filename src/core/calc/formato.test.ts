import { describe, expect, it } from 'vitest';
import { arredondar, formatarNumero, formatarQuantidade, lerNumero } from './index';

describe('arredondar', () => {
  it('padrão 2 casas, sem erro de ponto flutuante', () => {
    expect(arredondar(1.005)).toBe(1.01);
    expect(arredondar(2.675)).toBe(2.68);
    expect(arredondar(1.255)).toBe(1.26);
    expect(arredondar(8.345)).toBe(8.35);
    expect(arredondar(0.1 + 0.2)).toBe(0.3);
    expect(arredondar(9.1486)).toBe(9.15);
    expect(arredondar(1.004)).toBe(1);
  });

  it('casas configuráveis, negativos e zero', () => {
    expect(arredondar(3.14159, 3)).toBe(3.142);
    expect(arredondar(12.5, 0)).toBe(13);
    expect(arredondar(-1.005)).toBe(-1.01);
    expect(Object.is(arredondar(-0.001), 0)).toBe(true);
    expect(arredondar(1234567.895)).toBe(1234567.9);
    expect(arredondar(NaN)).toBeNaN();
    expect(arredondar(Infinity)).toBe(Infinity);
  });
});

describe('formatarNumero / formatarQuantidade', () => {
  it('pt-BR: vírgula decimal e ponto de milhar', () => {
    expect(formatarNumero(1234.5)).toBe('1.234,50');
    expect(formatarNumero(1234.56)).toBe('1.234,56');
    expect(formatarNumero(1234567.891)).toBe('1.234.567,89');
    expect(formatarNumero(0)).toBe('0,00');
    expect(formatarNumero(999.999)).toBe('1.000,00');
    expect(formatarNumero(1.005)).toBe('1,01');
    expect(formatarNumero(-1234.5)).toBe('-1.234,50');
    expect(formatarNumero(-0.001)).toBe('0,00');
    expect(formatarNumero(12, 0)).toBe('12');
    expect(formatarNumero(3.07, 3)).toBe('3,070');
    expect(formatarNumero(NaN)).toBe('—');
  });

  it('quantidade com unidade', () => {
    expect(formatarQuantidade(12.1, 'm')).toBe('12,10 m');
    expect(formatarQuantidade(9.1486, 'm²')).toBe('9,15 m²');
    expect(formatarQuantidade(7, 'un', 0)).toBe('7 un');
    expect(formatarQuantidade(1.5, '')).toBe('1,50');
  });
});

describe('lerNumero', () => {
  it('aceita vírgula ou ponto decimal e milhar pt-BR', () => {
    expect(lerNumero('3,07')).toBe(3.07);
    expect(lerNumero('3.07')).toBe(3.07);
    expect(lerNumero('1.234,56')).toBe(1234.56);
    expect(lerNumero('1.234.567')).toBe(1234567);
    expect(lerNumero(' 12 ')).toBe(12);
    expect(lerNumero('-2,5')).toBe(-2.5);
    expect(lerNumero(',5')).toBe(0.5);
    expect(lerNumero('3,')).toBe(3);
    expect(lerNumero('1 234,5')).toBe(1234.5);
  });

  it('inválido → null', () => {
    expect(lerNumero('abc')).toBeNull();
    expect(lerNumero('')).toBeNull();
    expect(lerNumero('   ')).toBeNull();
    expect(lerNumero(',')).toBeNull();
    expect(lerNumero('-')).toBeNull();
    expect(lerNumero('3,07m')).toBeNull();
    expect(lerNumero('1,2,3')).toBeNull();
    expect(lerNumero('1.2.3')).toBeNull();
    expect(lerNumero('12.34,5')).toBeNull();
    expect(lerNumero('1e5')).toBeNull();
    expect(lerNumero('Infinity')).toBeNull();
  });

  it('ida e volta com formatarNumero', () => {
    expect(lerNumero(formatarNumero(1234.5))).toBe(1234.5);
    expect(lerNumero(formatarNumero(-98765.43))).toBe(-98765.43);
  });
});
