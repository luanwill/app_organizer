import { describe, expect, it } from 'vitest';
import type { Elemento, ElementoDe, Ponto, Projeto, TipoAmbiente, TipoTUE } from '@/core/model';
import { projetoVazio } from '@/core/model';
import { distancia, distanciaPontoPoligono, pontoEmPoligono } from '@/core/calc';
import {
  ALTURA_QUADRO_M,
  DISTANCIA_MINIMA_PONTOS_M,
  MENSAGEM_SEM_QUADRO,
  QUANTIDADE_DPS,
  QUANTIDADE_DR,
  agruparCircuitos,
  calcularCircuitos,
  cargaIluminacaoVA,
  disjuntorComercialA,
  moduloEletrica,
  quantidadeTUGs,
  resumoAmbientes,
} from './index';

/** 1 unidade do PDF = 0,02 m → 50 un = 1 m. */
const ESCALA = 0.02;
const un = (m: number) => m / ESCALA;

type PontoEletrico = ElementoDe<'ponto-eletrico'>;

function projetoBase(peDireito: number | null = 2.7): Projeto {
  const projeto = projetoVazio('p', '2026-01-01T00:00:00.000Z');
  projeto.paginas = { 1: { escala: ESCALA } };
  projeto.parametros.gerais.peDireito = peDireito;
  return projeto;
}

function ambiente(
  id: string,
  tipoAmbiente: TipoAmbiente,
  larguraM: number,
  alturaM: number,
  origemM: Ponto = { x: 0, y: 0 },
  tues?: TipoTUE[],
): Elemento {
  const x0 = un(origemM.x);
  const y0 = un(origemM.y);
  return {
    id,
    tipo: 'ambiente',
    disciplina: 'arquitetura',
    pagina: 1,
    geometria: {
      tipo: 'poligono',
      pontos: [
        { x: x0, y: y0 },
        { x: x0 + un(larguraM), y: y0 },
        { x: x0 + un(larguraM), y: y0 + un(alturaM) },
        { x: x0, y: y0 + un(alturaM) },
      ],
    },
    vinculos: {},
    origem: 'desenhado',
    status: 'confirmado',
    props: { nome: id, tipoAmbiente, areaMolhada: false, coberto: true, ...(tues ? { tues } : {}) },
  };
}

function ponto(
  id: string,
  props: PontoEletrico['props'],
  posM: Ponto,
  extra: Partial<PontoEletrico> = {},
): PontoEletrico {
  return {
    id,
    tipo: 'ponto-eletrico',
    disciplina: 'eletrica',
    pagina: 1,
    geometria: { tipo: 'ponto', ponto: { x: un(posM.x), y: un(posM.y) } },
    vinculos: {},
    origem: 'desenhado',
    status: 'confirmado',
    props,
    ...extra,
  };
}

function quadro(posM: Ponto): Elemento {
  return {
    id: 'quadro',
    tipo: 'quadro',
    disciplina: 'eletrica',
    pagina: 1,
    geometria: { tipo: 'ponto', ponto: { x: un(posM.x), y: un(posM.y) } },
    vinculos: {},
    origem: 'desenhado',
    status: 'confirmado',
    props: {},
  };
}

function porta(id: string, posM: Ponto, tipoEsquadriaId = 'P1'): Elemento {
  return {
    id,
    tipo: 'esquadria',
    disciplina: 'arquitetura',
    pagina: 1,
    geometria: { tipo: 'ponto', ponto: { x: un(posM.x), y: un(posM.y) } },
    vinculos: {},
    origem: 'desenhado',
    status: 'confirmado',
    props: { tipoEsquadriaId },
  };
}

const TUG = { tipoPonto: 'tug', potenciaVA: 100, altura: 'baixa' } as const;
const LUZ = { tipoPonto: 'luz', potenciaVA: 100, altura: 'teto' } as const;

const sugerir = (projeto: Projeto) => moduloEletrica.sugerir!(projeto, 1) as Elemento[];
const eletricos = (els: Elemento[]) => els.filter((e): e is PontoEletrico => e.tipo === 'ponto-eletrico');
const doTipo = (els: Elemento[], tipo: PontoEletrico['props']['tipoPonto']) =>
  eletricos(els).filter((e) => e.props.tipoPonto === tipo);

