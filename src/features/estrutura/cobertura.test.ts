import { describe, expect, it } from 'vitest';
import type { Elemento, ElementoDe, Ponto, Projeto, TipoElemento } from '@/core/model';
import { areaPoligono, caixaEnvolvente, comprimentoPolilinha } from '@/core/calc';
import { ESCALA, ambiente, parede, projetoCom, pt, u } from './apoio-teste';
import { calcularEstrutura } from './calcular';
import {
  bordasBaixas,
  comprimentoCumeeira,
  cumeeiraQuatroAguas,
  fatorInclinacao,
  numeroCondutores,
  recortarSegmentoNoPoligono,
  retangulosMaximos,
} from './cobertura';
import { sugerirEstrutura } from './sugerir';

const doTipo = <K extends TipoElemento>(els: Elemento[], tipo: K): Extract<Elemento, { tipo: K }>[] =>
  els.filter((e): e is Extract<Elemento, { tipo: K }> => e.tipo === tipo);
const pontosDe = (e: Elemento): Ponto[] =>
  e.geometria.tipo === 'ponto' ? [e.geometria.ponto] : e.geometria.pontos;
const m = (v: number): number => +(v * ESCALA).toFixed(4);
const caixaM = (e: Elemento) => {
  const c = caixaEnvolvente(pontosDe(e));
  return [m(c.minX), m(c.minY), m(c.maxX), m(c.maxY)];
};
const calhas = (els: Elemento[], funcao: 'calha' | 'rufo' | 'condutor') =>
  doTipo(els, 'calha').filter((c) => c.props.funcao === funcao);
const comprimentoM = (e: Elemento) => comprimentoPolilinha(pontosDe(e)) * ESCALA;

/** Paredes de 15 cm com eixo deslocado 7,5 cm para dentro: a face externa forma o retângulo dado. */
function casaRetangular(largura: number, profundidade: number): Elemento[] {
  const h = 0.075;
  const [x0, y0, x1, y1] = [h, h, largura - h, profundidade - h];
  return [
    parede('pn', [x0, y0], [x1, y0]),
    parede('pl', [x1, y0], [x1, y1]),
    parede('ps', [x1, y1], [x0, y1]),
    parede('po', [x0, y1], [x0, y0]),
    ambiente('sala', 0.15, 0.15, largura - 0.15, profundidade - 0.15),
  ];
}

/** "L": corpo 10 × 6 m (face externa) + ala 4 × 4 m embaixo, à esquerda. */
function casaEmL(): Elemento[] {
  const h = 0.075;
  return [
    parede('a', [h, h], [10 - h, h]),
    parede('b', [10 - h, h], [10 - h, 6 - h]),
    parede('c', [10 - h, 6 - h], [4 - h, 6 - h]),
    parede('d', [4 - h, 6 - h], [4 - h, 10 - h]),
    parede('e', [4 - h, 10 - h], [h, 10 - h]),
    parede('f', [h, 10 - h], [h, h]),
    parede('g', [h, 6 - h], [4 - h, 6 - h]), // parede interna entre o corpo e a ala
    ambiente('estar', 0.15, 0.15, 9.85, 5.85),
    ambiente('quarto', 0.15, 6, 3.85, 9.85),
  ];
}

function comTipo(projeto: Projeto, sugestoes: Elemento[], tipoTelha: 'ceramica' | null = 'ceramica'): Projeto {
  return projetoCom([
    ...projeto.elementos,
    ...sugestoes.map((e) => (e.tipo === 'telhado' ? { ...e, props: { ...e.props, tipoTelha } } : e)),
  ]);
}

