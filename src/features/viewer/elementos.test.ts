import { describe, expect, it } from 'vitest';
import type { Elemento, Ferramenta, PropsPontoEletrico } from '@/core/model';
import {
  ambienteDoPonto,
  construirElemento,
  larguraParedeUnidades,
  moverPonto,
  moverVertice,
  ordenarParaDesenho,
  paredeMaisProxima,
  verticesDeSnap,
  vincularElemento,
} from './elementos';
import { ancoraRotuloAmbiente, numerosContagem, rotuloDerivadoVisivel, rotuloDoElemento, rotuloVisivel } from './rotulos';

const base = { pagina: 2, vinculos: {}, origem: 'desenhado', status: 'confirmado' } as const;

const parede: Elemento = {
  ...base, id: 'par1', disciplina: 'arquitetura', tipo: 'parede', props: { espessura: 0.15 },
  geometria: { tipo: 'polilinha', pontos: [{ x: 0, y: 0 }, { x: 200, y: 0 }] },
};
const paredeLonge: Elemento = {
  ...base, id: 'par2', disciplina: 'arquitetura', tipo: 'parede', props: { espessura: null },
  geometria: { tipo: 'polilinha', pontos: [{ x: 0, y: 300 }, { x: 200, y: 300 }] },
};
const paredeOutraPagina: Elemento = { ...parede, id: 'par3', pagina: 1 };
const ambiente: Elemento = {
  ...base, id: 'amb1', disciplina: 'arquitetura', tipo: 'ambiente',
  props: { nome: 'Sala', tipoAmbiente: 'sala', areaMolhada: false, coberto: true },
  geometria: { tipo: 'poligono', pontos: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 150 }, { x: 0, y: 150 }] },
};
const cenario = [parede, paredeLonge, paredeOutraPagina, ambiente];

function novo(ferramenta: Ferramenta, pontos: { x: number; y: number }[], espessuraParede: number | null = null) {
  return construirElemento({ ferramenta, pontos, pagina: 2, id: 'novo', espessuraParede });
}