function linha(projeto: Projeto, id: string) {
  return moduloEletrica.calcular(projeto).linhas.find((l) => l.id === id);
}
const qtd = (projeto: Projeto, id: string) => linha(projeto, id)?.quantidade;

describe('regras da NBR 5410', () => {
  it.each([
    [6, 100],
    [9.9, 100],
    [10, 160],
    [12, 160],
    [14, 220],
    [3, 100],
  ])('iluminação: %s m² → %s VA', (area, va) => {
    expect(cargaIluminacaoVA(area)).toBe(va);
  });

  it('TUGs por tipo de ambiente', () => {
    expect(quantidadeTUGs('sala', 12, 14)).toBe(3);
    expect(quantidadeTUGs('quarto', 9, 12)).toBe(3);
    expect(quantidadeTUGs('cozinha', 9, 12)).toBe(4);
    expect(quantidadeTUGs('area-servico', 4, 7)).toBe(2);
    expect(quantidadeTUGs('banheiro', 4, 8)).toBe(1);
    expect(quantidadeTUGs('outro', 5, 9)).toBe(1);
    expect(quantidadeTUGs('outro', 12, 14)).toBe(3);
    expect(quantidadeTUGs('sala', 25, 20)).toBe(4); // 20 / 5 exato, sem "fração" a mais
  });

  it('disjuntor comercial pela corrente', () => {
    expect(disjuntorComercialA(1270 / 127)).toBe(10);
    expect(disjuntorComercialA(5500 / 127)).toBe(50);
    expect(disjuntorComercialA(5500 / 220)).toBe(25);
    expect(disjuntorComercialA(100)).toBeNull();
  });
});

