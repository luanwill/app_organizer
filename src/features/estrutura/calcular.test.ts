import { describe, expect, it } from 'vitest';
import type { Elemento, LinhaQuantitativo, Projeto, TipoFundacao, TipoLaje } from '@/core/model';
import { ambiente, parede, plantaEmL, projetoCom, pt } from './apoio-teste';
import { calcularEstrutura } from './calcular';
import { sugerirEstrutura } from './sugerir';
import { comprimentoEstribo, pesoLinearAco } from './vigas';

function elemento(parcial: object): Elemento {
  return {
    id: 'e1', disciplina: 'estrutura', pagina: 1, vinculos: {}, origem: 'desenhado', status: 'confirmado', ...parcial,
  } as unknown as Elemento;
}
const viga = (tipo: 'viga-baldrame' | 'viga-superior', comprimento: number, extra: Partial<Elemento> = {}): Elemento =>
  elemento({ tipo, geometria: { tipo: 'polilinha', pontos: [pt(1, 1), pt(1 + comprimento, 1)] }, props: { secaoB: 0.15, secaoH: 0.4 }, ...extra });
const pilar = (extra: Partial<Elemento> = {}): Elemento =>
  elemento({ tipo: 'pilar', geometria: { tipo: 'ponto', ponto: pt(0, 0) }, props: { secaoB: 0.14, secaoH: 0.3 }, ...extra });
const laje = (tipoLaje: TipoLaje, extra: Partial<Elemento> = {}): Elemento =>
  elemento({ tipo: 'laje', geometria: { tipo: 'poligono', pontos: [pt(0, 0), pt(4, 0), pt(4, 3), pt(0, 3)] }, props: { tipoLaje, espessura: 0.12 }, ...extra });
const fundacao = (tipoFundacao: TipoFundacao, extra: Partial<Elemento> = {}): Elemento =>
  elemento({ tipo: 'fundacao', geometria: { tipo: 'ponto', ponto: pt(0, 0) }, props: { tipoFundacao }, ...extra });

const linhasDe = (projeto: Projeto): Record<string, LinhaQuantitativo> =>
  Object.fromEntries(calcularEstrutura(projeto).linhas.map((l) => [l.id.split(':')[1], l]));

describe('viga baldrame', () => {
  it('modo taxa: comprimento, forma, concreto, aço e impermeabilização', () => {
    const l = linhasDe(projetoCom([viga('viga-baldrame', 3.5)]));
    expect(l.comprimento).toMatchObject({ unidade: 'm', grupo: 'Vigas baldrame', status: 'confirmado', elementoIds: ['e1'] });
    expect(l.comprimento!.quantidade).toBeCloseTo(3.5, 9);
    expect(l.forma!.quantidade).toBeCloseTo(2 * 0.4 * 3.5, 9);
    expect(l.forma).toMatchObject({ servico: 'forma', unidade: 'm²', descricao: 'Forma — baldrame' });
    expect(l.concreto!.quantidade).toBeCloseTo(0.15 * 0.4 * 3.5, 9);
    expect(l.concreto).toMatchObject({ servico: 'concreto', unidade: 'm³', detalhe: 'fck 25' });
    expect(l.aco!.quantidade).toBeCloseTo(0.15 * 0.4 * 3.5 * 90, 9);
    expect(l.aco).toMatchObject({ servico: 'aco', unidade: 'kg', detalhe: 'CA-50' });
    expect(l.impermeabilizacao!.quantidade).toBeCloseTo((0.15 + 2 * 0.4) * 3.5, 9);
    expect(l.impermeabilizacao).toMatchObject({ servico: 'impermeabilizacao', unidade: 'm²' });
  });

  it('modo detalhado: longitudinais + estribos, com a bitola no detalhe', () => {
    const projeto = projetoCom([viga('viga-baldrame', 3.5)]);
    projeto.parametros.estrutura.aco.modo = 'detalhado';
    const l = linhasDe(projeto);
    expect(pesoLinearAco(10)).toBeCloseTo(100 / 162, 12);
    expect(comprimentoEstribo(0.15, 0.4, 0.025)).toBeCloseTo(2 * (0.1 + 0.35) + 0.1, 12);
    expect(l['aco-longitudinal']!.quantidade).toBeCloseTo(4 * 3.5 * (100 / 162), 9);
    expect(l['aco-longitudinal']).toMatchObject({ servico: 'aco', detalhe: 'Ø10 mm' });
    // ceil(3,5 / 0,15) + 1 = 25 estribos de 1,00 m, Ø5
    expect(l['aco-estribo']!.quantidade).toBeCloseTo(25 * 1.0 * (25 / 162), 9);
    expect(l['aco-estribo']).toMatchObject({ servico: 'aco', detalhe: 'Ø5 mm' });
    expect(l.aco).toBeUndefined();
  });

  it('viga superior não tem impermeabilização; comprimento manual marca as linhas', () => {
    const l = linhasDe(projetoCom([viga('viga-superior', 3.5, { manuais: { comprimento: 5 } })]));
    expect(l.impermeabilizacao).toBeUndefined();
    expect(l.comprimento).toMatchObject({ quantidade: 5, manual: true, grupo: 'Vigas superiores' });
    expect(l.concreto!.quantidade).toBeCloseTo(0.15 * 0.4 * 5, 9);
    expect(l.concreto!.manual).toBe(true);
  });
});

