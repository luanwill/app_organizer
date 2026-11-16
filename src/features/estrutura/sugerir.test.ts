import { describe, expect, it } from 'vitest';
import type { Elemento, ElementoDe, Ponto, TipoElemento } from '@/core/model';
import { areaPoligono, comprimentoPolilinha, construirGrafoParedes, distancia } from '@/core/calc';
import { ESCALA, ambiente, parede, plantaEmL, projetoCom, pt, u } from './apoio-teste';
import { fundirPilares, ordenarLeitura, pilaresIntermediarios } from './pilares';
import { montarLajes, uniaoOrtogonal } from './lajes';
import { sugerirEstrutura } from './sugerir';

const doTipo = <K extends TipoElemento>(els: Elemento[], tipo: K): Extract<Elemento, { tipo: K }>[] =>
  els.filter((e): e is Extract<Elemento, { tipo: K }> => e.tipo === tipo);
const pontoDe = (e: Elemento): Ponto => (e.geometria.tipo === 'ponto' ? e.geometria.ponto : { x: NaN, y: NaN });
const emMetros = (p: Ponto): [number, number] => [+(p.x * ESCALA).toFixed(3), +(p.y * ESCALA).toFixed(3)];
const comprimentoM = (e: Elemento): number =>
  e.geometria.tipo === 'polilinha' ? comprimentoPolilinha(e.geometria.pontos) * ESCALA : 0;

