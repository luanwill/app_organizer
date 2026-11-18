import { describe, expect, it } from 'vitest';
import { projetoVazio } from '@/core/model';
import type { ElementoDe, Projeto } from '@/core/model';
import { areaPoligono, paraM2 } from '@/core/calc';
import { importarJSON, PENDENCIA_SEM_ESCALA } from './json';

const ESCALA = 0.02; // m por unidade da página
const contexto = { pagina: 3, escala: ESCALA };

function projetoDeExemplo(): Projeto {
  const p = projetoVazio('proj-1', '2026-01-01T00:00:00.000Z');
  p.nome = 'Casa';
  p.paginas = { 1: { escala: 0.01, largura: 842, altura: 595 } };
  p.parametros.gerais.peDireito = 2.8;
  p.elementos = [
    {
      id: 'a1', tipo: 'ambiente', disciplina: 'arquitetura', pagina: 1, vinculos: {}, origem: 'desenhado', status: 'confirmado',
      geometria: { tipo: 'poligono', pontos: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] },
      props: { nome: 'Sala', tipoAmbiente: 'sala', areaMolhada: false, coberto: true },
    },
  ];
  return p;
}

const envelope = (projeto: unknown, extra: object = {}) =>
  JSON.stringify({ formato: 'bim-leve', versao: 1, exportadoEm: '2026-01-02T00:00:00.000Z', projeto, ...extra });

describe('importarJSON — envelope do app', () => {
  it('devolve o projeto igual', () => {
    const projeto = projetoDeExemplo();
    const r = importarJSON(envelope(projeto), contexto);
    expect(r.tipo).toBe('projeto');
    if (r.tipo !== 'projeto') return;
    expect(r.projeto).toEqual(projeto);
    expect(r.pendencias).toContain('Espessura das paredes não informada');
    expect(r.pendencias).not.toContain('Pé-direito não informado');
  });

  it('valida o mínimo: versão, elementos e parâmetros', () => {
    const projeto = projetoDeExemplo();
    expect(importarJSON(envelope(projeto, { versao: 2 }), contexto).tipo).toBe('erro');
    expect(importarJSON(envelope({ ...projeto, versao: 9 }), contexto).tipo).toBe('erro');
    expect(importarJSON(envelope({ ...projeto, elementos: 'x' }), contexto).tipo).toBe('erro');
    expect(importarJSON(envelope({ ...projeto, parametros: undefined }), contexto).tipo).toBe('erro');
    expect(importarJSON(JSON.stringify({ formato: 'bim-leve', versao: 1 }), contexto).tipo).toBe('erro');
  });
});

