import { describe, expect, it } from 'vitest';
import type { Elemento, LinhaQuantitativo, Ponto, Projeto, ResultadoDisciplina, Status, TipoEsquadria } from '@/core/model';
import { projetoVazio } from '@/core/model';
import {
  calcularArquitetura,
  contarPosicionadas,
  descontoDoVao,
  esquadriaNoAmbiente,
  proximoNomeAmbiente,
} from './calcular';

const ESCALA = 0.02; // m por unidade do PDF
const u = (metros: number) => metros / ESCALA;

/** Retângulo L × H (m) com canto em (x0, y0) m, em unidades do PDF. */
function retangulo(l: number, h: number, x0 = 0, y0 = 0): Ponto[] {
  return [
    { x: u(x0), y: u(y0) },
    { x: u(x0 + l), y: u(y0) },
    { x: u(x0 + l), y: u(y0 + h) },
    { x: u(x0), y: u(y0 + h) },
  ];
}

const base = (id: string, status: Status = 'confirmado') =>
  ({ id, disciplina: 'arquitetura', pagina: 1, vinculos: {}, origem: 'desenhado', status }) as const;

function ambiente(id: string, nome: string, pontos: Ponto[], extra: Partial<Elemento> & { molhada?: boolean; peDireito?: number | null } = {}): Elemento {
  const { molhada = false, peDireito, ...resto } = extra;
  return {
    ...base(id),
    tipo: 'ambiente',
    geometria: { tipo: 'poligono', pontos },
    props: { nome, tipoAmbiente: 'outro', areaMolhada: molhada, coberto: true, peDireito },
    ...resto,
  } as Elemento;
}

function esquadria(id: string, tipoId: string, xM: number, yM: number, extra: Partial<Elemento> = {}): Elemento {
  return {
    ...base(id),
    tipo: 'esquadria',
    geometria: { tipo: 'ponto', ponto: { x: u(xM), y: u(yM) } },
    props: { tipoEsquadriaId: tipoId },
    ...extra,
  } as Elemento;
}

function parede(id: string, pontosM: [number, number][], extra: Partial<Elemento> & { espessura?: number | null; altura?: number | null } = {}): Elemento {
  const { espessura = 0.15, altura, ...resto } = extra;
  return {
    ...base(id),
    tipo: 'parede',
    geometria: { tipo: 'polilinha', pontos: pontosM.map(([x, y]) => ({ x: u(x), y: u(y) })) },
    props: { espessura, altura },
    ...resto,
  } as Elemento;
}

const P1: TipoEsquadria = { id: 'p1', codigo: 'P1', categoria: 'porta', largura: 0.8, altura: 2.1, peitoril: 0, quantidade: 2 };
const J1: TipoEsquadria = { id: 'j1', codigo: 'J1', categoria: 'janela', largura: 1.2, altura: 1.0, peitoril: 1.1, quantidade: 1 };
const J2: TipoEsquadria = { id: 'j2', codigo: 'J2', categoria: 'janela', largura: 2.4, altura: 1.0, peitoril: 1.1, quantidade: 1 };

function projeto(elementos: Elemento[], ajustar?: (p: Projeto) => void): Projeto {
  const p = projetoVazio('teste', '2026-01-01T00:00:00.000Z');
  p.paginas = { 1: { escala: ESCALA } };
  p.parametros.gerais.peDireito = 2.8;
  p.esquadrias = [P1, J1, J2];
  p.elementos = elementos;
  ajustar?.(p);
  return p;
}

const achar = (r: ResultadoDisciplina, id: string): LinhaQuantitativo | undefined => r.linhas.find((l) => l.id === id);
const qtd = (r: ResultadoDisciplina, id: string): number => {
  const l = achar(r, id);
  if (!l) throw new Error(`linha ausente: ${id}`);
  return l.quantidade;
};

const SALA = () => ambiente('a1', 'Sala', retangulo(3.07, 2.98));
const PERIMETRO = 12.1;
const AREA = 3.07 * 2.98;