describe('pilares automáticos', () => {
  const sugestoes = sugerirEstrutura(projetoCom(plantaEmL()), 1);
  const pilares = doTipo(sugestoes, 'pilar');

  it('vão exatamente igual ao máximo não recebe intermediário', () => {
    expect(pilaresIntermediarios(4, 4)).toBe(0);
    expect(pilaresIntermediarios(4.01, 4)).toBe(0); // dentro da tolerância de calibração (1%)
    expect(pilaresIntermediarios(4.05, 4)).toBe(1);
    expect(pilaresIntermediarios(8, 4)).toBe(1);
    expect(pilaresIntermediarios(9, 4)).toBe(2);
    expect(pilaresIntermediarios(3, 4)).toBe(0);
  });

  it('planta em L: 6 cantos + 1 no T + intermediários só nos vãos acima de 4,00 m', () => {
    const porTipo = (t: string) => pilares.filter((p) => p.props.noTipo === t).map((p) => emMetros(pontoDe(p)));
    // 5 cantos em L + o canto interno (4,4), que virou T com a parede interna, + o T em (0,4)
    expect(porTipo('L')).toEqual([[0, 0], [9, 0], [9, 4], [0, 8], [4, 8]]);
    expect(porTipo('T')).toEqual([[0, 4], [4, 4]]);
    // topo de 9 m → 2 intermediários (3 e 6); trecho de 5 m → 1 (no meio); lados de 4,00 m → nenhum
    expect(porTipo('intermediario')).toEqual([[3, 0], [6, 0], [6.5, 4]]);
    expect(pilares).toHaveLength(10);
  });

  it('numera P1…Pn de cima para baixo, da esquerda para a direita', () => {
    expect(pilares.map((p) => [p.rotulo, ...emMetros(pontoDe(p))])).toEqual([
      ['P1', 0, 0], ['P2', 3, 0], ['P3', 6, 0], ['P4', 9, 0],
      ['P5', 0, 4], ['P6', 4, 4], ['P7', 6.5, 4], ['P8', 9, 4],
      ['P9', 0, 8], ['P10', 4, 8],
    ]);
  });

  it('pilares na mesma "linha" (y quase igual) ordenam por x', () => {
    const pontos = [{ x: 5, y: 0.1 }, { x: 1, y: 0.15 }, { x: 3, y: 2 }, { x: 0, y: 2.1 }];
    expect(ordenarLeitura(pontos, (p) => p, 0.2).map((p) => p.x)).toEqual([1, 5, 0, 3]);
  });

  it('seção padrão, altura indefinida (derivada ao vivo), pendente e sugerido-auto', () => {
    for (const p of pilares) {
      expect(p.props.secaoB).toBe(0.14);
      expect(p.props.secaoH).toBe(0.3);
      expect(p.props.altura).toBeUndefined();
    }
    expect(sugestoes.length).toBeGreaterThan(0);
    for (const e of sugestoes) {
      expect(e.status).toBe('pendente');
      expect(e.origem).toBe('sugerido-auto');
      expect(e.disciplina).toBe('estrutura');
      expect(e.pagina).toBe(1);
    }
    expect(new Set(sugestoes.map((e) => e.id)).size).toBe(sugestoes.length);
  });

  it('funde pilares a menos de 0,50 m, mantendo o nó mais forte', () => {
    const fundidos = fundirPilares(
      [
        { ponto: { x: 0.3, y: 0.3 }, noTipo: 'extremidade' },
        { ponto: { x: 0, y: 0 }, noTipo: 'T' },
        { ponto: { x: 0.5, y: 0 }, noTipo: 'intermediario' }, // exatamente 0,50 m do T: não funde
        { ponto: { x: 3, y: 0 }, noTipo: 'L' },
      ],
      0.5,
    );
    expect(fundidos.map((p) => p.noTipo).sort()).toEqual(['L', 'T', 'intermediario']);

    // na planta: ponta solta de parede a 0,42 m de um T some; o T fica na posição dele
    const els = [parede('a', [0, 0], [4, 0]), parede('b', [2, 0], [2, 3]), parede('c', [2.3, 0.3], [2.3, 3])];
    const pilares2 = doTipo(sugerirEstrutura(projetoCom(els), 1), 'pilar');
    expect(pilares2.filter((p) => p.props.noTipo === 'T').map((p) => emMetros(pontoDe(p)))).toEqual([[2, 0]]);
    expect(pilares2.some((p) => distancia(pontoDe(p), pt(2.3, 0.3)) < u(0.01))).toBe(false);
    // b e c terminam a 0,30 m um do outro em y = 3: só um pilar ali
    expect(pilares2.filter((p) => Math.abs(pontoDe(p).y - u(3)) < 1e-6)).toHaveLength(1);
    expect(pilares2).toHaveLength(4);
  });

  it('respeita pilar confirmado: não sugere outro perto e continua a numeração', () => {
    const existente: ElementoDe<'pilar'> = {
      id: 'meu-pilar', tipo: 'pilar', disciplina: 'estrutura', pagina: 1,
      geometria: { tipo: 'ponto', ponto: pt(0.2, 0) }, vinculos: {}, origem: 'desenhado', status: 'confirmado',
      rotulo: 'P7', props: { secaoB: 0.2, secaoH: 0.2 },
    };
    const sug = sugerirEstrutura(projetoCom([...plantaEmL(), existente]), 1);
    const novos = doTipo(sug, 'pilar');
    expect(novos.some((p) => distancia(pontoDe(p), pt(0, 0)) < u(0.5))).toBe(false);
    expect(novos[0]?.rotulo).toBe('P8');
    // a fundação é sugerida também sob o pilar confirmado
    expect(doTipo(sug, 'fundacao').some((f) => f.vinculos.pilarId === 'meu-pilar')).toBe(true);
  });

  it('página sem escala ou sem paredes → nenhuma sugestão de pilar', () => {
    expect(sugerirEstrutura(projetoCom(plantaEmL(), null), 1)).toEqual([]);
    expect(sugerirEstrutura(projetoCom([]), 1)).toEqual([]);
  });
});