describe('fórmulas da cobertura', () => {
  it('fator de inclinação, condutores por calha e cumeeira de 4 águas', () => {
    expect(fatorInclinacao(0.3)).toBeCloseTo(Math.sqrt(1.09), 12);
    expect(numeroCondutores(9.2, 10)).toBe(1);
    expect(numeroCondutores(10, 10)).toBe(1);
    expect(numeroCondutores(10.5, 10)).toBe(2);
    expect(numeroCondutores(0.5, 10)).toBe(1);
    // retângulo 10 × 6: cumeeira 4 m + 4 espigões de 3·√(2 + i²)
    expect(cumeeiraQuatroAguas(10, 6, 0.3)).toBeCloseTo(4 + 4 * 3 * Math.sqrt(2.09), 12);
    expect(cumeeiraQuatroAguas(6, 10, 0)).toBeCloseTo(4 + 12 * Math.SQRT2, 12);
  });

  it('decompõe o L tomando o maior retângulo primeiro', () => {
    const l = [pt(0, 0), pt(10, 0), pt(10, 6), pt(4, 6), pt(4, 10), pt(0, 10)];
    const r = retangulosMaximos(l).map((q) => [m(q.x0), m(q.y0), m(q.x1), m(q.y1)]);
    expect(r).toEqual([[0, 0, 10, 6], [0, 6, 4, 10]]);
    expect(comprimentoCumeeira(l, 4, 'horizontal', 0.3) * ESCALA).toBeCloseTo(
      cumeeiraQuatroAguas(10, 6, 0.3) + cumeeiraQuatroAguas(4, 4, 0.3),
      9,
    );
    expect(comprimentoCumeeira(l, 2, 'vertical', 0.3) * ESCALA).toBeCloseTo(10, 9);
    expect(comprimentoCumeeira(l, 1, 'vertical', 0.3)).toBe(0);
  });

  it('bordas baixas por nº de águas', () => {
    const r = [pt(0, 0), pt(8, 0), pt(8, 5), pt(0, 5)];
    const tol = u(0.1);
    expect(bordasBaixas(r, 4, 'horizontal', tol)).toHaveLength(4);
    expect(bordasBaixas(r, 2, 'horizontal', tol).map(([a, b]) => [a.y, b.y].map(m))).toEqual([[0, 0], [5, 5]]);
    expect(bordasBaixas(r, 2, 'vertical', tol).map(([a]) => m(a.x))).toEqual([8, 0]);
    expect(bordasBaixas(r, 1, 'vertical', tol).map(([a, b]) => [m(a.y), m(b.y)])).toEqual([[5, 5]]);
    expect(bordasBaixas(r, 1, 'horizontal', tol).map(([a]) => m(a.x))).toEqual([8]);
  });

  it('recorta segmento no polígono', () => {
    const r = [pt(0, 0), pt(8, 0), pt(8, 5), pt(0, 5)];
    const partes = recortarSegmentoNoPoligono(pt(4, -3), pt(4, 9), r, u(0.01));
    expect(partes.map(([a, b]) => [m(a.y), m(b.y)])).toEqual([[0, 5]]);
    expect(recortarSegmentoNoPoligono(pt(10, 0), pt(12, 0), r, u(0.01))).toEqual([]);
  });
});