describe('importarJSON — dados parciais', () => {
  const parcial = {
    parametros: { peDireito: 2.8, espessuraParede: 0.15 },
    ambientes: [
      { nome: 'Sala', tipo: 'sala', pontos: [[0, 0], [4, 0], [4, 3], [0, 3]] },
      { nome: 'Banheiro', largura: 1.5, comprimento: 2, x: 4, y: 0 },
      { nome: 'Cozinha', tipo: 'cozinha', area: 9 },
      { tipo: 'quarto', pontos: [[0, 3], [3, 3], [3, 6], [0, 6]] },
    ],
    paredes: [{ pontos: [[0, 0], [4, 0]], espessura: 0.2 }, { pontos: [[4, 0], [4, 3]] }, { espessura: 0.15 }],
    esquadrias: [
      { codigo: 'P1', categoria: 'porta', largura: 0.8, altura: 2.1, peitoril: 0, quantidade: 3 },
      { codigo: 'J1', categoria: 'janela', largura: 1.2 },
    ],
  };

  it('gera elementos pendentes em unidades da página', () => {
    const r = importarJSON(JSON.stringify(parcial), contexto);
    expect(r.tipo).toBe('parcial');
    if (r.tipo !== 'parcial') return;
    expect(r.elementos.every((e) => e.origem === 'importado' && e.status === 'pendente' && e.pagina === 3)).toBe(true);

    const ambientes = r.elementos.filter((e) => e.tipo === 'ambiente') as ElementoDe<'ambiente'>[];
    expect(ambientes.map((a) => a.props.nome)).toEqual(['Sala', 'Banheiro', 'Ambiente 4']);
    const [sala, banheiro, quarto] = ambientes;
    expect(sala!.geometria).toEqual({
      tipo: 'poligono',
      pontos: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 150 }, { x: 0, y: 150 }],
    });
    expect(sala!.props).toEqual({ nome: 'Sala', tipoAmbiente: 'sala', areaMolhada: false, coberto: true });
    expect(banheiro!.props).toMatchObject({ tipoAmbiente: 'banheiro', areaMolhada: true });
    if (banheiro!.geometria.tipo !== 'poligono') throw new Error('esperado polígono');
    expect(paraM2(areaPoligono(banheiro!.geometria.pontos), ESCALA)).toBeCloseTo(3, 9);
    expect(quarto!.props.tipoAmbiente).toBe('quarto');

    const paredes = r.elementos.filter((e) => e.tipo === 'parede') as ElementoDe<'parede'>[];
    expect(paredes.map((p) => p.props.espessura)).toEqual([0.2, 0.15]); // a 2ª usa a espessura padrão do arquivo
    expect(paredes[0]!.geometria).toEqual({ tipo: 'polilinha', pontos: [{ x: 0, y: 0 }, { x: 200, y: 0 }] });
  });

  it('devolve o cadastro de esquadrias e o patch de parâmetros', () => {
    const r = importarJSON(JSON.stringify(parcial), contexto);
    if (r.tipo !== 'parcial') throw new Error('esperado parcial');
    expect(r.parametros).toEqual({ gerais: { peDireito: 2.8, espessuraParede: 0.15 } });
    expect(r.esquadrias).toHaveLength(2);
    expect(r.esquadrias[0]).toMatchObject({ codigo: 'P1', categoria: 'porta', largura: 0.8, altura: 2.1, peitoril: 0, quantidade: 3 });
    expect(r.esquadrias[1]).toMatchObject({ codigo: 'J1', categoria: 'janela', largura: 1.2, altura: 0, peitoril: 0, quantidade: 0 });
    expect(r.esquadrias[0]!.id).not.toBe(r.esquadrias[1]!.id);
  });

  it('lista o que falta preencher', () => {
    const r = importarJSON(JSON.stringify(parcial), contexto);
    if (r.tipo !== 'parcial') throw new Error('esperado parcial');
    expect(r.pendencias).toContain('Número de pessoas: não informado');
    expect(r.pendencias).toContain('Cozinha: falta a geometria');
    expect(r.pendencias).toContain('Ambiente 4 sem nome');
    expect(r.pendencias).toContain('Banheiro: tipo do ambiente deduzido do nome — confira');
    expect(r.pendencias).toContain('Parede 3: falta a geometria');
    expect(r.pendencias.some((p) => p.startsWith('Esquadria J1: falta altura, peitoril, quantidade'))).toBe(true);
    expect(r.pendencias).not.toContain(PENDENCIA_SEM_ESCALA);
    expect(r.pendencias.some((p) => p.startsWith('Pé-direito'))).toBe(false);
  });

  it('JSON só com ambientes lista todos os parâmetros ausentes, a espessura e o tipo', () => {
    const r = importarJSON(
      JSON.stringify({ ambientes: [{ nome: 'Ateliê', pontos: [[0, 0], [1, 0], [1, 1]] }], paredes: [{ pontos: [[0, 0], [1, 0]] }] }),
      contexto,
    );
    if (r.tipo !== 'parcial') throw new Error('esperado parcial');
    expect(r.parametros).toEqual({});
    expect(r.pendencias).toEqual(
      expect.arrayContaining([
        'Pé-direito: não informado',
        'Espessura das paredes: não informado',
        'Número de pessoas: não informado',
        'Ateliê: falta o tipo do ambiente',
        'Parede 1: falta a espessura',
      ]),
    );
    const parede = r.elementos.find((e) => e.tipo === 'parede') as ElementoDe<'parede'>;
    expect(parede.props.espessura).toBeNull(); // não assume valor
  });

  it('sem escala → pendência e nenhuma geometria (parâmetros e esquadrias continuam)', () => {
    const r = importarJSON(JSON.stringify(parcial), { pagina: 1, escala: null });
    if (r.tipo !== 'parcial') throw new Error('esperado parcial');
    expect(r.elementos).toEqual([]);
    expect(r.pendencias).toContain('Calibre a escala da página para importar geometrias');
    expect(r.esquadrias).toHaveLength(2);
    expect(r.parametros).toEqual({ gerais: { peDireito: 2.8, espessuraParede: 0.15 } });
  });

  it('valores inválidos não entram', () => {
    const r = importarJSON(JSON.stringify({ parametros: { peDireito: -1, numeroPessoas: 'quatro' } }), contexto);
    if (r.tipo !== 'parcial') throw new Error('esperado parcial');
    expect(r.parametros).toEqual({});
    expect(r.pendencias.some((p) => p.startsWith('Pé-direito: valor inválido'))).toBe(true);
    expect(r.pendencias.some((p) => p.startsWith('Número de pessoas: valor inválido'))).toBe(true);
  });
});

describe('importarJSON — erros', () => {
  it('JSON inválido → erro com mensagem em pt-BR', () => {
    const r = importarJSON('{ isto não é json', contexto);
    expect(r).toEqual({ tipo: 'erro', mensagem: expect.stringContaining('JSON inválido') });
  });

  it('JSON que não é objeto ou não tem campos conhecidos → erro', () => {
    expect(importarJSON('[1, 2]', contexto).tipo).toBe('erro');
    expect(importarJSON('42', contexto).tipo).toBe('erro');
    expect(importarJSON('{"outra": "coisa"}', contexto).tipo).toBe('erro');
  });
});