describe('sugestão automática', () => {
  it('sala 3 × 4 m → 160 VA de iluminação e 3 TUGs (resumo: 12 m², 14 m)', () => {
    const projeto = projetoBase();
    projeto.elementos = [ambiente('sala', 'sala', 3, 4)];
    const [resumo] = resumoAmbientes(projeto, 1);
    expect(resumo?.areaM2).toBeCloseTo(12, 9);
    expect(resumo?.perimetroM).toBeCloseTo(14, 9);
    expect(resumo?.iluminacaoVA).toBe(160);
    expect(resumo?.tugs).toBe(3);

    const sugestoes = sugerir(projeto);
    const luzes = doTipo(sugestoes, 'luz');
    expect(luzes).toHaveLength(1);
    expect(luzes[0]!.props).toEqual({ tipoPonto: 'luz', potenciaVA: 160, altura: 'teto' });
    expect(luzes[0]!.geometria).toEqual({ tipo: 'ponto', ponto: { x: un(1.5), y: un(2) } });
    const tugs = doTipo(sugestoes, 'tug');
    expect(tugs).toHaveLength(3);
    expect(tugs.every((t) => t.props.potenciaVA === 100 && t.props.altura === 'baixa')).toBe(true);
    expect(doTipo(sugestoes, 'interruptor')).toHaveLength(0); // sem porta, sem interruptor
  });

  it('tudo nasce pendente / sugerido-auto, vinculado ao ambiente, dentro dele e sem sobreposição', () => {
    const projeto = projetoBase();
    projeto.esquadrias = [{ id: 'P1', codigo: 'P1', categoria: 'porta', largura: 0.8, altura: 2.1, peitoril: 0, quantidade: 1 }];
    const coz = ambiente('coz', 'cozinha', 3, 3, { x: 0, y: 0 }, ['micro-ondas', 'forno-eletrico', 'torneira-eletrica']);
    projeto.elementos = [coz, porta('porta1', { x: 1.5, y: 0 })];
    const sugestoes = eletricos(sugerir(projeto));
    const poligono = coz.geometria.tipo === 'poligono' ? coz.geometria.pontos : [];
    expect(new Set(sugestoes.map((s) => s.id)).size).toBe(sugestoes.length);
    for (const s of sugestoes) {
      expect(s.origem).toBe('sugerido-auto');
      expect(s.status).toBe('pendente');
      expect(s.disciplina).toBe('eletrica');
      expect(s.vinculos.ambienteId).toBe('coz');
      const p = s.geometria.tipo === 'ponto' ? s.geometria.ponto : { x: NaN, y: NaN };
      expect(pontoEmPoligono(p, poligono)).toBe(true);
      if (s.props.tipoPonto !== 'luz') {
        expect(distanciaPontoPoligono(p, poligono) * ESCALA).toBeCloseTo(0.1, 6); // recuo da parede
      }
    }
    for (let i = 0; i < sugestoes.length; i++) {
      for (let j = i + 1; j < sugestoes.length; j++) {
        const a = sugestoes[i]!.geometria;
        const b = sugestoes[j]!.geometria;
        if (a.tipo !== 'ponto' || b.tipo !== 'ponto') continue;
        expect(distancia(a.ponto, b.ponto) * ESCALA).toBeGreaterThanOrEqual(DISTANCIA_MINIMA_PONTOS_M - 1e-9);
      }
    }
  });

  it('cozinha com perímetro 12 m → 4 TUGs em altura média; banheiro → 1; "outro" 5 m² → 1', () => {
    const projeto = projetoBase();
    projeto.elementos = [
      ambiente('coz', 'cozinha', 3, 3),
      ambiente('wc', 'banheiro', 2, 2, { x: 10, y: 0 }),
      ambiente('dep', 'outro', 2, 2.5, { x: 20, y: 0 }),
    ];
    const tugs = doTipo(sugerir(projeto), 'tug');
    const doAmbiente = (id: string) => tugs.filter((t) => t.vinculos.ambienteId === id);
    expect(doAmbiente('coz')).toHaveLength(4);
    expect(doAmbiente('coz').every((t) => t.props.altura === 'media')).toBe(true);
    expect(doAmbiente('wc')).toHaveLength(1);
    expect(doAmbiente('wc')[0]!.props.altura).toBe('media');
    expect(doAmbiente('dep')).toHaveLength(1);
  });

  it('banheiro: a TUG fica junto ao lavatório', () => {
    const projeto = projetoBase();
    const lavatorio: Elemento = {
      id: 'lav',
      tipo: 'ponto-hidraulico',
      disciplina: 'hidraulica',
      pagina: 1,
      geometria: { tipo: 'ponto', ponto: { x: un(1.9), y: un(1) } },
      vinculos: { ambienteId: 'wc' },
      origem: 'desenhado',
      status: 'confirmado',
      props: { aparelho: 'lavatorio', aguaFria: true, aguaQuente: false, esgoto: true },
    };
    projeto.elementos = [ambiente('wc', 'banheiro', 2, 2), lavatorio];
    const [tug] = doTipo(sugerir(projeto), 'tug');
    const p = tug!.geometria.tipo === 'ponto' ? tug!.geometria.ponto : { x: 0, y: 0 };
    expect(distancia(p, { x: un(1.9), y: un(1) }) * ESCALA).toBeLessThan(0.5);
  });

  it('interruptores: 1 por porta de acesso (janelas e portas distantes não contam)', () => {
    const projeto = projetoBase();
    projeto.esquadrias = [
      { id: 'P1', codigo: 'P1', categoria: 'porta', largura: 0.8, altura: 2.1, peitoril: 0, quantidade: 2 },
      { id: 'J1', codigo: 'J1', categoria: 'janela', largura: 1.2, altura: 1.2, peitoril: 1, quantidade: 1 },
    ];
    const janela = porta('janela', { x: 3, y: 2 }, 'J1');
    projeto.elementos = [
      ambiente('sala', 'sala', 3, 4),
      porta('porta-a', { x: 1.5, y: -0.07 }), // sobre o eixo da parede (7 cm fora do polígono)
      porta('porta-b', { x: 0, y: 3 }),
      porta('porta-longe', { x: 8, y: 8 }),
      janela,
    ];
    const interruptores = doTipo(sugerir(projeto), 'interruptor');
    expect(interruptores).toHaveLength(2);
    expect(interruptores.every((i) => i.props.altura === 'interruptor' && i.props.potenciaVA === 0)).toBe(true);
    // ao lado da porta A: meia largura (0,40) + folga (0,15) ao longo da parede, recuado 0,10
    const a = interruptores[0]!.geometria;
    expect(a.tipo === 'ponto' && a.ponto.x * ESCALA).toBeCloseTo(1.5 + 0.4 + 0.15, 6);
    expect(a.tipo === 'ponto' && a.ponto.y * ESCALA).toBeCloseTo(0.1, 6);
  });

  it('TUEs conforme props.tues do ambiente', () => {
    const projeto = projetoBase();
    projeto.elementos = [
      ambiente('wc', 'banheiro', 2, 2, { x: 0, y: 0 }, ['chuveiro']),
      ambiente('coz', 'cozinha', 3, 3, { x: 10, y: 0 }, ['micro-ondas', 'torneira-eletrica', 'micro-ondas']),
      ambiente('sala', 'sala', 3, 4, { x: 20, y: 0 }),
    ];
    const tues = doTipo(sugerir(projeto), 'tue');
    expect(tues.map((t) => [t.vinculos.ambienteId, t.props.tue, t.props.potenciaVA, t.props.altura])).toEqual([
      ['wc', 'chuveiro', 5500, 'alta'],
      ['coz', 'micro-ondas', 1500, 'media'],
      ['coz', 'torneira-eletrica', 5000, 'media'],
    ]);
  });

  it('página sem escala → nenhuma sugestão; ambiente com pontos confirmados é respeitado', () => {
    const projeto = projetoBase();
    projeto.elementos = [
      ambiente('sala', 'sala', 3, 4),
      ambiente('quarto', 'quarto', 3, 3, { x: 10, y: 0 }),
      ponto('tug-ok', TUG, { x: 1, y: 0.1 }, { vinculos: { ambienteId: 'sala' } }),
    ];
    const sugestoes = eletricos(sugerir(projeto));
    expect(sugestoes.length).toBeGreaterThan(0);
    expect(sugestoes.every((s) => s.vinculos.ambienteId === 'quarto')).toBe(true);

    projeto.paginas = { 1: { escala: null } };
    expect(sugerir(projeto)).toEqual([]);
  });

  it('é determinística e não repete ids de elementos que ficam no projeto', () => {
    const projeto = projetoBase();
    projeto.elementos = [ambiente('sala', 'sala', 3, 4)];
    const primeira = sugerir(projeto);
    expect(sugerir(projeto)).toEqual(primeira);
    // uma sugestão já aceita (mesmo id) não é repetida; o restante do ambiente é sugerido de novo
    const aceito = { ...primeira[0]!, status: 'confirmado' as const, vinculos: {} };
    projeto.elementos = [...projeto.elementos, aceito, ...primeira.slice(1)];
    const segunda = sugerir(projeto);
    expect(segunda).toHaveLength(primeira.length - 1);
    expect(segunda.some((s) => s.id === aceito.id)).toBe(false);
  });
});

