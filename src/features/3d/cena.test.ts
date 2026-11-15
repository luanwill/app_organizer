import { describe, expect, it } from 'vitest';
import { projetoVazio } from '@/core/model';
import type { Elemento, Projeto, TipoEsquadria } from '@/core/model';
import { montarCena, volumeDoSolido, type Solido, type SolidoCaixa } from './cena';

const ESCALA = 0.01; // 1 unidade da página = 1 cm
const PE_DIREITO = 2.8;
const ESPESSURA = 0.15;

const PORTA: TipoEsquadria = { id: 'tp', codigo: 'P1', categoria: 'porta', largura: 0.8, altura: 2.1, peitoril: 0, quantidade: 1 };
const JANELA: TipoEsquadria = { id: 'tj', codigo: 'J1', categoria: 'janela', largura: 1.2, altura: 1, peitoril: 1.1, quantidade: 1 };

const base = { pagina: 1, vinculos: {}, origem: 'desenhado', status: 'confirmado' } as const;

/** Parede de 4 m ao longo de x (400 unidades), no y = 100. */
const parede = (extra: Partial<Elemento> = {}): Elemento =>
  ({
    ...base, id: 'par', tipo: 'parede', disciplina: 'arquitetura',
    geometria: { tipo: 'polilinha', pontos: [{ x: 100, y: 100 }, { x: 500, y: 100 }] },
    props: { espessura: ESPESSURA },
    ...extra,
  }) as Elemento;

const esquadria = (id: string, x: number, tipoEsquadriaId: string): Elemento => ({
  ...base, id, tipo: 'esquadria', disciplina: 'arquitetura',
  geometria: { tipo: 'ponto', ponto: { x, y: 100 } },
  vinculos: { paredeId: 'par' },
  props: { tipoEsquadriaId },
});

function projeto(elementos: Elemento[], peDireito: number | null = PE_DIREITO): Projeto {
  const p = projetoVazio('p', '2026-01-01T00:00:00.000Z');
  p.paginas = { 1: { escala: ESCALA, largura: 842, altura: 595 }, 2: { escala: null } };
  p.parametros.gerais.peDireito = peDireito;
  p.esquadrias = [PORTA, JANELA];
  p.elementos = elementos;
  return p;
}

const volume = (solidos: Solido[]): number => solidos.reduce((s, x) => s + volumeDoSolido(x), 0);
const partes = (solidos: Solido[]): string[] => solidos.map((s) => (s.forma === 'caixa' ? (s.parte ?? '') : '')).sort();
const caixas = (solidos: Solido[]): SolidoCaixa[] => solidos.filter((s): s is SolidoCaixa => s.forma === 'caixa');