describe('ambientes', () => {
  it('retângulo 3,07 × 2,98 m → área 9,15 m² e perímetro 12,10 m', () => {
    const r = calcularArquitetura(projeto([SALA()]));
    expect(qtd(r, 'a1:area')).toBeCloseTo(9.15, 2);
    expect(qtd(r, 'a1:perimetro')).toBeCloseTo(12.1, 6);
    expect(qtd(r, 'a1:teto')).toBeCloseTo(AREA, 6);
    const area = achar(r, 'a1:area')!;
    expect(area).toMatchObject({ grupo: 'Ambientes', descricao: 'Sala — área', unidade: 'm²', disciplina: 'arquitetura' });
    expect(area.elementoIds).toEqual(['a1']);
    expect(r.alertas).toEqual([]);
  });

  it('área de parede = perímetro × pé-direito (sem vãos)', () => {
    const r = calcularArquitetura(projeto([SALA()]));
    expect(qtd(r, 'a1:area-parede')).toBeCloseTo(PERIMETRO * 2.8, 6);
  });

  it('pé-direito próprio do ambiente prevalece sobre o geral', () => {
    const r = calcularArquitetura(projeto([ambiente('a1', 'Sala', retangulo(3.07, 2.98), { peDireito: 3 })]));
    expect(qtd(r, 'a1:area-parede')).toBeCloseTo(PERIMETRO * 3, 6);
  });
});

describe('desconto de vãos', () => {
  // J1 (1,2 m²) e J2 (2,4 m²) na borda superior da sala
  const els = () => [SALA(), esquadria('e1', 'j1', 0.8, 0), esquadria('e2', 'j2', 2, 0)];

  it("modo padrão ('acima-do-limite'): 1,20×1,00 não desconta; 2,40×1,00 desconta inteiro", () => {
    const r = calcularArquitetura(projeto(els()));
    expect(qtd(r, 'a1:area-parede')).toBeCloseTo(PERIMETRO * 2.8 - 2.4, 6);
    expect(achar(r, 'a1:area-parede')!.elementoIds).toEqual(['a1', 'e2']);
  });

  it("modo 'todos' desconta todos os vãos", () => {
    const r = calcularArquitetura(projeto(els(), (p) => (p.parametros.arquitetura.modoDescontoVao = 'todos')));
    expect(qtd(r, 'a1:area-parede')).toBeCloseTo(PERIMETRO * 2.8 - 2.4 - 1.2, 6);
  });

  it("modo 'nenhum' não desconta", () => {
    const r = calcularArquitetura(projeto(els(), (p) => (p.parametros.arquitetura.modoDescontoVao = 'nenhum')));
    expect(qtd(r, 'a1:area-parede')).toBeCloseTo(PERIMETRO * 2.8, 6);
  });

  it('vão exatamente igual ao limite não é descontado; limite configurável', () => {
    const regra = { modoDescontoVao: 'acima-do-limite', limiteDescontoVaoM2: 2 } as const;
    expect(descontoDoVao({ largura: 2, altura: 1 }, regra)).toBe(0);
    expect(descontoDoVao({ largura: 2.4, altura: 1 }, regra)).toBeCloseTo(2.4);
    expect(descontoDoVao({ largura: 1.2, altura: 1 }, { ...regra, limiteDescontoVaoM2: 1 })).toBeCloseTo(1.2);
  });

  it('esquadria longe do ambiente (> 0,30 m) não pertence a ele', () => {
    const r = calcularArquitetura(projeto([SALA(), esquadria('e2', 'j2', 2, -0.5)]));
    expect(qtd(r, 'a1:area-parede')).toBeCloseTo(PERIMETRO * 2.8, 6);
    const sala = SALA() as Extract<Elemento, { tipo: 'ambiente' }>;
    const perto = esquadria('x', 'j2', 2, -0.3) as Extract<Elemento, { tipo: 'esquadria' }>;
    expect(esquadriaNoAmbiente(perto, sala, ESCALA)).toBe(true);
  });

  it('porta entre dois ambientes pertence aos dois', () => {
    const quarto = ambiente('a2', 'Quarto', retangulo(3, 2.98, 3.22, 0)); // parede de 15 cm entre eles
    const r = calcularArquitetura(projeto([SALA(), quarto, esquadria('e1', 'p1', 3.145, 1.5)]));
    expect(qtd(r, 'a1:rodape')).toBeCloseTo(PERIMETRO - 0.8, 6);
    expect(qtd(r, 'a2:rodape')).toBeCloseTo(11.96 - 0.8, 6);
  });

  it('esquadria pendente não altera ambiente confirmado; conta em ambiente pendente', () => {
    const pend = esquadria('e2', 'j2', 2, 0, { status: 'pendente' });
    const r1 = calcularArquitetura(projeto([SALA(), pend]));
    expect(qtd(r1, 'a1:area-parede')).toBeCloseTo(PERIMETRO * 2.8, 6);
    const r2 = calcularArquitetura(projeto([ambiente('a1', 'Sala', retangulo(3.07, 2.98), { status: 'pendente' }), pend]));
    expect(qtd(r2, 'a1:area-parede')).toBeCloseTo(PERIMETRO * 2.8 - 2.4, 6);
  });
});