describe('circuitos', () => {
  const parametros = projetoBase().parametros.eletrica; // limite 1270 VA

  it('iluminação separada de TUG, 1 por TUE; interruptor não soma carga', () => {
    const grupos = agruparCircuitos(
      [
        ponto('l1', { ...LUZ, potenciaVA: 160 }, { x: 1, y: 1 }, { vinculos: { ambienteId: 'a' } }),
        ponto('t1', TUG, { x: 1, y: 2 }, { vinculos: { ambienteId: 'a' } }),
        ponto('i1', { tipoPonto: 'interruptor', potenciaVA: 0, altura: 'interruptor' }, { x: 0, y: 1 }, { vinculos: { ambienteId: 'a' } }),
        ponto('t2', TUG, { x: 2, y: 2 }, { vinculos: { ambienteId: 'a' } }),
        ponto('ch', { tipoPonto: 'tue', potenciaVA: 5500, altura: 'alta', tue: 'chuveiro' }, { x: 3, y: 3 }),
        ponto('mo', { tipoPonto: 'tue', potenciaVA: 1500, altura: 'media', tue: 'micro-ondas' }, { x: 4, y: 3 }),
      ],
      parametros,
      ['a'],
    );
    expect(grupos.map((g) => [g.tipo, g.pontoIds, g.va, g.secaoMm2])).toEqual([
      ['iluminacao', ['l1'], 160, 1.5],
      ['tug', ['t1', 't2'], 200, 2.5],
      ['tue', ['ch'], 5500, 6],
      ['tue', ['mo'], 1500, 2.5],
    ]);
    expect(grupos[0]!.interruptorIds).toEqual(['i1']);
  });

  it('respeita o limite de VA por circuito, por ambiente em ordem estável', () => {
    const tugs = Array.from({ length: 5 }, (_, i) =>
      ponto(`t${i + 1}`, { ...TUG, potenciaVA: 600 }, { x: i, y: 0 }, { vinculos: { ambienteId: i < 3 ? 'b' : 'a' } }),
    );
    const grupos = agruparCircuitos(tugs, parametros, ['a', 'b']);
    // ambiente 'a' (t4, t5) vem antes de 'b' (t1, t2, t3); 600 + 600 ≤ 1270 < 1800
    expect(grupos.map((g) => g.pontoIds)).toEqual([['t4', 't5'], ['t1', 't2'], ['t3']]);
    expect(grupos.every((g) => g.va <= parametros.limiteVAPorCircuito)).toBe(true);

    const menor = agruparCircuitos(tugs, { ...parametros, limiteVAPorCircuito: 500 }, ['a', 'b']);
    expect(menor).toHaveLength(5); // ponto sozinho acima do limite → circuito próprio
  });

  it('numera C1…Cn com disjuntor comercial; pendentes ficam em circuitos à parte', () => {
    const projeto = projetoBase();
    projeto.elementos = [
      ponto('l1', LUZ, { x: 1, y: 1 }),
      ponto('t1', TUG, { x: 1, y: 2 }),
      ponto('ch', { tipoPonto: 'tue', potenciaVA: 5500, altura: 'alta', tue: 'chuveiro' }, { x: 3, y: 3 }),
      ponto('t2', TUG, { x: 2, y: 2 }, { status: 'pendente', origem: 'sugerido-auto' }),
    ];
    const circuitos = calcularCircuitos(projeto);
    expect(circuitos.map((c) => [c.rotulo, c.tipo, c.status, c.va, c.disjuntorA])).toEqual([
      ['C1', 'iluminacao', 'confirmado', 100, 10],
      ['C2', 'tug', 'confirmado', 100, 10],
      ['C3', 'tue', 'confirmado', 5500, 50],
      ['C4', 'tug', 'pendente', 100, 10],
    ]);
  });
});