describe('vigas sugeridas', () => {
  const projeto = projetoCom(plantaEmL());
  const sugestoes = sugerirEstrutura(projeto, 1);
  const pilares = doTipo(sugestoes, 'pilar').map(pontoDe);
  const baldrames = doTipo(sugestoes, 'viga-baldrame');

  it('baldrame cobre 100% do comprimento das paredes (±0,1%)', () => {
    const paredes = plantaEmL().map((e) => ({ id: e.id, pontos: e.geometria.tipo === 'polilinha' ? e.geometria.pontos : [] }));
    const grafo = construirGrafoParedes(paredes, u(0.1));
    const totalParedes = grafo.arestas.reduce((s, a) => s + a.comprimento, 0) * ESCALA;
    const totalVigas = baldrames.reduce((s, v) => s + comprimentoM(v), 0);
    expect(totalParedes).toBeCloseTo(38, 6);
    expect(Math.abs(totalVigas - totalParedes) / totalParedes).toBeLessThan(0.001);
  });

  it('cada trecho começa e termina em pilar, é uma polilinha de 2 pontos e guarda a parede', () => {
    expect(baldrames).toHaveLength(11);
    const ids = new Set(plantaEmL().map((e) => e.id));
    for (const v of baldrames) {
      expect(v.geometria.tipo).toBe('polilinha');
      const pontos = v.geometria.tipo === 'polilinha' ? v.geometria.pontos : [];
      expect(pontos).toHaveLength(2);
      for (const p of pontos) expect(pilares.some((q) => distancia(p, q) < 1e-6)).toBe(true);
      expect(ids.has(v.vinculos.paredeId ?? '')).toBe(true);
      expect(comprimentoM(v)).toBeLessThanOrEqual(4 + 1e-9);
      expect(v.props).toEqual({ secaoB: 0.14, secaoH: 0.3 });
    }
    expect(baldrames.map((v) => v.rotulo)).toEqual(Array.from({ length: 11 }, (_, i) => `VB${i + 1}`));
    expect(baldrames.find((v) => comprimentoM(v) < 2.6 && comprimentoM(v) > 2.4)?.vinculos.paredeId).toBe('meio');
  });

  it('vigas superiores: mesma divisão, com liga/desliga', () => {
    const superiores = doTipo(sugestoes, 'viga-superior');
    expect(superiores).toHaveLength(11);
    expect(superiores[0]?.rotulo).toBe('VS1');
    const desligado = projetoCom(plantaEmL());
    desligado.parametros.estrutura.vigaSuperior.ativa = false;
    expect(doTipo(sugerirEstrutura(desligado, 1), 'viga-superior')).toHaveLength(0);
  });

  it('sugerir de novo depois de aceitar tudo não duplica nada', () => {
    const aceito = projetoCom([...plantaEmL(), ...sugestoes.map((e) => ({ ...e, status: 'confirmado' as const }))]);
    expect(sugerirEstrutura(aceito, 1)).toEqual([]);
  });
});