describe('pilares', () => {
  it('altura = pé-direito + viga superior; mudar o pé-direito muda concreto e forma', () => {
    const projeto = projetoCom([pilar()]);
    let l = linhasDe(projeto);
    expect(l.contagem).toMatchObject({ quantidade: 1, unidade: 'un', descricao: 'Pilares (un)', grupo: 'Pilares' });
    expect(l.concreto!.quantidade).toBeCloseTo(0.14 * 0.3 * 3.1, 9);
    expect(l.forma!.quantidade).toBeCloseTo(2 * (0.14 + 0.3) * 3.1, 9);
    expect(l.aco!.quantidade).toBeCloseTo(0.14 * 0.3 * 3.1 * 100, 9);

    projeto.parametros.gerais.peDireito = 3;
    l = linhasDe(projeto);
    expect(l.concreto!.quantidade).toBeCloseTo(0.14 * 0.3 * 3.3, 9);
    expect(l.forma!.quantidade).toBeCloseTo(2 * (0.14 + 0.3) * 3.3, 9);

    projeto.parametros.estrutura.vigaSuperior.ativa = false;
    expect(linhasDe(projeto).concreto!.quantidade).toBeCloseTo(0.14 * 0.3 * 3, 9);
  });

  it('pé-direito null → alerta, sem concreto/forma/aço; a contagem continua', () => {
    const projeto = projetoCom([pilar(), pilar({ id: 'e2' })]);
    projeto.parametros.gerais.peDireito = null;
    const r = calcularEstrutura(projeto);
    expect(r.alertas).toHaveLength(1);
    expect(r.alertas[0]).toMatchObject({ disciplina: 'estrutura', campo: 'peDireito' });
    expect(r.linhas.map((l) => l.descricao)).toEqual(['Pilares (un)', 'Pilares (un)']);
  });

  it('altura própria e altura manual dispensam o pé-direito', () => {
    const projeto = projetoCom([pilar({ props: { secaoB: 0.2, secaoH: 0.2, altura: 2 } }), pilar({ id: 'e2', manuais: { altura: 4 } })]);
    projeto.parametros.gerais.peDireito = null;
    const r = calcularEstrutura(projeto);
    expect(r.alertas).toEqual([]);
    expect(r.linhas.find((l) => l.id === 'e1:concreto')!.quantidade).toBeCloseTo(0.2 * 0.2 * 2, 9);
    expect(r.linhas.find((l) => l.id === 'e2:concreto')).toMatchObject({ manual: true });
    expect(r.linhas.find((l) => l.id === 'e2:concreto')!.quantidade).toBeCloseTo(0.14 * 0.3 * 4, 9);
  });
});