describe('montarCena — paredes e vãos', () => {
  it('parede sem vãos: uma caixa comprimento × pé-direito × espessura, em metros', () => {
    const { solidos, alertas } = montarCena(projeto([parede()]), 1);
    expect(alertas).toEqual([]);
    expect(solidos).toHaveLength(1);
    const c = caixas(solidos)[0]!;
    expect(c).toMatchObject({ elementoId: 'par', disciplina: 'arquitetura', status: 'confirmado', parte: 'pano' });
    expect(c.comprimento).toBeCloseTo(4, 9);
    expect(c.altura).toBeCloseTo(PE_DIREITO, 9);
    expect(c.largura).toBeCloseTo(ESPESSURA, 9);
    // origem no canto da caixa envolvente; Y para cima
    expect(c.centro.x).toBeCloseTo(2, 9);
    expect(c.centro.y).toBeCloseTo(PE_DIREITO / 2, 9);
    expect(c.centro.z).toBeCloseTo(0, 9);
    expect(c.rotacaoY).toBeCloseTo(0, 9);
  });

  it('porta 0,80 × 2,10: pano esquerdo + pano direito + verga, com o volume descontado', () => {
    const { solidos } = montarCena(projeto([parede(), esquadria('e1', 250, 'tp')]), 1);
    expect(partes(solidos)).toEqual(['pano', 'pano', 'verga']);
    expect(volume(solidos)).toBeCloseTo((4 * PE_DIREITO - 0.8 * 2.1) * ESPESSURA, 9);

    const [esquerdo, direito] = caixas(solidos).filter((s) => s.parte === 'pano').sort((a, b) => a.centro.x - b.centro.x);
    // porta centrada a 1,5 m do início: vão de 1,1 a 1,9 m
    expect(esquerdo!.comprimento).toBeCloseTo(1.1, 9);
    expect(direito!.comprimento).toBeCloseTo(2.1, 9);
    const verga = caixas(solidos).find((s) => s.parte === 'verga')!;
    expect(verga.comprimento).toBeCloseTo(0.8, 9);
    expect(verga.altura).toBeCloseTo(PE_DIREITO - 2.1, 9);
    expect(verga.centro.y).toBeCloseTo((2.1 + PE_DIREITO) / 2, 9);
    expect(verga.centro.x).toBeCloseTo(1.5, 9);
    expect(solidos.every((s) => s.elementoId === 'par')).toBe(true);
  });

  it('janela gera também o peitoril', () => {
    const { solidos } = montarCena(projeto([parede(), esquadria('e1', 300, 'tj')]), 1);
    expect(partes(solidos)).toEqual(['pano', 'pano', 'peitoril', 'verga']);
    expect(volume(solidos)).toBeCloseTo((4 * PE_DIREITO - 1.2 * 1) * ESPESSURA, 9);
    const peitoril = caixas(solidos).find((s) => s.parte === 'peitoril')!;
    expect(peitoril.altura).toBeCloseTo(1.1, 9);
    expect(peitoril.centro.y).toBeCloseTo(0.55, 9);
  });

  it('porta e janela na mesma parede', () => {
    const { solidos } = montarCena(projeto([parede(), esquadria('e1', 180, 'tp'), esquadria('e2', 400, 'tj')]), 1);
    expect(partes(solidos)).toEqual(['pano', 'pano', 'pano', 'peitoril', 'verga', 'verga']);
    expect(volume(solidos)).toBeCloseTo((4 * PE_DIREITO - 0.8 * 2.1 - 1.2 * 1) * ESPESSURA, 9);
  });

  it('mudar o pé-direito muda as alturas; altura própria da parede prevalece', () => {
    const p = projeto([parede(), esquadria('e1', 250, 'tp')], 3);
    expect(volume(montarCena(p, 1).solidos)).toBeCloseTo((4 * 3 - 0.8 * 2.1) * ESPESSURA, 9);
    const propria = projeto([parede({ props: { espessura: ESPESSURA, altura: 1.2 } } as Partial<Elemento>)], 3);
    expect(caixas(montarCena(propria, 1).solidos)[0]!.altura).toBeCloseTo(1.2, 9);
  });

  it('pé-direito null → alerta e sem paredes (nada é assumido)', () => {
    const { solidos, alertas } = montarCena(projeto([parede()], null), 1);
    expect(solidos).toEqual([]);
    expect(alertas).toEqual(['Pé-direito não informado — paredes e pilares não foram extrudados']);
  });

  it('espessura null → alerta e sem a parede', () => {
    const { solidos, alertas } = montarCena(projeto([parede({ props: { espessura: null } } as Partial<Elemento>)]), 1);
    expect(solidos).toEqual([]);
    expect(alertas.some((a) => a.includes('espessura'))).toBe(true);
  });

  it('parede inclinada: a caixa gira em torno de Y e mantém o volume', () => {
    const inclinada = parede({ geometria: { tipo: 'polilinha', pontos: [{ x: 0, y: 0 }, { x: 300, y: 400 }] } });
    const c = caixas(montarCena(projeto([inclinada]), 1).solidos)[0]!;
    expect(c.comprimento).toBeCloseTo(5, 9);
    expect(c.rotacaoY).toBeCloseTo(-Math.atan2(4, 3), 9);
    expect(c.centro.x).toBeCloseTo(1.5, 9);
    expect(c.centro.z).toBeCloseTo(2, 9);
  });
});