describe('construirElemento', () => {
  it('com alvo: tipo, props (cópia), rótulo, disciplina, geometria, origem e status', () => {
    const props: PropsPontoEletrico = { tipoPonto: 'tug', potenciaVA: 100, altura: 'baixa' };
    const el = novo({ modo: 'ponto', alvo: { tipo: 'ponto-eletrico', props, rotulo: 'TUG' } }, [{ x: 10, y: 20 }]);
    expect(el).toEqual({
      id: 'novo', pagina: 2, disciplina: 'eletrica', tipo: 'ponto-eletrico',
      props: { tipoPonto: 'tug', potenciaVA: 100, altura: 'baixa' }, rotulo: 'TUG',
      geometria: { tipo: 'ponto', ponto: { x: 10, y: 20 } },
      vinculos: {}, origem: 'desenhado', status: 'confirmado',
    });
    expect(el?.props).not.toBe(props);
  });

  it('com alvo: a geometria vem do modo', () => {
    const amb = { tipo: 'ambiente', props: { nome: 'Sala', tipoAmbiente: 'sala', areaMolhada: false, coberto: true } } as const;
    const ret = novo({ modo: 'retangulo', alvo: amb }, [{ x: 0, y: 0 }, { x: 30, y: 20 }]);
    expect(ret?.tipo).toBe('ambiente');
    expect(ret?.disciplina).toBe('arquitetura');
    expect(ret?.geometria.tipo).toBe('poligono');
    expect(ret?.geometria.tipo === 'poligono' && ret.geometria.pontos).toHaveLength(4);
    expect(ret && 'rotulo' in ret).toBe(false);

    const tubo = novo({ modo: 'polilinha', alvo: { tipo: 'tubo', props: { sistema: 'AF' } } }, [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 9 }]);
    expect(tubo?.disciplina).toBe('hidraulica');
    expect(tubo?.geometria).toEqual({ tipo: 'polilinha', pontos: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 9 }] });

    const pilar = novo({ modo: 'contagem', alvo: { tipo: 'pilar', props: { secaoB: 0.14, secaoH: 0.3 } } }, [{ x: 1, y: 2 }]);
    expect(pilar?.disciplina).toBe('estrutura');
    expect(pilar?.geometria.tipo).toBe('ponto');
  });

  it('sem alvo: modo parede cria parede com a espessura dos parâmetros (null continua null)', () => {
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 0 }];
    const semEspessura = novo({ modo: 'parede' }, pts, null);
    expect(semEspessura?.tipo).toBe('parede');
    expect(semEspessura?.props).toEqual({ espessura: null });
    expect(semEspessura?.disciplina).toBe('arquitetura');
    expect(novo({ modo: 'parede' }, pts, 0.15)?.props).toEqual({ espessura: 0.15 });
  });

  it('sem alvo: demais modos criam medição de arquitetura', () => {
    const d = novo({ modo: 'distancia' }, [{ x: 0, y: 0 }, { x: 50, y: 0 }]);
    expect(d).toMatchObject({ tipo: 'medicao', disciplina: 'arquitetura', props: { modo: 'distancia', descricao: '' }, origem: 'desenhado', status: 'confirmado' });
    expect(novo({ modo: 'contagem' }, [{ x: 1, y: 1 }])).toMatchObject({ tipo: 'medicao', props: { modo: 'contagem' }, geometria: { tipo: 'ponto' } });
    expect(novo({ modo: 'poligono' }, [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }])).toMatchObject({ props: { modo: 'poligono' }, geometria: { tipo: 'poligono' } });
  });

  it('pontos insuficientes ou modo sem desenho → null', () => {
    expect(novo({ modo: 'distancia' }, [{ x: 0, y: 0 }])).toBeNull();
    expect(novo({ modo: 'poligono' }, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull();
    expect(novo({ modo: 'contagem' }, [])).toBeNull();
    expect(novo({ modo: 'selecionar' }, [{ x: 0, y: 0 }])).toBeNull();
    expect(novo({ modo: 'calibrar' }, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull();
  });
});

describe('vínculos automáticos', () => {
  it('parede mais próxima considera só a página', () => {
    const r = paredeMaisProxima({ x: 80, y: 12 }, cenario, 2);
    expect(r?.parede.id).toBe('par1');
    expect(r?.ponto).toEqual({ x: 80, y: 0 });
    expect(r?.distancia).toBeCloseTo(12, 9);
    expect(paredeMaisProxima({ x: 80, y: 12 }, cenario, 7)).toBeNull();
  });

  it('esquadria é projetada no eixo da parede e recebe paredeId', () => {
    const el = novo({ modo: 'ponto', alvo: { tipo: 'esquadria', props: { tipoEsquadriaId: 'p1' }, rotulo: 'P1' } }, [{ x: 80, y: 12 }]);
    const r = vincularElemento(el as Elemento, cenario, 30);
    expect('elemento' in r && r.elemento.geometria).toEqual({ tipo: 'ponto', ponto: { x: 80, y: 0 } });
    expect('elemento' in r && r.elemento.vinculos.paredeId).toBe('par1');
  });

  it('esquadria longe de qualquer parede não é criada', () => {
    const el = novo({ modo: 'ponto', alvo: { tipo: 'esquadria', props: { tipoEsquadriaId: 'p1' } } }, [{ x: 80, y: 100 }]);
    expect(vincularElemento(el as Elemento, cenario, 30)).toEqual({ erro: 'Clique sobre uma parede' });
    expect(vincularElemento(el as Elemento, [ambiente], 30)).toEqual({ erro: 'Clique sobre uma parede' });
  });

  it('ponto dentro de um ambiente recebe ambienteId; fora, não', () => {
    expect(ambienteDoPonto({ x: 50, y: 50 }, cenario, 2)).toBe('amb1');
    expect(ambienteDoPonto({ x: 50, y: 50 }, cenario, 1)).toBeUndefined();
    const dentro = vincularElemento(novo({ modo: 'contagem' }, [{ x: 50, y: 50 }]) as Elemento, cenario, 30);
    expect('elemento' in dentro && dentro.elemento.vinculos).toEqual({ ambienteId: 'amb1' });
    const fora = vincularElemento(novo({ modo: 'contagem' }, [{ x: 500, y: 500 }]) as Elemento, cenario, 30);
    expect('elemento' in fora && fora.elemento.vinculos).toEqual({});
  });

  it('linhas e polígonos não ganham vínculos', () => {
    const el = novo({ modo: 'distancia' }, [{ x: 10, y: 10 }, { x: 50, y: 50 }]) as Elemento;
    expect(vincularElemento(el, cenario, 30)).toEqual({ elemento: el });
  });
});

describe('edição', () => {
  const tomada: Elemento = {
    ...base, id: 'tom1', disciplina: 'eletrica', tipo: 'ponto-eletrico', status: 'pendente', origem: 'sugerido-auto',
    props: { tipoPonto: 'tug', potenciaVA: 100, altura: 'baixa' },
    geometria: { tipo: 'ponto', ponto: { x: 50, y: 50 } }, vinculos: { ambienteId: 'amb1', alvoId: 'x' },
  };

  it('mover um ponto recalcula ambienteId e preserva os outros vínculos', () => {
    const fora = moverPonto(tomada, { x: 900, y: 900 }, [...cenario, tomada]);
    expect(fora).toEqual({ geometria: { tipo: 'ponto', ponto: { x: 900, y: 900 } }, vinculos: { alvoId: 'x' } });
    const dentro = moverPonto({ ...tomada, vinculos: {} }, { x: 20, y: 30 }, cenario);
    expect(dentro?.vinculos).toEqual({ ambienteId: 'amb1' });
  });

  it('mover uma esquadria mantém-na projetada na parede mais próxima', () => {
    const esq: Elemento = {
      ...base, id: 'esq1', disciplina: 'arquitetura', tipo: 'esquadria', props: { tipoEsquadriaId: 'p1' },
      geometria: { tipo: 'ponto', ponto: { x: 80, y: 0 } }, vinculos: { paredeId: 'par1' },
    };
    const patch = moverPonto(esq, { x: 120, y: 260 }, [...cenario, esq]);
    expect(patch?.geometria).toEqual({ tipo: 'ponto', ponto: { x: 120, y: 300 } });
    expect(patch?.vinculos?.paredeId).toBe('par2');
    expect(moverPonto(esq, { x: 1, y: 1 }, [esq])).toBeNull(); // sem parede: fica onde está
  });

  it('mover um vértice não altera a geometria original', () => {
    const g = moverVertice(parede.geometria, 1, { x: 210, y: 5 });
    expect(g).toEqual({ tipo: 'polilinha', pontos: [{ x: 0, y: 0 }, { x: 210, y: 5 }] });
    expect(parede.geometria.tipo === 'polilinha' && parede.geometria.pontos[1]).toEqual({ x: 200, y: 0 });
  });

  it('vértices de snap incluem pontos, linhas e polígonos, e ignoram o vértice arrastado', () => {
    expect(verticesDeSnap([parede, ambiente, tomada])).toHaveLength(2 + 4 + 1);
    const sem = verticesDeSnap([parede], { id: 'par1', indice: 0 });
    expect(sem).toEqual([{ x: 200, y: 0 }]);
  });
});

describe('aparência', () => {
  it('espessura da parede: real quando há espessura e escala; senão, mínimo visível', () => {
    expect(larguraParedeUnidades(0.15, 0.02, 1, 3)).toBeCloseTo(7.5, 9);
    expect(larguraParedeUnidades(null, 0.02, 2, 3)).toBe(1.5);
    expect(larguraParedeUnidades(0.15, null, 2, 3)).toBe(1.5);
    expect(larguraParedeUnidades(0.15, 0.02, 0.1, 3)).toBe(30); // muito afastado: mínimo de 3 px
  });

  it('desenha polígonos embaixo, linhas no meio e pontos por cima', () => {
    const ponto = novo({ modo: 'contagem' }, [{ x: 1, y: 1 }]) as Elemento;
    expect(ordenarParaDesenho([ponto, parede, ambiente]).map((e) => e.geometria.tipo)).toEqual(['poligono', 'polilinha', 'ponto']);
  });

  it('rótulos: medição mostra o valor medido; contagem é numerada; esquadria mostra o código', () => {
    const c1 = { ...(novo({ modo: 'contagem' }, [{ x: 1, y: 1 }]) as Elemento), id: 'c1' };
    const c2 = { ...(novo({ modo: 'contagem' }, [{ x: 2, y: 2 }]) as Elemento), id: 'c2' };
    const dist = novo({ modo: 'distancia' }, [{ x: 0, y: 0 }, { x: 153.5, y: 0 }]) as Elemento;
    const area = novo({ modo: 'retangulo' }, [{ x: 0, y: 0 }, { x: 153.5, y: 149 }]) as Elemento;
    const esq = novo({ modo: 'ponto', alvo: { tipo: 'esquadria', props: { tipoEsquadriaId: 'j1' } } }, [{ x: 0, y: 0 }]) as Elemento;
    const ctx = {
      escala: 0.02,
      esquadrias: [{ id: 'j1', codigo: 'J1', categoria: 'janela' as const, largura: 1.2, altura: 1, peitoril: 1.1, quantidade: 1 }],
      contagens: numerosContagem([c1, parede, c2]),
    };
    expect(rotuloDoElemento(c2, ctx).simbolo).toBe('2');
    expect(rotuloDoElemento(dist, ctx).texto).toBe('3,07 m');
    expect(rotuloDoElemento(area, ctx).texto).toBe('9,15 m²');
    expect(rotuloDoElemento(dist, { ...ctx, escala: null }).texto).toBeNull();
    expect(rotuloDoElemento(esq, ctx).texto).toBe('J1');
    expect(rotuloDoElemento(ambiente, ctx).texto).toBe('Sala');
  });
});

describe('legibilidade dos rótulos', () => {
  const ponto = (tipo: 'pilar' | 'quadro', id: string): Elemento =>
    ({ ...base, id, disciplina: 'estrutura', tipo, props: tipo === 'pilar' ? { secaoB: 0.14, secaoH: 0.3 } : {}, geometria: { tipo: 'ponto', ponto: { x: 1, y: 1 } } }) as Elemento;

  it('rótulo de ponto só aparece destacado (selecionado/hover); pilar e esquadria ficam sempre', () => {
    expect(rotuloVisivel(ponto('quadro', 'q'), false)).toBe(false);
    expect(rotuloVisivel(ponto('quadro', 'q'), true)).toBe(true);
    expect(rotuloVisivel(ponto('pilar', 'p'), false)).toBe(true);
    const contagem = novo({ modo: 'contagem' }, [{ x: 1, y: 1 }]) as Elemento;
    expect(rotuloVisivel(contagem, false)).toBe(false);
    expect(rotuloVisivel(ambiente, false)).toBe(true);
    expect(rotuloVisivel(parede, false)).toBe(true);
  });

  it('rótulo de rota derivada só no hover da rota ou no hover/seleção do elemento associado', () => {
    const rota = { id: 'r1', elementoId: 'tom1' };
    expect(rotuloDerivadoVisivel(rota, null, [])).toBe(false);
    expect(rotuloDerivadoVisivel(rota, 'outro', ['outro'])).toBe(false);
    expect(rotuloDerivadoVisivel(rota, 'r1', [])).toBe(true);
    expect(rotuloDerivadoVisivel(rota, 'tom1', [])).toBe(true);
    expect(rotuloDerivadoVisivel(rota, null, ['x', 'tom1'])).toBe(true);
    expect(rotuloDerivadoVisivel({ id: 'r2' }, null, ['tom1'])).toBe(false);
  });

  it('nome do ambiente fica no canto superior esquerdo interno, com margem', () => {
    const pts = ambiente.geometria.tipo === 'poligono' ? ambiente.geometria.pontos : [];
    expect(ancoraRotuloAmbiente(pts, 4)).toEqual({ x: 4, y: 4 });
    // a ordem dos vértices não importa
    expect(ancoraRotuloAmbiente([pts[2], pts[3], pts[0], pts[1]], 4)).toEqual({ x: 4, y: 4 });
    // em L (sem o quadrante superior esquerdo): usa o vértice mais próximo daquele canto
    const emL = [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }, { x: 0, y: 100 }, { x: 100, y: 100 }];
    expect(ancoraRotuloAmbiente(emL, 4)).toEqual({ x: 104, y: 4 });
  });

  it('se o canto com margem cair fora do polígono, usa o centroide', () => {
    const triangulo = [{ x: 0, y: 0 }, { x: 10, y: 100 }, { x: -10, y: 100 }];
    const a = ancoraRotuloAmbiente(triangulo, 4);
    expect(a.x).toBeCloseTo(0, 9);
    expect(a.y).toBeCloseTo(200 / 3, 9);
  });
});