describe('lajes', () => {
  it('maciça: concreto com a espessura cheia, aço por taxa e escoramento', () => {
    const l = linhasDe(projetoCom([laje('macica')]));
    expect(l.area!.quantidade).toBeCloseTo(12, 9);
    expect(l.concreto!.quantidade).toBeCloseTo(12 * 0.12, 9);
    expect(l.aco!.quantidade).toBeCloseTo(12 * 0.12 * 60, 9);
    expect(l.aco).toMatchObject({ servico: 'aco' });
    expect(l.escoramento!.quantidade).toBeCloseTo(12, 9);
    expect(l.trelicas).toBeUndefined();
    expect(l.tela).toBeUndefined();
  });

  it('treliçada com EPS: vão = menor lado; treliças, EPS e tela como materiais', () => {
    const l = linhasDe(projetoCom([laje('trelicada-eps')]));
    expect(l.concreto!.quantidade).toBeCloseTo(12 * 0.12 * 0.5, 9);
    // largura 4 m / intereixo 0,42 → 10 treliças × vão de 3 m
    expect(l.trelicas).toMatchObject({ unidade: 'm', ehMaterial: true });
    expect(l.trelicas!.quantidade).toBeCloseTo(30, 9);
    // 9 fiadas × 3 m / 1,00 m
    expect(l.enchimento).toMatchObject({ quantidade: 27, unidade: 'un', ehMaterial: true });
    expect(l.tela).toMatchObject({ unidade: 'm²', ehMaterial: true });
    expect(l.tela!.quantidade).toBeCloseTo(12 * 1.1, 9);
    expect(l.escoramento!.quantidade).toBeCloseTo(12, 9);
    expect(l.aco).toBeUndefined();
  });

  it('treliçada com lajota: fator 0,55 e peças de 0,20 m; área manual', () => {
    const l = linhasDe(projetoCom([laje('trelicada-lajota')]));
    expect(l.concreto!.quantidade).toBeCloseTo(12 * 0.12 * 0.55, 9);
    expect(l.enchimento!.quantidade).toBe(135); // 9 × 3 / 0,20
    const manual = linhasDe(projetoCom([laje('macica', { manuais: { area: 20 } })]));
    expect(manual.area).toMatchObject({ quantidade: 20, manual: true });
    expect(manual.concreto!.quantidade).toBeCloseTo(20 * 0.12, 9);
  });
});