describe('quantitativos', () => {
  /** Quadro em (0,0); TUG baixa em (3,4) m; luz no teto em (2,0) m. Pé-direito 2,70 m. */
  function projetoComRotas(peDireito: number | null = 2.7): Projeto {
    const projeto = projetoBase(peDireito);
    projeto.elementos = [quadro({ x: 0, y: 0 }), ponto('t1', TUG, { x: 3, y: 4 }), ponto('l1', LUZ, { x: 2, y: 0 })];
    return projeto;
  }
  // TUG: 7 m horizontais + (2,70 − 0,30) + descida do quadro (2,70 − 1,50) = 10,60 m; 3 condutores
  // Luz: 2 m horizontais + 0 + descida 1,20 = 3,20 m; 2 condutores

  it('eletroduto = horizontal + verticais; fio = eletroduto × nº de condutores por seção', () => {
    const projeto = projetoComRotas();
    expect(qtd(projeto, 'eletrica:eletroduto:25:confirmado')).toBeCloseTo(10.6 + 3.2, 9);
    expect(qtd(projeto, 'eletrica:fio:2.5:confirmado')).toBeCloseTo(10.6 * 3, 9);
    expect(qtd(projeto, 'eletrica:fio:1.5:confirmado')).toBeCloseTo(3.2 * 2, 9);
    const eletroduto = linha(projeto, 'eletrica:eletroduto:25:confirmado');
    expect(eletroduto).toMatchObject({ unidade: 'm', ehMaterial: true, detalhe: 'Ø25 mm', grupo: 'Eletrodutos e fios' });
    expect(linha(projeto, 'eletrica:fio:2.5:confirmado')?.detalhe).toBe('2,5 mm²');
    expect(ALTURA_QUADRO_M).toBe(1.5);
  });

  it('a altura do ponto muda o trecho vertical', () => {
    const projeto = projetoComRotas();
    projeto.elementos = projeto.elementos.map((el) =>
      el.id === 't1' && el.tipo === 'ponto-eletrico' ? { ...el, props: { ...el.props, altura: 'alta' as const } } : el,
    );
    // 7 + (2,70 − 2,20) + 1,20 = 8,70
    expect(qtd(projeto, 'eletrica:fio:2.5:confirmado')).toBeCloseTo(8.7 * 3, 9);
  });

  it('alterar o pé-direito altera eletrodutos e fios', () => {
    const projeto = projetoComRotas(3);
    // TUG: 7 + 2,70 + 1,50 = 11,20; luz: 2 + 0 + 1,50 = 3,50
    expect(qtd(projeto, 'eletrica:eletroduto:25:confirmado')).toBeCloseTo(11.2 + 3.5, 9);
    expect(qtd(projeto, 'eletrica:fio:2.5:confirmado')).toBeCloseTo(11.2 * 3, 9);
    expect(qtd(projeto, 'eletrica:fio:1.5:confirmado')).toBeCloseTo(3.5 * 2, 9);
  });

  it('pé-direito próprio do ambiente vale para os pontos dele', () => {
    const projeto = projetoComRotas();
    const sala = ambiente('sala', 'sala', 3, 4, { x: 2.5, y: 3 });
    if (sala.tipo === 'ambiente') sala.props.peDireito = 3.2;
    projeto.elementos = [
      sala,
      ...projeto.elementos.map((el) => (el.id === 't1' ? { ...el, vinculos: { ambienteId: 'sala' } } : el)),
    ];
    // TUG: 7 + (3,20 − 0,30) + 1,20 (quadro fora do ambiente: pé-direito geral)
    expect(qtd(projeto, 'eletrica:fio:2.5:confirmado')).toBeCloseTo((7 + 2.9 + 1.2) * 3, 9);
  });

  it('pé-direito null → alerta e sem eletrodutos/fios (pontos e caixas continuam)', () => {
    const resultado = moduloEletrica.calcular(projetoComRotas(null));
    expect(resultado.alertas.some((a) => a.campo === 'peDireito' && a.disciplina === 'eletrica')).toBe(true);
    expect(resultado.linhas.some((l) => l.grupo === 'Eletrodutos e fios')).toBe(false);
    expect(resultado.linhas.find((l) => l.id === 'eletrica:pontos:tug:confirmado')?.quantidade).toBe(1);
    expect(resultado.derivados).toHaveLength(2);
  });

  it('sem quadro → alerta e sem eletrodutos/fios; pontos, caixas e circuitos continuam', () => {
    const projeto = projetoComRotas();
    projeto.elementos = projeto.elementos.filter((el) => el.tipo !== 'quadro');
    const resultado = moduloEletrica.calcular(projeto);
    expect(resultado.alertas).toContainEqual({ disciplina: 'eletrica', campo: 'quadro', mensagem: MENSAGEM_SEM_QUADRO });
    expect(resultado.linhas.some((l) => l.grupo === 'Eletrodutos e fios')).toBe(false);
    expect(resultado.derivados).toEqual([]);
    expect(resultado.linhas.find((l) => l.id === 'eletrica:caixa:4x2:confirmado')?.quantidade).toBe(1);
    expect(resultado.linhas.find((l) => l.id === 'eletrica:disjuntor:10:confirmado')?.quantidade).toBe(2);
  });

  it('página sem escala → alerta "escala" e nenhuma linha', () => {
    const projeto = projetoComRotas();
    projeto.paginas = {};
    const resultado = moduloEletrica.calcular(projeto);
    expect(resultado.linhas).toEqual([]);
    expect(resultado.derivados).toEqual([]);
    expect(resultado.alertas.map((a) => a.campo)).toEqual(['escala']);
  });

  it('rotas automáticas saem em derivados (em L, uma por ponto)', () => {
    const { derivados } = moduloEletrica.calcular(projetoComRotas());
    expect(derivados).toHaveLength(2);
    expect(derivados![0]).toMatchObject({
      id: 'eletrica:rota:t1',
      disciplina: 'eletrica',
      pagina: 1,
      status: 'confirmado',
      elementoId: 't1',
    });
    expect(derivados![0]!.pontos).toEqual([
      { x: 0, y: 0 },
      { x: un(3), y: 0 },
      { x: un(3), y: un(4) },
    ]);
  });

  it('rota redesenhada substitui a automática (pela extremidade ou por vinculos.alvoId)', () => {
    const rota = (pontosM: Ponto[], extra: Partial<ElementoDe<'eletroduto'>> = {}): Elemento => ({
      id: 'rota',
      tipo: 'eletroduto',
      disciplina: 'eletrica',
      pagina: 1,
      geometria: { tipo: 'polilinha', pontos: pontosM.map((p) => ({ x: un(p.x), y: un(p.y) })) },
      vinculos: {},
      origem: 'desenhado',
      status: 'confirmado',
      props: {},
      ...extra,
    });
    // diagonal de 5 m terminando a 10 cm do ponto (tolerância 15 cm)
    const projeto = projetoComRotas();
    projeto.elementos.push(rota([{ x: 0, y: 0 }, { x: 3, y: 3.9 }]));
    const horizontal = Math.hypot(3, 3.9);
    const resultado = moduloEletrica.calcular(projeto);
    expect(resultado.derivados!.map((d) => d.elementoId)).toEqual(['l1']);
    expect(qtd(projeto, 'eletrica:fio:2.5:confirmado')).toBeCloseTo((horizontal + 2.4 + 1.2) * 3, 9);
    expect(linha(projeto, 'eletrica:eletroduto:25:confirmado')?.elementoIds).toContain('rota');

    // começando sobre o ponto também vale; diâmetro próprio vira outra linha
    const invertida = projetoComRotas();
    invertida.elementos.push(rota([{ x: 3, y: 4 }, { x: 0, y: 0 }], { props: { diametroMm: 32 } }));
    expect(qtd(invertida, 'eletrica:eletroduto:32:confirmado')).toBeCloseTo(5 + 2.4, 9);
    expect(qtd(invertida, 'eletrica:eletroduto:25:confirmado')).toBeCloseTo(3.2 + 1.2, 9);

    // vinculos.alvoId dispensa a proximidade
    const vinculada = projetoComRotas();
    vinculada.elementos.push(rota([{ x: 0, y: 0 }, { x: 1, y: 0 }], { vinculos: { alvoId: 't1' } }));
    expect(qtd(vinculada, 'eletrica:fio:2.5:confirmado')).toBeCloseTo((1 + 2.4 + 1.2) * 3, 9);

    // rota que não chega a nenhum ponto: alerta, e a automática continua valendo
    const solta = projetoComRotas();
    solta.elementos.push(rota([{ x: 0, y: 0 }, { x: 1, y: 1 }]));
    const r = moduloEletrica.calcular(solta);
    expect(r.alertas.some((a) => a.campo === 'alvoId' && a.elementoId === 'rota')).toBe(true);
    expect(r.derivados).toHaveLength(2);
    expect(qtd(solta, 'eletrica:fio:2.5:confirmado')).toBeCloseTo(10.6 * 3, 9);
  });

  it('pontos, carga, caixas, luminárias, disjuntores, DR e DPS', () => {
    const projeto = projetoBase();
    projeto.elementos = [
      ponto('l1', { ...LUZ, potenciaVA: 160 }, { x: 1, y: 1 }),
      ponto('l2', LUZ, { x: 2, y: 1 }),
      ponto('t1', TUG, { x: 1, y: 2 }),
      ponto('i1', { tipoPonto: 'interruptor', potenciaVA: 0, altura: 'interruptor' }, { x: 0, y: 1 }),
      ponto('ch', { tipoPonto: 'tue', potenciaVA: 5500, altura: 'alta', tue: 'chuveiro' }, { x: 3, y: 3 }),
    ];
    const { linhas } = moduloEletrica.calcular(projeto);
    const por = (id: string) => linhas.find((l) => l.id === `eletrica:${id}:confirmado`);
    expect(por('pontos:luz')).toMatchObject({ quantidade: 2, unidade: 'un', grupo: 'Pontos', elementoIds: ['l1', 'l2'] });
    expect(por('pontos:tug')?.quantidade).toBe(1);
    expect(por('pontos:interruptor')?.quantidade).toBe(1);
    expect(por('pontos:tue:chuveiro')).toMatchObject({ quantidade: 1, detalhe: 'Chuveiro' });
    expect(por('carga')).toMatchObject({ quantidade: 5860, unidade: 'VA' });
    expect(por('caixa:4x2')).toMatchObject({ quantidade: 2, ehMaterial: true, grupo: 'Caixas' });
    expect(por('caixa:4x4')?.quantidade).toBe(1);
    expect(por('caixa:octogonal')?.quantidade).toBe(2);
    expect(por('luminaria')).toMatchObject({ quantidade: 2, ehMaterial: true, grupo: 'Luminárias' });
    expect(por('lampada')?.quantidade).toBe(2);
    expect(por('disjuntor:10')).toMatchObject({ quantidade: 2, detalhe: '10 A', ehMaterial: true, grupo: 'Circuitos' });
    expect(por('disjuntor:50')).toMatchObject({ quantidade: 1, detalhe: '50 A' });
    expect(por('dr')?.quantidade).toBe(QUANTIDADE_DR);
    expect(por('dps')?.quantidade).toBe(QUANTIDADE_DPS);
    expect(linhas.every((l) => l.disciplina === 'eletrica' && l.status === 'confirmado')).toBe(true);
    expect(new Set(linhas.map((l) => l.id)).size).toBe(linhas.length);
  });

  it('sugestões pendentes não entram nas linhas "confirmado"', () => {
    const base = projetoComRotas();
    const confirmadas = moduloEletrica.calcular(base).linhas;

    const comSugestoes = projetoComRotas();
    comSugestoes.elementos.unshift(ambiente('sala', 'sala', 3, 4, { x: 5, y: 5 }, ['ar-condicionado']));
    comSugestoes.elementos.push(...sugerir(comSugestoes));
    const linhas = moduloEletrica.calcular(comSugestoes).linhas;

    expect(linhas.filter((l) => l.status === 'confirmado')).toEqual(confirmadas);
    const pendentes = linhas.filter((l) => l.status === 'pendente');
    expect(pendentes.find((l) => l.id === 'eletrica:pontos:tug:pendente')?.quantidade).toBe(3);
    expect(pendentes.find((l) => l.id === 'eletrica:pontos:tue:ar-condicionado:pendente')?.quantidade).toBe(1);
    expect(pendentes.some((l) => l.id.startsWith('eletrica:eletroduto:'))).toBe(true);
    expect(pendentes.some((l) => l.id.startsWith('eletrica:disjuntor:'))).toBe(true);
    // DR/DPS já existem como confirmados: os pendentes não os duplicam
    expect(pendentes.some((l) => l.id.startsWith('eletrica:dr') || l.id.startsWith('eletrica:dps'))).toBe(false);
  });

  it('só com sugestões pendentes: todas as linhas saem pendentes (inclusive DR/DPS)', () => {
    const projeto = projetoBase();
    projeto.elementos = [ambiente('sala', 'sala', 3, 4)];
    projeto.elementos.push(...sugerir(projeto));
    const { linhas, derivados } = moduloEletrica.calcular(projeto);
    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas.every((l) => l.status === 'pendente')).toBe(true);
    expect(linhas.find((l) => l.id === 'eletrica:dr:pendente')?.quantidade).toBe(QUANTIDADE_DR);
    expect(derivados).toEqual([]); // sem quadro
  });

  it('calcular é pura (não altera o projeto)', () => {
    const projeto = projetoComRotas();
    const copia = JSON.stringify(projeto);
    moduloEletrica.calcular(projeto);
    moduloEletrica.sugerir!(projeto, 1);
    expect(JSON.stringify(projeto)).toBe(copia);
  });
});
