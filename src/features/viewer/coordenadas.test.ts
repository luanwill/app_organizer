import { describe, expect, it } from 'vitest';
import { ZOOM_MAX, ZOOM_MIN } from './config';
import { ajustarATela, escalaRenderizacao, pdfParaTela, telaParaPdf, zoomNoPonto, type Vista } from './coordenadas';

describe('conversão tela ↔ PDF', () => {
  const vista: Vista = { zoom: 2.5, x: 40, y: -30 };

  it('converte e desconverte', () => {
    const pdf = { x: 123.4, y: 56.7 };
    const tela = pdfParaTela(vista, pdf);
    expect(tela).toEqual({ x: 123.4 * 2.5 + 40, y: 56.7 * 2.5 - 30 });
    const volta = telaParaPdf(vista, tela);
    expect(volta.x).toBeCloseTo(pdf.x, 9);
    expect(volta.y).toBeCloseTo(pdf.y, 9);
  });
});

describe('zoom centrado no cursor', () => {
  it('mantém sob o cursor o mesmo ponto do PDF', () => {
    const vista: Vista = { zoom: 1.3, x: 17, y: -220 };
    const cursor = { x: 412, y: 305 };
    const antes = telaParaPdf(vista, cursor);
    for (const novoZoom of [0.4, 1.3, 2, 7.5]) {
      const nova = zoomNoPonto(vista, cursor, novoZoom);
      expect(nova.zoom).toBe(novoZoom);
      const depois = telaParaPdf(nova, cursor);
      expect(depois.x).toBeCloseTo(antes.x, 9);
      expect(depois.y).toBeCloseTo(antes.y, 9);
    }
  });

  it('respeita os limites de zoom sem deslocar o ponto', () => {
    const vista: Vista = { zoom: 1, x: 0, y: 0 };
    const cursor = { x: 100, y: 50 };
    const max = zoomNoPonto(vista, cursor, ZOOM_MAX * 10);
    expect(max.zoom).toBe(ZOOM_MAX);
    expect(telaParaPdf(max, cursor).x).toBeCloseTo(100, 9);
    expect(zoomNoPonto(vista, cursor, 0).zoom).toBe(ZOOM_MIN);
  });
});

describe('ajustar à tela', () => {
  it('enquadra a página inteira, centralizada, com margem', () => {
    const v = ajustarATela(1000, 500, 840, 640, 20);
    expect(v.zoom).toBeCloseTo(0.8, 9); // limitado pela largura: (840 − 40) / 1000
    expect(v.x).toBeCloseTo(20, 9);
    expect(v.y).toBeCloseTo((640 - 400) / 2, 9);
  });

  it('não quebra sem dimensões', () => {
    expect(ajustarATela(0, 0, 800, 600, 20).zoom).toBe(1);
  });
});

describe('escala de renderização do PDF', () => {
  it('acompanha zoom × pixel ratio e respeita o limite de pixels', () => {
    expect(escalaRenderizacao(2, 2, 100, 100, 1e9)).toBe(4);
    const limitada = escalaRenderizacao(50, 2, 1000, 1000, 4_000_000);
    expect(limitada).toBeCloseTo(2, 9);
  });
});