describe('acabamentos', () => {
  it('ambiente seco: piso, contrapiso, rodapé, pintura, chapisco/emboço/reboco — sem revestimento nem impermeabilização', () => {
    const r = calcularArquitetura(projeto([SALA(), esquadria('e1', 'p1', 1, 0), esquadria('e2', 'p1', 0, 1)]));
    const parede = PERIMETRO * 2.8;
    expect(qtd(r, 'a1:piso')).toBeCloseTo(AREA, 6);
    expect(qtd(r, 'a1:contrapiso')).toBeCloseTo(AREA, 6);
    expect(qtd(r, 'a1:rodape')).toBeCloseTo(PERIMETRO - 2 * 0.8, 6);
    expect(qtd(r, 'a1:pintura-parede')).toBeCloseTo(parede, 6);
    expect(qtd(r, 'a1:pintura-teto')).toBeCloseTo(AREA, 6);
    for (const s of ['chapisco', 'emboco', 'reboco']) expect(qtd(r, `a1:${s}`)).toBeCloseTo(parede, 6);
    expect(achar(r, 'a1:revestimento-parede')).toBeUndefined();
    expect(achar(r, 'a1:impermeabilizacao')).toBeUndefined();
    expect(achar(r, 'a1:rodape')).toMatchObject({ grupo: 'Acabamentos', servico: 'rodape', unidade: 'm' });
    expect(achar(r, 'a1:pintura-parede')).toMatchObject({ servico: 'pintura-parede', detalhe: '2 demãos' });
    expect(achar(r, 'a1:pintura-teto')!.detalhe).toBe('2 demãos');
  });

  it('janela não reduz o rodapé; rodapé nunca fica negativo', () => {
    const r = calcularArquitetura(projeto([SALA(), esquadria('e1', 'j1', 1, 0)]));
    expect(qtd(r, 'a1:rodape')).toBeCloseTo(PERIMETRO, 6);
    const portao: TipoEsquadria = { ...P1, id: 'px', largura: 20 };
    const r2 = calcularArquitetura(projeto([SALA(), esquadria('e1', 'px', 1, 0)], (p) => p.esquadrias.push(portao)));
    expect(qtd(r2, 'a1:rodape')).toBe(0);
  });

  it('área molhada: revestimento e impermeabilização = piso + 0,30 × perímetro; sem rodapé nem pintura de parede', () => {
    const r = calcularArquitetura(projeto([ambiente('a1', 'Banho', retangulo(3.07, 2.98), { molhada: true })]));
    expect(qtd(r, 'a1:impermeabilizacao')).toBeCloseTo(AREA + 0.3 * PERIMETRO, 6);
    expect(qtd(r, 'a1:revestimento-parede')).toBeCloseTo(PERIMETRO * 2.8, 6);
    expect(achar(r, 'a1:rodape')).toBeUndefined();
    expect(achar(r, 'a1:pintura-parede')).toBeUndefined();
    expect(qtd(r, 'a1:pintura-teto')).toBeCloseTo(AREA, 6);
    expect(qtd(r, 'a1:reboco')).toBeCloseTo(PERIMETRO * 2.8, 6);
  });

  it('subida da impermeabilização é configurável', () => {
    const r = calcularArquitetura(
      projeto([ambiente('a1', 'Banho', retangulo(3.07, 2.98), { molhada: true })], (p) => {
        p.parametros.arquitetura.subidaImpermeabilizacao = 0.5;
      }),
    );
    expect(qtd(r, 'a1:impermeabilizacao')).toBeCloseTo(AREA + 0.5 * PERIMETRO, 6);
  });
});