describe('montarCena — estrutura', () => {
  const pilar: Elemento = {
    ...base, id: 'pil', tipo: 'pilar', disciplina: 'estrutura', status: 'pendente',
    geometria: { tipo: 'ponto', ponto: { x: 100, y: 100 } },
    props: { secaoB: 0.14, secaoH: 0.3 },
  };

  it('pilar: secaoB × secaoH × (pé-direito + viga superior), da base para cima', () => {
    const { solidos } = montarCena(projeto([pilar]), 1);
    const c = caixas(solidos)[0]!;
    expect(c).toMatchObject({ elementoId: 'pil', disciplina: 'estrutura', status: 'pendente' });
    expect(c.comprimento).toBeCloseTo(0.14, 9);
    expect(c.largura).toBeCloseTo(0.3, 9);
    expect(c.altura).toBeCloseTo(PE_DIREITO + 0.3, 9); // viga superior ativa, h = 0,30 (padrão)
    expect(c.centro.y).toBeCloseTo((PE_DIREITO + 0.3) / 2, 9);
  });

  it('pilar: sem viga superior, com outro pé-direito e com altura própria', () => {
    const semViga = projeto([pilar]);
    semViga.parametros.estrutura.vigaSuperior.ativa = false;
    expect(caixas(montarCena(semViga, 1).solidos)[0]!.altura).toBeCloseTo(PE_DIREITO, 9);
    expect(caixas(montarCena(projeto([pilar], 3.2), 1).solidos)[0]!.altura).toBeCloseTo(3.5, 9);
    const proprio = { ...pilar, props: { ...pilar.props, altura: 4 } } as Elemento;
    expect(caixas(montarCena(projeto([proprio], null), 1).solidos)[0]!.altura).toBeCloseTo(4, 9);
  });

  it('pilar sem pé-direito → alerta e sem sólido', () => {
    const { solidos, alertas } = montarCena(projeto([pilar], null), 1);
    expect(solidos).toEqual([]);
    expect(alertas).toHaveLength(1);
  });

  it('baldrame com o topo no nível 0; viga superior com a base no pé-direito; laje sobre as vigas', () => {
    const viga = (id: string, tipo: 'viga-baldrame' | 'viga-superior'): Elemento => ({
      ...base, id, tipo, disciplina: 'estrutura',
      geometria: { tipo: 'polilinha', pontos: [{ x: 0, y: 0 }, { x: 400, y: 0 }] },
      props: { secaoB: 0.14, secaoH: 0.3 },
    });
    const laje: Elemento = {
      ...base, id: 'laj', tipo: 'laje', disciplina: 'estrutura',
      geometria: { tipo: 'poligono', pontos: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] },
      props: { tipoLaje: 'macica', espessura: 0.12 },
    };
    const { solidos } = montarCena(projeto([viga('vb', 'viga-baldrame'), viga('vs', 'viga-superior'), laje]), 1);
    const vb = caixas(solidos).find((s) => s.elementoId === 'vb')!;
    expect(vb.centro.y + vb.altura / 2).toBeCloseTo(0, 9);
    expect(vb.altura).toBeCloseTo(0.3, 9);
    expect(vb.comprimento).toBeCloseTo(4, 9);
    const vs = caixas(solidos).find((s) => s.elementoId === 'vs')!;
    expect(vs.centro.y - vs.altura / 2).toBeCloseTo(PE_DIREITO, 9);
    const l = solidos.find((s) => s.elementoId === 'laj')!;
    if (l.forma !== 'prisma') throw new Error('esperado prisma');
    expect(l.base).toBeCloseTo(PE_DIREITO + 0.3, 9);
    expect(volumeDoSolido(l)).toBeCloseTo(4 * 3 * 0.12, 9);
  });

  it('sapata abaixo do baldrame, com as dimensões dos parâmetros; radier como prisma', () => {
    const sapata: Elemento = {
      ...base, id: 'sap', tipo: 'fundacao', disciplina: 'estrutura',
      geometria: { tipo: 'ponto', ponto: { x: 0, y: 0 } },
      props: { tipoFundacao: 'sapata' },
    };
    const radier: Elemento = {
      ...base, id: 'rad', tipo: 'fundacao', disciplina: 'estrutura',
      geometria: { tipo: 'poligono', pontos: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] },
      props: { tipoFundacao: 'radier' },
    };
    const { solidos, alertas } = montarCena(projeto([sapata, radier], null), 1);
    expect(alertas).toEqual([]); // fundações não dependem do pé-direito
    const s = caixas(solidos).find((x) => x.elementoId === 'sap')!;
    expect([s.comprimento, s.largura, s.altura]).toEqual([0.8, 0.8, 0.3]);
    expect(s.centro.y + s.altura / 2).toBeCloseTo(-0.3, 9); // topo = fundo do baldrame (h = 0,30)
    const r = solidos.find((x) => x.elementoId === 'rad')!;
    expect(volumeDoSolido(r)).toBeCloseTo(12 * 0.12, 9);
  });
});

