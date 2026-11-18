import { describe, expect, it } from 'vitest';
import {
  animacaoEmCurso,
  derivadoOculto,
  estadoRevelacao,
  fasesExibidas,
  indexarRevelacao,
  inicioNaFase,
  linhasGrade,
  naCamadaPrincipal,
  polilinhaParcial,
  progressoDoElemento,
  progressoGeral,
  quantosRevelados,
  ROTULO_FASE_ANIMACAO,
  suavizarPop,
  suavizarSaida,
  type AnimacaoPlanta,
  type FaseAnimacao,
} from './animacao';
import { DURACAO_ELEMENTO_FRACAO } from './config';

const porFase: AnimacaoPlanta['porFase'] = {
  paredes: ['p1', 'p2', 'p3', 'p4'],
  ambientes: ['a1', 'a2'],
  eletrica: ['e1'],
};
const indice = indexarRevelacao(porFase);
const tipo = (id: string, fase: FaseAnimacao, progresso: number) => estadoRevelacao(id, indice, fase, progresso).tipo;

describe('estado da apresentação', () => {
  const base: AnimacaoPlanta = { ativa: true, fase: 'paredes', progresso: 0.5, pagina: 1, porFase };

  it('em curso só quando ativa e não concluída', () => {
    expect(animacaoEmCurso(base)).toBe(true);
    expect(animacaoEmCurso({ ...base, fase: 'materiais' })).toBe(true);
    expect(animacaoEmCurso({ ...base, fase: 'concluida' })).toBe(false);
    expect(animacaoEmCurso({ ...base, ativa: false })).toBe(false);
    expect(animacaoEmCurso(undefined)).toBe(false);
  });

  it('fases exibidas: varredura e materiais sempre; as demais só com elementos', () => {
    expect(fasesExibidas(porFase)).toEqual(['varredura', 'paredes', 'ambientes', 'eletrica', 'materiais']);
    expect(fasesExibidas({})).toEqual(['varredura', 'materiais']);
  });

  it('progresso geral cresce de 0 a 1 ao longo das fases exibidas', () => {
    expect(progressoGeral({ ...base, fase: 'varredura', progresso: 0 })).toBe(0);
    expect(progressoGeral({ ...base, fase: 'paredes', progresso: 0.5 })).toBeCloseTo(1.5 / 5, 9);
    expect(progressoGeral({ ...base, fase: 'materiais', progresso: 1 })).toBe(1);
    expect(progressoGeral({ ...base, fase: 'concluida', progresso: 1 })).toBe(1);
  });

  it('fases de cobertura entram depois da estrutura e antes da elétrica', () => {
    const f = fasesExibidas({ estrutura: ['x'], laje: ['l'], telhado: ['t'], calhas: ['c'], eletrica: ['e'] });
    expect(f).toEqual(['varredura', 'estrutura', 'laje', 'telhado', 'calhas', 'eletrica', 'materiais']);
    const i = indexarRevelacao({ laje: ['l'], telhado: ['t'], calhas: ['c'] });
    expect(estadoRevelacao('t', i, 'laje', 1).tipo).toBe('oculto');
    expect(estadoRevelacao('l', i, 'telhado', 0).tipo).toBe('normal');
    expect(estadoRevelacao('c', i, 'calhas', 0).tipo).toBe('animando');
    expect(estadoRevelacao('c', i, 'eletrica', 0).tipo).toBe('normal');
    expect(ROTULO_FASE_ANIMACAO.laje).toBe('Lançando lajes…');
    expect(ROTULO_FASE_ANIMACAO.telhado).toBe('Montando o telhado…');
    expect(ROTULO_FASE_ANIMACAO.calhas).toBe('Posicionando calhas e condutores…');
  });

  it('rótulos das fases em pt-BR', () => {
    expect(ROTULO_FASE_ANIMACAO.varredura).toBe('Lendo a planta…');
    expect(ROTULO_FASE_ANIMACAO.paredes).toBe('Identificando paredes…');
    expect(ROTULO_FASE_ANIMACAO.ambientes).toBe('Medindo ambientes…');
    expect(ROTULO_FASE_ANIMACAO.estrutura).toBe('Lançando estrutura…');
    expect(ROTULO_FASE_ANIMACAO.eletrica).toBe('Distribuindo pontos elétricos…');
    expect(ROTULO_FASE_ANIMACAO.hidraulica).toBe('Distribuindo pontos hidráulicos…');
  });
});