describe('pé-direito', () => {
  const els = () => [
    SALA(),
    ambiente('a2', 'Banho', retangulo(2, 1.5, 10, 0), { molhada: true }),
    parede('w1', [[0, 0], [3.07, 0]]),
  ];
  const DEPENDENTES = ['a1:area-parede', 'a1:pintura-parede', 'a1:reboco', 'a1:chapisco', 'a1:emboco', 'a2:revestimento-parede', 'w1:alvenaria'];

  it('alterar o pé-direito altera área de parede, pintura, revestimento, reboco e alvenaria', () => {
    const r28 = calcularArquitetura(projeto(els()));
    const r30 = calcularArquitetura(projeto(els(), (p) => (p.parametros.gerais.peDireito = 3)));
    for (const id of DEPENDENTES) {
      expect(qtd(r30, id) / qtd(r28, id)).toBeCloseTo(3 / 2.8, 6);
    }
    expect(qtd(r30, 'w1:alvenaria')).toBeCloseTo(3.07 * 3, 6);
    expect(qtd(r30, 'a1:area')).toBeCloseTo(qtd(r28, 'a1:area'), 9);
  });

  it("pé-direito null → alerta 'peDireito' e nenhuma linha dependente", () => {
    const r = calcularArquitetura(projeto(els(), (p) => (p.parametros.gerais.peDireito = null)));
    for (const id of DEPENDENTES) expect(achar(r, id)).toBeUndefined();
    const alertas = r.alertas.filter((a) => a.campo === 'peDireito');
    expect(alertas.map((a) => a.elementoId).sort()).toEqual(['a1', 'a2', 'w1']);
    expect(alertas.find((a) => a.elementoId === 'a1')!.mensagem).toContain('Pé-direito não informado (Sala)');
    // o que não depende do pé-direito continua saindo
    expect(qtd(r, 'a1:area')).toBeCloseTo(AREA, 6);
    expect(qtd(r, 'a1:piso')).toBeCloseTo(AREA, 6);
    expect(qtd(r, 'a1:rodape')).toBeCloseTo(PERIMETRO, 6);
    expect(qtd(r, 'w1:comprimento')).toBeCloseTo(3.07, 6);
  });
});

describe('paredes', () => {
  it('comprimento e alvenaria = comprimento × altura − vãos hospedados', () => {
    const w = parede('w1', [[0, 0], [5, 0]]);
    const hospedada = (id: string, tipo: string) => esquadria(id, tipo, 2, 0, { vinculos: { paredeId: 'w1' } });
    const r = calcularArquitetura(projeto([w, hospedada('e1', 'j1'), hospedada('e2', 'j2'), esquadria('e3', 'j2', 3, 0)]));
    expect(qtd(r, 'w1:comprimento')).toBeCloseTo(5, 6);
    expect(qtd(r, 'w1:alvenaria')).toBeCloseTo(5 * 2.8 - 2.4, 6); // e3 não está hospedada; J1 ≤ 2 m²
    expect(achar(r, 'w1:alvenaria')).toMatchObject({ grupo: 'Paredes', servico: 'alvenaria', unidade: 'm²' });
    expect(achar(r, 'w1:comprimento')!.descricao).toBe('Parede 1 — comprimento');
  });

  it('altura própria prevalece; espessura null → alerta, mas comprimento e alvenaria saem', () => {
    const r = calcularArquitetura(projeto([parede('w1', [[0, 0], [5, 0]], { espessura: null, altura: 1.1 })]));
    expect(qtd(r, 'w1:alvenaria')).toBeCloseTo(5.5, 6);
    expect(qtd(r, 'w1:comprimento')).toBeCloseTo(5, 6);
    expect(r.alertas).toEqual([
      { disciplina: 'arquitetura', elementoId: 'w1', campo: 'espessuraParede', mensagem: 'Espessura não informada (Parede 1)' },
    ]);
  });
});