describe('sugestão de cobertura — casa retangular 6 × 8 m', () => {
  const projeto = projetoCom(casaRetangular(6, 8));
  const sugestoes = sugerirEstrutura(projeto, 1);
  const telhados = doTipo(sugestoes, 'telhado');

  it('um telhado = contorno externo das paredes + beiral de 0,60 m, 2 águas no maior lado', () => {
    expect(telhados).toHaveLength(1);
    const t = telhados[0]!;
    expect(t.rotulo).toBe('T1');
    expect(t.status).toBe('pendente');
    expect(t.origem).toBe('sugerido-auto');
    expect(t.props).toEqual({ tipoTelha: null, inclinacaoPct: null, aguas: 2, direcao: 'vertical', beiral: 0.6 });
    expect(t.vinculos.ambienteIds).toEqual(['sala']);
    expect(caixaM(t)).toEqual([-0.6, -0.6, 6.6, 8.6]);
    expect(areaPoligono(pontosDe(t)) * ESCALA ** 2).toBeCloseTo(7.2 * 9.2, 6);
  });

  it('2 calhas de 9,20 m nos beirais paralelos à cumeeira e 1 condutor por calha', () => {
    const ch = calhas(sugestoes, 'calha');
    expect(ch.map((c) => c.rotulo)).toEqual(['CH1', 'CH2']);
    for (const c of ch) {
      expect(comprimentoM(c)).toBeCloseTo(9.2, 6);
      expect(c.vinculos.telhadoId).toBe(telhados[0]!.id);
      expect(c.props).toEqual({ funcao: 'calha' });
    }
    const cd = calhas(sugestoes, 'condutor');
    expect(cd.map((c) => c.rotulo)).toEqual(['CD1', 'CD2']);
    expect(cd.every((c) => c.geometria.tipo === 'ponto' && c.vinculos.telhadoId === telhados[0]!.id)).toBe(true);
    expect(calhas(sugestoes, 'rufo')).toHaveLength(0);
    for (const e of sugestoes) expect([e.status, e.origem]).toEqual(['pendente', 'sugerido-auto']);
  });

  it('quantitativos a 30 % (cerâmica): área inclinada, cumeeira 9,20 m, calhas e condutores', () => {
    const r = calcularEstrutura(comTipo(projeto, sugestoes));
    const doTelhado = Object.fromEntries(
      r.linhas.filter((l) => l.elementoIds[0] === telhados[0]!.id).map((l) => [l.id.split(':')[1], l]),
    );
    const area = 7.2 * 9.2;
    expect(doTelhado['area-projetada']!.quantidade).toBeCloseTo(area, 6);
    expect(doTelhado.telhamento).toMatchObject({ servico: 'telhamento', detalhe: 'ceramica', unidade: 'm²', grupo: 'Cobertura', status: 'pendente' });
    expect(doTelhado.telhamento!.quantidade).toBeCloseTo(area * Math.sqrt(1.09), 6);
    expect(doTelhado.madeiramento).toMatchObject({ servico: 'madeiramento', detalhe: 'ceramica' });
    expect(doTelhado.madeiramento!.quantidade).toBeCloseTo(area * Math.sqrt(1.09), 6);
    expect(doTelhado.cumeeira).toMatchObject({ servico: 'cumeeira', unidade: 'm' });
    expect(doTelhado.cumeeira!.quantidade).toBeCloseTo(9.2, 6);

    const soma = (servico: string) => r.linhas.filter((l) => l.servico === servico).reduce((s, l) => s + l.quantidade, 0);
    expect(soma('calha')).toBeCloseTo(18.4, 6);
    // 2 condutores × pé-direito 2,80 m
    expect(soma('condutor')).toBeCloseTo(5.6, 6);
    const calha = r.linhas.find((l) => l.servico === 'calha')!;
    expect(calha).toMatchObject({ grupo: 'Calhas e condutores', detalhe: 'desenvolvimento 50 cm' });
    expect(r.linhas.find((l) => l.servico === 'condutor')!.detalhe).toBe('Ø100 mm');
    expect(r.alertas).toEqual([]);
  });

  it('inclinação própria substitui a do tipo; altura do condutor do parâmetro substitui o pé-direito', () => {
    const p = comTipo(projeto, sugestoes);
    p.elementos = p.elementos.map((e) => (e.tipo === 'telhado' ? { ...e, props: { ...e.props, inclinacaoPct: 50 } } : e));
    p.parametros.estrutura.cobertura.alturaCondutor = 3.5;
    const r = calcularEstrutura(p);
    expect(r.linhas.find((l) => l.servico === 'telhamento')!.quantidade).toBeCloseTo(7.2 * 9.2 * Math.sqrt(1.25), 6);
    expect(r.linhas.filter((l) => l.servico === 'condutor').reduce((s, l) => s + l.quantidade, 0)).toBeCloseTo(7, 6);
  });

  it('sem tipo de telha → alerta tipoTelha e nenhum telhamento/madeiramento/cumeeira', () => {
    const r = calcularEstrutura(comTipo(projeto, sugestoes, null));
    expect(r.alertas).toHaveLength(1);
    expect(r.alertas[0]).toMatchObject({ disciplina: 'estrutura', campo: 'tipoTelha', elementoId: telhados[0]!.id });
    expect(r.linhas.some((l) => ['telhamento', 'madeiramento', 'cumeeira'].includes(l.servico ?? ''))).toBe(false);
    expect(r.linhas.some((l) => l.id.endsWith(':area-projetada'))).toBe(true);
  });

  it('confirmado sem tipo de telha continua sem telhamento confirmado', () => {
    const confirmado = comTipo(projeto, sugestoes, null);
    confirmado.elementos = confirmado.elementos.map((e) => ({ ...e, status: 'confirmado' as const }));
    const r = calcularEstrutura(confirmado);
    expect(r.linhas.some((l) => l.servico === 'telhamento' && l.status === 'confirmado')).toBe(false);
    expect(r.alertas.map((a) => a.campo)).toEqual(['tipoTelha']);
  });

  it('sem pé-direito nem altura do condutor → alerta e sem linha de condutor', () => {
    const p = comTipo(projeto, sugestoes);
    p.parametros.gerais.peDireito = null;
    const r = calcularEstrutura(p);
    expect(r.alertas.map((a) => a.campo)).toContain('peDireito');
    expect(r.linhas.some((l) => l.servico === 'condutor')).toBe(false);
    expect(r.linhas.some((l) => l.servico === 'calha')).toBe(true);
  });

  it('re-sugerir depois de aceitar não duplica telhado, calhas nem condutores', () => {
    const aceito = projetoCom([...projeto.elementos, ...sugestoes.map((e) => ({ ...e, status: 'confirmado' as const }))]);
    expect(sugerirEstrutura(aceito, 1)).toEqual([]);
    // telhado desenhado à mão sem calhas: só as calhas/condutores dele são sugeridos
    const soTelhado = projetoCom([
      ...projeto.elementos,
      ...sugestoes.map((e) => ({ ...e, status: 'confirmado' as const })).filter((e) => e.tipo !== 'calha'),
    ]);
    const novas = sugerirEstrutura(soTelhado, 1);
    expect(novas.every((e) => e.tipo === 'calha')).toBe(true);
    expect(novas.map((e) => e.rotulo)).toEqual(['CH1', 'CD1', 'CH2', 'CD2']);
    // sugestões pendentes anteriores são substituídas: mesma saída, sem acumular
    expect(sugerirEstrutura(projetoCom([...projeto.elementos, ...sugestoes]), 1)).toEqual(sugestoes);
  });

  it('ambientes e paredes ainda pendentes também geram o telhado', () => {
    const pendente = projetoCom(casaRetangular(6, 8).map((e) => ({ ...e, status: 'pendente' as const, origem: 'importado' as const })));
    expect(doTipo(sugerirEstrutura(pendente, 1), 'telhado')).toHaveLength(1);
  });

  it('ambiente descoberto não recebe telhado', () => {
    const els = casaRetangular(6, 8).map((e) =>
      e.tipo === 'ambiente' ? ({ ...e, props: { ...e.props, coberto: false } } as Elemento) : e,
    );
    expect(doTipo(sugerirEstrutura(projetoCom(els), 1), 'telhado')).toHaveLength(0);
  });
});