describe('fundações', () => {
  it('sapata', () => {
    const l = linhasDe(projetoCom([fundacao('sapata')]));
    expect(l.contagem).toMatchObject({ quantidade: 1, grupo: 'Fundações' });
    expect(l.escavacao!.quantidade).toBeCloseTo(0.8 * 0.8 * 1, 9);
    expect(l.escavacao!.servico).toBe('escavacao');
    expect(l.lastro!.quantidade).toBeCloseTo(0.8 * 0.8 * 0.05, 9);
    expect(l.lastro!.servico).toBe('lastro');
    expect(l.forma!.quantidade).toBeCloseTo(2 * 1.6 * 0.3, 9);
    expect(l.concreto!.quantidade).toBeCloseTo(0.8 * 0.8 * 0.3, 9);
    expect(l.aco!.quantidade).toBeCloseTo(0.8 * 0.8 * 0.3 * 70, 9);
  });

  it('bloco + estacas', () => {
    const projeto = projetoCom([fundacao('bloco-estaca')]);
    projeto.parametros.estrutura.fundacao.bloco.estacasPorBloco = 2;
    const l = linhasDe(projeto);
    expect(l.escavacao!.quantidade).toBeCloseTo(0.6 * 0.6 * 0.4, 9);
    expect(l.lastro!.quantidade).toBeCloseTo(0.6 * 0.6 * 0.05, 9);
    expect(l.forma!.quantidade).toBeCloseTo(2 * 1.2 * 0.4, 9);
    expect(l.concreto!.quantidade).toBeCloseTo(0.6 * 0.6 * 0.4, 9);
    expect(l.aco!.quantidade).toBeCloseTo(0.6 * 0.6 * 0.4 * 70, 9);
    expect(l.estacas!.quantidade).toBe(2);
    expect(l['concreto-estacas']!.quantidade).toBeCloseTo(((2 * Math.PI * 0.25 ** 2) / 4) * 4, 9);
    expect(l['concreto-estacas']).toMatchObject({ servico: 'concreto', detalhe: 'fck 25' });
    expect(l.perfuracao).toMatchObject({ quantidade: 8, unidade: 'm' });
  });

  it('radier (polígono 6 × 4 m)', () => {
    const radier = fundacao('radier', { geometria: { tipo: 'poligono', pontos: [pt(0, 0), pt(6, 0), pt(6, 4), pt(0, 4)] } });
    const l = linhasDe(projetoCom([radier]));
    expect(l.area!.quantidade).toBeCloseTo(24, 9);
    expect(l.escavacao!.quantidade).toBeCloseTo(24 * (0.12 + 0.05), 9);
    expect(l.lastro!.quantidade).toBeCloseTo(24 * 0.05, 9);
    expect(l.concreto!.quantidade).toBeCloseTo(24 * 0.12, 9);
    expect(l.forma!.quantidade).toBeCloseTo(20 * 0.12, 9);
    expect(l.aco!.quantidade).toBeCloseTo(24 * 0.12 * 70, 9);
  });
});

describe('status, escala e integração com as sugestões', () => {
  it('linhas de sugestões pendentes saem pendentes; ids de linha são estáveis e únicos', () => {
    const base = projetoCom([...plantaEmL(), ambiente('sala', 0.1, 0.1, 8.9, 3.9)]);
    const projeto = projetoCom([...base.elementos, ...sugerirEstrutura(base, 1)]);
    const r = calcularEstrutura(projeto);
    expect(r.alertas).toEqual([]);
    expect(r.linhas.length).toBeGreaterThan(0);
    expect(r.linhas.every((l) => l.status === 'pendente' && l.disciplina === 'estrutura')).toBe(true);
    expect(new Set(r.linhas.map((l) => l.id)).size).toBe(r.linhas.length);
    expect(calcularEstrutura(projeto).linhas.map((l) => l.id)).toEqual(r.linhas.map((l) => l.id));
    expect(new Set(r.linhas.map((l) => l.grupo))).toEqual(
      new Set(['Pilares', 'Vigas baldrame', 'Vigas superiores', 'Lajes', 'Fundações']),
    );
    const soma = (descricao: string) => r.linhas.filter((l) => l.descricao === descricao).reduce((s, l) => s + l.quantidade, 0);
    expect(soma('Pilares (un)')).toBe(10);
    expect(soma('Vigas baldrame — comprimento')).toBeCloseTo(38, 6);
    expect(soma('Concreto — baldrame')).toBeCloseTo(38 * 0.14 * 0.3, 6);
    expect(soma('Sapatas (un)')).toBe(10);
  });

  it('página sem escala → alerta "escala" e nenhuma linha', () => {
    const r = calcularEstrutura(projetoCom([pilar(), viga('viga-baldrame', 3, { id: 'e2' })], null));
    expect(r.linhas).toEqual([]);
    expect(r.alertas).toHaveLength(1);
    expect(r.alertas[0]?.campo).toBe('escala');
  });

  it('ignora elementos de outras disciplinas', () => {
    expect(calcularEstrutura(projetoCom([parede('p', [0, 0], [3, 0])]))).toEqual({ linhas: [], alertas: [] });
  });
});