describe('esquadrias', () => {
  it('por código: quantidade posicionada e área de vão; pendentes à parte', () => {
    const r = calcularArquitetura(
      projeto([
        esquadria('e1', 'p1', 0, 0),
        esquadria('e2', 'p1', 1, 0),
        esquadria('e3', 'p1', 2, 0, { status: 'pendente' }),
        esquadria('e4', 'j1', 3, 0),
      ]),
    );
    expect(achar(r, 'esquadria:p1:quantidade')).toMatchObject({ grupo: 'Esquadrias', descricao: 'P1 — quantidade', unidade: 'un', quantidade: 2, status: 'confirmado' });
    expect(qtd(r, 'esquadria:p1:area-vao')).toBeCloseTo(2 * 0.8 * 2.1, 6);
    expect(achar(r, 'esquadria:p1:quantidade:pendente')).toMatchObject({ quantidade: 1, status: 'pendente', elementoIds: ['e3'] });
    expect(qtd(r, 'esquadria:j1:quantidade')).toBe(1);
    expect(achar(r, 'esquadria:j2:quantidade')).toBeUndefined();
    expect(contarPosicionadas(projeto([esquadria('e1', 'p1', 0, 0), esquadria('e3', 'p1', 2, 0)]).elementos)).toEqual({ p1: 2 });
  });

  it('tipo inexistente no cadastro → alerta e sem desconto', () => {
    const r = calcularArquitetura(projeto([SALA(), esquadria('e1', 'nao-existe', 1, 0)], (p) => (p.parametros.arquitetura.modoDescontoVao = 'todos')));
    expect(r.alertas).toHaveLength(1);
    expect(r.alertas[0]).toMatchObject({ elementoId: 'e1', campo: 'tipoEsquadriaId' });
    expect(qtd(r, 'a1:area-parede')).toBeCloseTo(PERIMETRO * 2.8, 6);
    expect(r.linhas.some((l) => l.grupo === 'Esquadrias')).toBe(false);
  });
});

describe('status, escala e valores manuais', () => {
  it('elementos pendentes geram linhas pendentes; confirmados, confirmadas', () => {
    const r = calcularArquitetura(
      projeto([
        SALA(),
        ambiente('a2', 'Quarto', retangulo(3, 3, 10, 0), { status: 'pendente' }),
        parede('w1', [[0, 0], [5, 0]], { status: 'pendente' }),
      ]),
    );
    const doElemento = (id: string) => r.linhas.filter((l) => l.elementoIds[0] === id);
    expect(doElemento('a1').length).toBeGreaterThan(0);
    expect(doElemento('a1').every((l) => l.status === 'confirmado')).toBe(true);
    expect(doElemento('a2').length).toBeGreaterThan(0);
    expect(doElemento('a2').every((l) => l.status === 'pendente')).toBe(true);
    expect(doElemento('w1').every((l) => l.status === 'pendente')).toBe(true);
  });

  it('página sem escala → alerta e sem linhas', () => {
    const els = [
      ambiente('a1', 'Sala', retangulo(3, 3), { pagina: 2 }),
      parede('w1', [[0, 0], [5, 0]], { pagina: 2 }),
      esquadria('e1', 'p1', 0, 0, { pagina: 3 }),
    ];
    const r = calcularArquitetura(projeto(els, (p) => (p.paginas[3] = { escala: null })));
    expect(r.linhas).toEqual([]);
    expect(r.alertas.map((a) => a.campo)).toEqual(['escala', 'escala']);
    expect(r.alertas[0].mensagem).toBe('Página 2 sem escala calibrada: 2 elementos não foram medidos');
    expect(r.alertas[1].mensagem).toBe('Página 3 sem escala calibrada: 1 elemento não foi medido');
  });

  it('valor manual de área substitui o geométrico e marca manual=true só no que deriva dele', () => {
    const r = calcularArquitetura(projeto([ambiente('a1', 'Sala', retangulo(3.07, 2.98), { manuais: { area: 10 } })]));
    for (const id of ['a1:area', 'a1:teto', 'a1:piso', 'a1:contrapiso', 'a1:pintura-teto']) {
      expect(achar(r, id)).toMatchObject({ quantidade: 10, manual: true });
    }
    expect(achar(r, 'a1:perimetro')!.manual).toBeUndefined();
    expect(achar(r, 'a1:area-parede')!.manual).toBeUndefined();
  });

  it('valor manual de perímetro e de comprimento', () => {
    const r = calcularArquitetura(
      projeto([
        ambiente('a1', 'Sala', retangulo(3.07, 2.98), { manuais: { perimetro: 12 } }),
        parede('w1', [[0, 0], [5, 0]], { manuais: { comprimento: 6 } }),
      ]),
    );
    expect(achar(r, 'a1:perimetro')).toMatchObject({ quantidade: 12, manual: true });
    expect(achar(r, 'a1:area-parede')).toMatchObject({ manual: true });
    expect(qtd(r, 'a1:area-parede')).toBeCloseTo(12 * 2.8, 6);
    expect(achar(r, 'a1:rodape')).toMatchObject({ quantidade: 12, manual: true });
    expect(achar(r, 'a1:area')!.manual).toBeUndefined();
    expect(achar(r, 'w1:comprimento')).toMatchObject({ quantidade: 6, manual: true });
    expect(achar(r, 'w1:alvenaria')).toMatchObject({ manual: true });
    expect(qtd(r, 'w1:alvenaria')).toBeCloseTo(6 * 2.8, 6);
  });

  it('não altera o projeto (função pura) e gera ids únicos', () => {
    const p = projeto([SALA(), ambiente('a2', 'Banho', retangulo(2, 2, 10, 0), { molhada: true }), parede('w1', [[0, 0], [5, 0]]), esquadria('e1', 'p1', 1, 0)]);
    const copia = structuredClone(p);
    const r = calcularArquitetura(p);
    expect(p).toEqual(copia);
    expect(new Set(r.linhas.map((l) => l.id)).size).toBe(r.linhas.length);
    expect(calcularArquitetura(p)).toEqual(r);
  });
});