describe('revelação dos elementos', () => {
  it('na varredura, todos os elementos da análise estão ocultos; os de fora, normais', () => {
    for (const id of ['p1', 'p4', 'a1', 'e1']) expect(tipo(id, 'varredura', 0.9)).toBe('oculto');
    expect(tipo('outro', 'varredura', 0.5)).toBe('normal');
  });

  it('fases futuras ocultas; fases passadas normais', () => {
    expect(tipo('a1', 'paredes', 1)).toBe('oculto');
    expect(tipo('e1', 'ambientes', 0.5)).toBe('oculto');
    expect(tipo('p1', 'ambientes', 0)).toBe('normal');
    expect(tipo('a2', 'eletrica', 0)).toBe('normal');
    for (const id of ['p1', 'a1', 'e1']) {
      expect(tipo(id, 'materiais', 0)).toBe('normal');
      expect(tipo(id, 'concluida', 1)).toBe('normal');
    }
  });

  it('na fase atual, aparecem um a um em sequência proporcional ao progresso', () => {
    const visiveisEm = (p: number) => ['p1', 'p2', 'p3', 'p4'].filter((id) => tipo(id, 'paredes', p) !== 'oculto');
    expect(visiveisEm(0)).toEqual(['p1']);
    expect(visiveisEm(0.3)).toEqual(['p1', 'p2']);
    expect(visiveisEm(0.5)).toEqual(['p1', 'p2', 'p3']);
    expect(visiveisEm(1)).toEqual(['p1', 'p2', 'p3', 'p4']);
    // monotônico: quem apareceu não some
    let anterior = 0;
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const n = visiveisEm(p).length;
      expect(n).toBeGreaterThanOrEqual(anterior);
      anterior = n;
    }
  });

  it('cada elemento anima de t = 0 a 1 e termina normal; no fim da fase todos estão normais', () => {
    const r = estadoRevelacao('p1', indice, 'paredes', DURACAO_ELEMENTO_FRACAO / 2);
    expect(r).toEqual({ tipo: 'animando', fase: 'paredes', t: 0.5 });
    expect(tipo('p1', 'paredes', DURACAO_ELEMENTO_FRACAO)).toBe('normal');
    for (const id of ['p1', 'p2', 'p3', 'p4']) expect(tipo(id, 'paredes', 1)).toBe('normal');
  });

  it('o último elemento começa a tempo de terminar até o fim da fase', () => {
    expect(inicioNaFase(0, 10)).toBe(0);
    expect(inicioNaFase(9, 10)).toBeCloseTo(1 - DURACAO_ELEMENTO_FRACAO, 9);
    expect(inicioNaFase(0, 1)).toBe(0);
    expect(progressoDoElemento(9, 10, 1)).toBe(1);
    expect(progressoDoElemento(9, 10, 0.2)).toBe(0);
  });

  it('progresso fora de 0..1 é limitado', () => {
    expect(tipo('p4', 'paredes', 7)).toBe('normal');
    expect(tipo('p2', 'paredes', -1)).toBe('oculto');
    expect(tipo('p1', 'paredes', Number.NaN)).toBe('animando');
  });

  it('id repetido em duas fases vale a primeira', () => {
    const i = indexarRevelacao({ paredes: ['x'], eletrica: ['x'] });
    expect(i.get('x')?.fase).toBe('paredes');
  });

  it('contador de revelados', () => {
    expect(quantosRevelados(4, 0)).toBe(1);
    expect(quantosRevelados(4, 1)).toBe(4);
    expect(quantosRevelados(0, 0.5)).toBe(0);
  });
});

describe('camada principal e rotas derivadas', () => {
  it('a camada principal só muda nas trocas de fase', () => {
    expect(naCamadaPrincipal('fora', indice, 'varredura')).toBe(true);
    expect(naCamadaPrincipal('p1', indice, 'paredes')).toBe(false);
    expect(naCamadaPrincipal('p1', indice, 'ambientes')).toBe(true);
    expect(naCamadaPrincipal('e1', indice, 'ambientes')).toBe(false);
    expect(naCamadaPrincipal('e1', indice, 'materiais')).toBe(true);
  });

  it('rotas aparecem quando termina a fase do elemento associado', () => {
    expect(derivadoOculto({ disciplina: 'eletrica', elementoId: 'e1' }, indice, 'ambientes')).toBe(true);
    expect(derivadoOculto({ disciplina: 'eletrica', elementoId: 'e1' }, indice, 'eletrica')).toBe(true);
    expect(derivadoOculto({ disciplina: 'eletrica', elementoId: 'e1' }, indice, 'hidraulica')).toBe(false);
  });

  it('sem elemento associado (ou fora da análise), quando termina a fase da disciplina', () => {
    expect(derivadoOculto({ disciplina: 'hidraulica' }, indice, 'eletrica')).toBe(true);
    expect(derivadoOculto({ disciplina: 'hidraulica' }, indice, 'hidraulica')).toBe(true);
    expect(derivadoOculto({ disciplina: 'hidraulica' }, indice, 'materiais')).toBe(false);
    expect(derivadoOculto({ disciplina: 'estrutura', elementoId: 'fora-da-analise' }, indice, 'eletrica')).toBe(false);
  });
});

describe('traço sendo desenhado', () => {
  const L = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }];

  it('fração do comprimento total', () => {
    expect(polilinhaParcial(L, 0)).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
    expect(polilinhaParcial(L, 0.5)).toEqual([{ x: 0, y: 0 }, { x: 75, y: 0 }]);
    expect(polilinhaParcial(L, 0.8)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 20 }]);
    expect(polilinhaParcial(L, 1)).toEqual(L);
  });

  it('polígono fechado percorre também o último lado', () => {
    const q = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(polilinhaParcial(q, 1, true)).toEqual([...q, q[0]]);
    expect(polilinhaParcial(q, 0.875, true).at(-1)).toEqual({ x: 0, y: 5 });
  });

  it('não altera a geometria original', () => {
    const copia = structuredClone(L);
    polilinhaParcial(L, 0.3);
    expect(L).toEqual(copia);
  });
});

describe('curvas e grade', () => {
  it('suavizações começam em 0 e terminam em 1; o pop passa de 1 no meio', () => {
    expect(suavizarSaida(0)).toBe(0);
    expect(suavizarSaida(1)).toBe(1);
    expect(suavizarPop(0)).toBeCloseTo(0, 9);
    expect(suavizarPop(1)).toBeCloseTo(1, 9);
    expect(Math.max(...[0.5, 0.6, 0.7, 0.8].map(suavizarPop))).toBeGreaterThan(1);
  });

  it('grade cobre a página', () => {
    const g = linhasGrade(100, 50, 25);
    expect(g.xs).toEqual([0, 25, 50, 75, 100]);
    expect(g.ys).toEqual([0, 25, 50]);
    expect(linhasGrade(100, 50, 0)).toEqual({ xs: [], ys: [] });
  });
});