describe('montarCena — marcadores', () => {
  const ponto = (id: string, x: number, extra: object): Elemento =>
    ({ ...base, id, geometria: { tipo: 'ponto', ponto: { x, y: 200 } }, ...extra }) as Elemento;
  const eletrico = (id: string, altura: string): Elemento =>
    ponto(id, 100, { tipo: 'ponto-eletrico', disciplina: 'eletrica', props: { tipoPonto: 'tug', potenciaVA: 100, altura } });
  const hidraulico = (id: string, aparelho: string): Elemento =>
    ponto(id, 300, {
      tipo: 'ponto-hidraulico', disciplina: 'hidraulica',
      props: { aparelho, aguaFria: true, aguaQuente: false, esgoto: true },
    });

  it('pontos elétricos e hidráulicos ficam na altura do ponto', () => {
    const p = projeto([eletrico('baixa', 'baixa'), eletrico('alta', 'alta'), eletrico('teto', 'teto'), hidraulico('chuveiro', 'chuveiro'), hidraulico('vaso', 'vaso')]);
    const { marcadores, solidos } = montarCena(p, 1);
    expect(solidos).toEqual([]);
    const y = Object.fromEntries(marcadores.map((m) => [m.elementoId, m.posicao.y]));
    expect(y).toEqual({ baixa: 0.3, alta: 2.2, teto: PE_DIREITO, chuveiro: 2.1, vaso: 0.2 });
    const chuveiro = marcadores.find((m) => m.elementoId === 'chuveiro')!;
    expect(chuveiro).toMatchObject({ disciplina: 'hidraulica', status: 'confirmado' });
    expect(chuveiro.posicao.x).toBeCloseTo(2, 9); // 200 unidades à direita do ponto mais à esquerda
    expect(chuveiro.posicao.z).toBeCloseTo(0, 9);
  });

  it('ponto de teto usa o pé-direito do ambiente vinculado; sem pé-direito → alerta', () => {
    const ambiente: Elemento = {
      ...base, id: 'amb', tipo: 'ambiente', disciplina: 'arquitetura',
      geometria: { tipo: 'poligono', pontos: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] },
      props: { nome: 'Sala', tipoAmbiente: 'sala', areaMolhada: false, coberto: true, peDireito: 3.5 },
    };
    const luz = { ...eletrico('luz', 'teto'), vinculos: { ambienteId: 'amb' } } as Elemento;
    expect(montarCena(projeto([ambiente, luz]), 1).marcadores[0]!.posicao.y).toBe(3.5);

    const semPe = montarCena(projeto([eletrico('teto', 'teto'), eletrico('baixa', 'baixa')], null), 1);
    expect(semPe.marcadores.map((m) => m.elementoId)).toEqual(['baixa']);
    expect(semPe.alertas).toHaveLength(1);
  });

  it('quadro, reservatório e caixa de inspeção viram marcadores', () => {
    const p = projeto([
      ponto('q', 0, { tipo: 'quadro', disciplina: 'eletrica', props: {} }),
      ponto('r', 100, { tipo: 'reservatorio', disciplina: 'hidraulica', props: {} }),
      ponto('c', 200, { tipo: 'caixa-inspecao', disciplina: 'hidraulica', props: {} }),
    ]);
    const y = Object.fromEntries(montarCena(p, 1).marcadores.map((m) => [m.elementoId, m.posicao.y]));
    expect(y).toEqual({ q: 1.1, r: PE_DIREITO, c: 0 });
  });
});

describe('montarCena — página e escala', () => {
  it('considera só os elementos da página informada', () => {
    const outra = { ...parede(), id: 'outra', pagina: 3 } as Elemento;
    const p = projeto([parede(), outra]);
    expect(montarCena(p, 1).solidos.map((s) => s.elementoId)).toEqual(['par']);
    expect(montarCena(p, 5)).toEqual({ solidos: [], marcadores: [], alertas: [] });
  });

  it('página sem escala → alerta e cena vazia', () => {
    const naPagina2 = { ...parede(), pagina: 2 } as Elemento;
    const { solidos, marcadores, alertas } = montarCena(projeto([naPagina2]), 2);
    expect(solidos).toEqual([]);
    expect(marcadores).toEqual([]);
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toContain('sem escala');
  });
});