describe('medições genéricas', () => {
  const med = (id: string, modo: string, descricao: string, geometria: Elemento['geometria'], status: Status = 'confirmado'): Elemento =>
    ({ ...base(id, status), tipo: 'medicao', geometria, props: { modo, descricao } }) as Elemento;
  const pt = (x: number, y: number) => ({ x: u(x), y: u(y) });

  it('distância/polilinha → comprimento; polígono/retângulo → área e perímetro', () => {
    const r = calcularArquitetura(
      projeto([
        med('m1', 'distancia', 'Muro', { tipo: 'polilinha', pontos: [pt(0, 0), pt(4, 0)] }),
        med('m2', 'polilinha', '', { tipo: 'polilinha', pontos: [pt(0, 0), pt(4, 0), pt(4, 3)] }),
        med('m3', 'retangulo', 'Calçada', { tipo: 'poligono', pontos: retangulo(4, 2) }),
      ]),
    );
    expect(achar(r, 'm1:comprimento')).toMatchObject({ grupo: 'Medições', descricao: 'Muro — comprimento', unidade: 'm' });
    expect(qtd(r, 'm1:comprimento')).toBeCloseTo(4, 6);
    expect(qtd(r, 'm2:comprimento')).toBeCloseTo(7, 6);
    expect(achar(r, 'm2:comprimento')!.descricao).toBe('Medição — comprimento');
    expect(qtd(r, 'm3:area')).toBeCloseTo(8, 6);
    expect(qtd(r, 'm3:perimetro')).toBeCloseTo(12, 6);
  });

  it('contagem → 1 un por ponto, agrupada pela descrição e pelo status', () => {
    const ponto = (x: number): Elemento['geometria'] => ({ tipo: 'ponto', ponto: pt(x, 0) });
    const r = calcularArquitetura(
      projeto([
        med('c1', 'contagem', 'Ralo', ponto(0)),
        med('c2', 'contagem', 'Ralo', ponto(1)),
        med('c3', 'contagem', 'Ralo', ponto(2), 'pendente'),
        med('c4', 'contagem', '', ponto(3)),
      ]),
    );
    expect(achar(r, 'contagem:Ralo')).toMatchObject({ descricao: 'Ralo', unidade: 'un', quantidade: 2, status: 'confirmado', elementoIds: ['c1', 'c2'] });
    expect(achar(r, 'contagem:Ralo:pendente')).toMatchObject({ quantidade: 1, status: 'pendente' });
    expect(achar(r, 'contagem:Contagem')).toMatchObject({ descricao: 'Contagem', quantidade: 1 });
  });
});

describe('nomes', () => {
  it('próximo nome livre de ambiente', () => {
    expect(proximoNomeAmbiente([])).toBe('Ambiente 1');
    expect(proximoNomeAmbiente([SALA()])).toBe('Ambiente 2');
    expect(proximoNomeAmbiente([ambiente('a', 'Ambiente 2', retangulo(1, 1))])).toBe('Ambiente 3');
  });
});