describe('sugestão de cobertura — casa em L', () => {
  const projeto = projetoCom(casaEmL());
  const sugestoes = sugerirEstrutura(projeto, 1);
  const telhados = doTipo(sugestoes, 'telhado');

  it('um telhado de 4 águas com o contorno em L + beiral (6 vértices)', () => {
    expect(telhados).toHaveLength(1);
    const t = telhados[0]!;
    expect(t.props.aguas).toBe(4);
    expect(t.vinculos.ambienteIds).toEqual(['estar', 'quarto']);
    expect(pontosDe(t)).toHaveLength(6);
    expect(caixaM(t)).toEqual([-0.6, -0.6, 10.6, 10.6]);
    // L externo 10×6 + 4×4 afastado 0,6: 11,2 × 7,2 + 5,2 × 4
    expect(areaPoligono(pontosDe(t)) * ESCALA ** 2).toBeCloseTo(11.2 * 7.2 + 5.2 * 4, 6);
  });

  it('calhas em todo o perímetro; cumeeira + espigões pela decomposição', () => {
    const ch = calhas(sugestoes, 'calha');
    expect(ch).toHaveLength(6);
    const perimetro = 2 * (11.2 + 11.2);
    expect(ch.reduce((s, c) => s + comprimentoM(c), 0)).toBeCloseTo(perimetro, 6);
    // condutores: ceil(11,2/10)=2 em cada lado de 11,2 m; 1 nos demais
    expect(calhas(sugestoes, 'condutor')).toHaveLength(2 + 2 + 1 + 1 + 1 + 1);

    const r = calcularEstrutura(comTipo(projeto, sugestoes));
    const cumeeira = r.linhas.find((l) => l.servico === 'cumeeira')!;
    expect(cumeeira.descricao).toBe('Cumeeira e espigões');
    expect(cumeeira.quantidade).toBeCloseTo(cumeeiraQuatroAguas(11.2, 7.2, 0.3) + cumeeiraQuatroAguas(5.2, 4, 0.3), 6);
  });
});

describe('rufos', () => {
  it('parede mais alta que o pé-direito dentro do telhado recebe rufo; sem altura própria, não', () => {
    const els = casaRetangular(6, 8).map((e) =>
      e.id === 'pl' && e.tipo === 'parede' ? ({ ...e, props: { ...e.props, altura: 4 } } as ElementoDe<'parede'>) : e,
    );
    const rufos = calhas(sugerirEstrutura(projetoCom(els), 1), 'rufo');
    expect(rufos).toHaveLength(1);
    expect(rufos[0]).toMatchObject({ rotulo: 'RF1', vinculos: { paredeId: 'pl' } });
    expect(comprimentoM(rufos[0]!)).toBeCloseTo(7.85, 6);
    expect(calhas(sugerirEstrutura(projetoCom(casaRetangular(6, 8)), 1), 'rufo')).toHaveLength(0);

    const r = calcularEstrutura(projetoCom([...els, ...rufos]));
    expect(r.linhas.find((l) => l.servico === 'rufo')).toMatchObject({ unidade: 'm', detalhe: 'desenvolvimento 33 cm' });
  });
});