describe('lajes sugeridas', () => {
  // dois retângulos separados por uma parede de 15 cm
  const ambientes = [ambiente('sala', 0, 0, 4, 3), ambiente('quarto', 4.15, 0, 8, 3), ambiente('varanda', 0, 3.15, 4, 5, false)];

  it('por ambiente: uma laje por ambiente coberto', () => {
    const lajes = doTipo(sugerirEstrutura(projetoCom(ambientes), 1), 'laje');
    expect(lajes.map((l) => l.rotulo)).toEqual(['L1', 'L2']);
    expect(lajes.map((l) => l.vinculos.ambienteIds)).toEqual([['sala'], ['quarto']]);
    expect(lajes[0]?.props).toEqual({ tipoLaje: 'trelicada-eps', espessura: 0.12 });
    const area = (l: Elemento) => (l.geometria.tipo === 'poligono' ? areaPoligono(l.geometria.pontos) * ESCALA ** 2 : 0);
    expect(area(lajes[0]!)).toBeCloseTo(12, 6);
    expect(area(lajes[1]!)).toBeCloseTo(11.55, 6);
  });

  it('união: dois retângulos adjacentes viram uma laje (área = soma + faixa da parede)', () => {
    const projeto = projetoCom(ambientes);
    projeto.parametros.estrutura.laje.modo = 'uniao';
    const lajes = doTipo(sugerirEstrutura(projeto, 1), 'laje');
    expect(lajes).toHaveLength(1);
    expect(lajes[0]?.vinculos.ambienteIds).toEqual(['sala', 'quarto']);
    const pontos = lajes[0]!.geometria.tipo === 'poligono' ? lajes[0]!.geometria.pontos : [];
    expect(pontos).toHaveLength(4);
    expect(areaPoligono(pontos) * ESCALA ** 2).toBeCloseTo(12 + 11.55 + 0.15 * 3, 6);
  });

  it('união em L: contorno externo com 6 vértices; ambientes distantes ficam separados', () => {
    const a = [pt(0, 0), pt(4, 0), pt(4, 3), pt(0, 3)];
    const b = [pt(0, 3.15), pt(2, 3.15), pt(2, 6), pt(0, 6)];
    const longe = [pt(10, 0), pt(12, 0), pt(12, 2), pt(10, 2)];
    const [contorno] = uniaoOrtogonal([a, b], u(0.35) / 2);
    expect(contorno).toHaveLength(6);
    expect(areaPoligono(contorno!) * ESCALA ** 2).toBeCloseTo(12 + 2 * 2.85 + 2 * 0.15, 6);

    const lajes = montarLajes(
      [{ id: 'a', pontos: a }, { id: 'b', pontos: b }, { id: 'longe', pontos: longe }],
      'uniao', u(0.35), u(0.01),
    );
    expect(lajes.map((l) => l.ambienteIds).sort()).toEqual([['a', 'b'], ['longe']]);
  });

  it('união com polígono não ortogonal cai no modo por ambiente para o grupo', () => {
    const a = [pt(0, 0), pt(4, 0), pt(4, 3), pt(0, 3)];
    const torto = [pt(4.15, 0), pt(8, 1), pt(8, 3), pt(4.15, 3)];
    const lajes = montarLajes([{ id: 'a', pontos: a }, { id: 'torto', pontos: torto }], 'uniao', u(0.35), u(0.01));
    expect(lajes.map((l) => l.ambienteIds)).toEqual([['a'], ['torto']]);
    expect(lajes[1]?.pontos).toEqual(torto);
  });
});

describe('fundações sugeridas', () => {
  it('sapata e bloco: uma fundação por pilar, vinculada a ele', () => {
    for (const tipo of ['sapata', 'bloco-estaca'] as const) {
      const projeto = projetoCom(plantaEmL());
      projeto.parametros.estrutura.fundacao.tipo = tipo;
      const sug = sugerirEstrutura(projeto, 1);
      const pilares = doTipo(sug, 'pilar');
      const fundacoes = doTipo(sug, 'fundacao');
      expect(fundacoes).toHaveLength(pilares.length);
      for (const f of fundacoes) {
        expect(f.props.tipoFundacao).toBe(tipo);
        const pilar = pilares.find((p) => p.id === f.vinculos.pilarId);
        expect(pilar).toBeDefined();
        expect(pontoDe(f)).toEqual(pontoDe(pilar!));
      }
    }
  });

  it('radier: um único polígono (caixa envolvente das paredes), sem pilar', () => {
    const projeto = projetoCom(plantaEmL());
    projeto.parametros.estrutura.fundacao.tipo = 'radier';
    const fundacoes = doTipo(sugerirEstrutura(projeto, 1), 'fundacao');
    expect(fundacoes).toHaveLength(1);
    const f = fundacoes[0]!;
    expect(f.vinculos.pilarId).toBeUndefined();
    expect(f.geometria.tipo).toBe('poligono');
    expect(areaPoligono(f.geometria.tipo === 'poligono' ? f.geometria.pontos : []) * ESCALA ** 2).toBeCloseTo(72, 6);
  });
});
