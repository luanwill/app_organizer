import { describe, expect, it } from 'vitest';
import type { Elemento, Ferramenta, PropsCalha, PropsTelhado } from '@/core/model';
import { centroidePoligono } from '@/core/calc';
import { linhasCumeeira, linhasHachura, tracejadoCalha } from './cobertura';
import { ESTILO_TIPO, TRACEJADO_RUFO } from './config';
import { construirElemento, ordenarParaDesenho, vincularElemento } from './elementos';
import { ancoraRotuloTelhado, rotuloDoElemento } from './rotulos';

const ret = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }];

describe('cumeeira e espigões', () => {
  it('1 água: nenhuma linha', () => {
    expect(linhasCumeeira(ret, 1, 'horizontal')).toEqual([]);
  });

  it('2 águas: cumeeira no meio, na direção indicada', () => {
    expect(linhasCumeeira(ret, 2, 'horizontal')).toEqual([{ a: { x: 0, y: 50 }, b: { x: 200, y: 50 } }]);
    expect(linhasCumeeira(ret, 2, 'vertical')).toEqual([{ a: { x: 100, y: 0 }, b: { x: 100, y: 100 } }]);
  });

  it('4 águas: cumeeira encurtada pela metade da largura menor + 4 espigões aos cantos', () => {
    const l = linhasCumeeira(ret, 4, 'horizontal');
    expect(l).toHaveLength(5);
    expect(l[0]).toEqual({ a: { x: 50, y: 50 }, b: { x: 150, y: 50 } });
    expect(l.slice(1).map((s) => s.a)).toEqual([{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 200, y: 0 }, { x: 200, y: 100 }]);
  });

  it('4 águas em planta quadrada vira pirâmide (sem cumeeira)', () => {
    const q = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const l = linhasCumeeira(q, 4, 'vertical');
    expect(l).toHaveLength(4);
    for (const s of l) expect(s.b).toEqual({ x: 50, y: 50 });
  });
});

describe('hachura', () => {
  it('linhas a 45° dentro da caixa, com o espaçamento pedido', () => {
    const l = linhasHachura(ret, 20);
    expect(l.length).toBe(15); // (largura + altura) / passo
    for (const { a, b } of l) {
      expect(b.x - a.x).toBeCloseTo(b.y - a.y, 9);
      for (const p of [a, b]) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-9);
        expect(p.x).toBeLessThanOrEqual(200 + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(-1e-9);
        expect(p.y).toBeLessThanOrEqual(100 + 1e-9);
      }
    }
    expect(linhasHachura(ret, 0)).toEqual([]);
    expect(linhasHachura(ret.slice(0, 2), 10)).toEqual([]);
  });
});

describe('telhado e calha pelas ferramentas', () => {
  const novo = (ferramenta: Ferramenta, pontos: { x: number; y: number }[]) =>
    construirElemento({ ferramenta, pontos, pagina: 1, id: 'n', espessuraParede: null });
  const telhado: PropsTelhado = { tipoTelha: null, inclinacaoPct: null, aguas: 2, direcao: 'horizontal', beiral: 0.5 };

  it('alvo telhado com polígono/retângulo → telhado (estrutura) com geometria de polígono', () => {
    const el = novo({ modo: 'retangulo', alvo: { tipo: 'telhado', props: telhado, rotulo: 'T1' } }, [{ x: 0, y: 0 }, { x: 50, y: 30 }]);
    expect(el).toMatchObject({ tipo: 'telhado', disciplina: 'estrutura', rotulo: 'T1', props: telhado, origem: 'desenhado', status: 'confirmado' });
    expect(el?.geometria.tipo).toBe('poligono');
    const pol = novo({ modo: 'poligono', alvo: { tipo: 'telhado', props: telhado } }, [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }]);
    expect(pol?.geometria.tipo).toBe('poligono');
  });

  it('alvo calha/rufo com polilinha → polilinha; condutor com ponto → ponto', () => {
    const calha: PropsCalha = { funcao: 'calha', desenvolvimentoCm: 33 };
    const el = novo({ modo: 'polilinha', alvo: { tipo: 'calha', props: calha } }, [{ x: 0, y: 0 }, { x: 50, y: 0 }]);
    expect(el).toMatchObject({ tipo: 'calha', disciplina: 'estrutura', props: calha, geometria: { tipo: 'polilinha' } });
    const cd = novo({ modo: 'ponto', alvo: { tipo: 'calha', props: { funcao: 'condutor', diametroMm: 100 } } }, [{ x: 3, y: 4 }]);
    expect(cd?.geometria).toEqual({ tipo: 'ponto', ponto: { x: 3, y: 4 } });
    expect('elemento' in vincularElemento(cd as Elemento, [], 30)).toBe(true);
  });

  it('condutor mostra "CD"; rufo tracejado, calha contínua; telhado desenhado embaixo', () => {
    const cd = novo({ modo: 'ponto', alvo: { tipo: 'calha', props: { funcao: 'condutor' } } }, [{ x: 3, y: 4 }]) as Elemento;
    expect(rotuloDoElemento(cd, { escala: 0.02, esquadrias: [], contagens: new Map() }).simbolo).toBe('CD');
    expect(ESTILO_TIPO.calha.letra).toBe('CD');
    expect(tracejadoCalha('rufo', TRACEJADO_RUFO)).toEqual(TRACEJADO_RUFO);
    expect(tracejadoCalha('calha', TRACEJADO_RUFO)).toBeUndefined();
    const tel = novo({ modo: 'retangulo', alvo: { tipo: 'telhado', props: telhado } }, [{ x: 0, y: 0 }, { x: 9, y: 9 }]) as Elemento;
    expect(ordenarParaDesenho([cd, tel]).map((e) => e.tipo)).toEqual(['telhado', 'calha']);
  });
});

describe('rótulo do telhado', () => {
  it('no topo, centralizado, dentro do polígono (longe do centro onde ficam laje/ambiente)', () => {
    expect(ancoraRotuloTelhado(ret, 4, 6)).toEqual({ x: 100, y: 10 });
    // em U: o topo central cai fora do polígono → centroide
    const u = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 100 }, { x: 90, y: 100 }, { x: 90, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 110 }, { x: 0, y: 110 }];
    expect(ancoraRotuloTelhado(u, 4, 6)).toEqual(centroidePoligono(u));
  });
});
