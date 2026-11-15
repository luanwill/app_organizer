import { describe, expect, it } from 'vitest';
import { areaPoligono, distancia, paraM2, paraMetros } from '@/core/calc';
import type { ElementoDe } from '@/core/model';
import { detectarParedes, importarDXF, limparTextoDxf } from './dxf';
import type { UnidadeDxf } from './config';

// ---- montagem de DXF mínimo (somente a seção ENTITIES)
const grupos = (...pares: (string | number)[]): string => pares.join('\n');
const dxf = (...entidades: string[]): string => grupos(0, 'SECTION', 2, 'ENTITIES', ...entidades, 0, 'ENDSEC', 0, 'EOF');
const lwpolyline = (pontos: [number, number][], fechada: boolean): string =>
  grupos(0, 'LWPOLYLINE', 8, '0', 90, pontos.length, 70, fechada ? 1 : 0, ...pontos.flatMap(([x, y]) => [10, x, 20, y]));
const linha = (x1: number, y1: number, x2: number, y2: number): string =>
  grupos(0, 'LINE', 8, '0', 10, x1, 20, y1, 11, x2, 21, y2);
const texto = (x: number, y: number, conteudo: string): string => grupos(0, 'TEXT', 8, '0', 10, x, 20, y, 40, 0.2, 1, conteudo);
const circulo = (x: number, y: number, r: number): string => grupos(0, 'CIRCLE', 8, '0', 10, x, 20, y, 40, r);

const opcoes = (unidadeDxf: UnidadeDxf) => ({ pagina: 2, unidadeDxf, larguraPagina: 842, alturaPagina: 595 });
const retangulo = (l: number, a: number): [number, number][] => [[0, 0], [l, 0], [l, a], [0, a]];

describe('importarDXF — ambientes', () => {
  it('polilinha fechada vira ambiente candidato, importado e pendente', () => {
    const r = importarDXF(dxf(lwpolyline(retangulo(4, 3), true)), opcoes('m'));
    expect(r.elementos).toHaveLength(1);
    const amb = r.elementos[0] as ElementoDe<'ambiente'>;
    expect(amb.tipo).toBe('ambiente');
    expect(amb.disciplina).toBe('arquitetura');
    expect(amb.pagina).toBe(2);
    expect(amb.origem).toBe('importado');
    expect(amb.status).toBe('pendente');
    expect(amb.geometria.tipo).toBe('poligono');
    expect(amb.props).toEqual({ nome: 'Ambiente 1', tipoAmbiente: 'outro', areaMolhada: false, coberto: true });
    expect(r.pendencias).toContain('Ambiente 1 sem nome');
  });

  it('polilinha com primeiro = último ponto também é fechada (sem repetir o vértice)', () => {
    const r = importarDXF(dxf(lwpolyline([...retangulo(4, 3), [0, 0]], false)), opcoes('m'));
    expect(r.elementos).toHaveLength(1);
    const g = r.elementos[0]!.geometria;
    expect(g.tipo === 'poligono' && g.pontos.length).toBe(4);
  });

  it('texto dentro do polígono dá nome, rótulo e tipo (com área molhada)', () => {
    const r = importarDXF(
      dxf(
        lwpolyline(retangulo(4, 3), true),
        texto(1, 1, 'Banheiro'),
        lwpolyline([[5, 0], [9, 0], [9, 3], [5, 3]], true),
        texto(6, 2, '12,00 m²'),
        texto(6, 1, 'SALA DE ESTAR'),
        lwpolyline([[10, 0], [12, 0], [12, 3], [10, 3]], true),
        texto(11, 1, 'Depósito'),
      ),
      opcoes('m'),
    );
    const [banheiro, sala, deposito] = r.elementos as ElementoDe<'ambiente'>[];
    expect(banheiro!.props).toMatchObject({ nome: 'Banheiro', tipoAmbiente: 'banheiro', areaMolhada: true });
    expect(banheiro!.rotulo).toBe('Banheiro');
    expect(sala!.props).toMatchObject({ nome: 'SALA DE ESTAR', tipoAmbiente: 'sala', areaMolhada: false });
    expect(deposito!.props).toMatchObject({ nome: 'Depósito', tipoAmbiente: 'outro' });
    expect(r.pendencias.some((p) => p.startsWith('Depósito: tipo de ambiente não reconhecido'))).toBe(true);
    expect(r.pendencias.some((p) => p.includes('sem nome'))).toBe(false);
  });

  it('reconhece os tipos pela tabela de palavras-chave', () => {
    const casos: [string, string, boolean][] = [
      ['WC', 'banheiro', true],
      ['Cozinha', 'cozinha', true],
      ['Área de Serviço', 'area-servico', true],
      ['Dormitório 1', 'quarto', false],
      ['Quarto', 'quarto', false],
      ['Circulação', 'circulacao', false],
      ['Hall', 'circulacao', false],
      ['Varanda', 'varanda', false],
      ['Garagem', 'garagem', false],
    ];
    for (const [nome, tipo, molhada] of casos) {
      const r = importarDXF(dxf(lwpolyline(retangulo(4, 3), true), texto(2, 1, nome)), opcoes('m'));
      expect((r.elementos[0] as ElementoDe<'ambiente'>).props).toMatchObject({ nome, tipoAmbiente: tipo, areaMolhada: molhada });
    }
  });

  it('mapeia o y do DXF (para cima) para o y da página (para baixo), dentro da página', () => {
    const r = importarDXF(dxf(lwpolyline(retangulo(4, 3), true), texto(0.5, 2.5, 'Sala')), opcoes('m'));
    const g = r.elementos[0]!.geometria;
    if (g.tipo !== 'poligono') throw new Error('esperado polígono');
    // (0,0) do DXF (canto inferior esquerdo) fica embaixo; (0,3) fica em cima
    expect(g.pontos[0]!.y).toBeGreaterThan(g.pontos[3]!.y);
    for (const p of g.pontos) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(842);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(595);
    }
  });
});

describe('importarDXF — escala', () => {
  it.each([
    ['m', 1],
    ['cm', 100],
    ['mm', 1000],
  ] as [UnidadeDxf, number][])('retângulo de 4 × 3 m desenhado em %s mede 12 m²', (unidade, fator) => {
    const r = importarDXF(dxf(lwpolyline(retangulo(4 * fator, 3 * fator), true)), opcoes(unidade));
    const g = r.elementos[0]!.geometria;
    if (g.tipo !== 'poligono') throw new Error('esperado polígono');
    expect(paraM2(areaPoligono(g.pontos), r.escala)).toBeCloseTo(12, 6);
    expect(paraMetros(distancia(g.pontos[0]!, g.pontos[1]!), r.escala)).toBeCloseTo(4, 6);
  });

  it('a mesma geometria com unidades diferentes dá escalas diferentes (a unidade nunca é presumida)', () => {
    const arquivo = dxf(lwpolyline(retangulo(400, 300), true));
    expect(importarDXF(arquivo, opcoes('cm')).escala).toBeCloseTo(importarDXF(arquivo, opcoes('mm')).escala * 10, 9);
  });
});

describe('importarDXF — paredes', () => {
  it('duas linhas paralelas a 0,15 m viram 1 parede no eixo com espessura 0,15', () => {
    const r = importarDXF(dxf(linha(0, 0, 4, 0), linha(0, 0.15, 4, 0.15)), opcoes('m'));
    expect(r.elementos).toHaveLength(1);
    const parede = r.elementos[0] as ElementoDe<'parede'>;
    expect(parede.tipo).toBe('parede');
    expect(parede.origem).toBe('importado');
    expect(parede.status).toBe('pendente');
    expect(parede.props.espessura).toBe(0.15);
    const g = parede.geometria;
    if (g.tipo !== 'polilinha') throw new Error('esperada polilinha');
    expect(g.pontos).toHaveLength(2);
    expect(paraMetros(distancia(g.pontos[0]!, g.pontos[1]!), r.escala)).toBeCloseTo(4, 6);
    expect(g.pontos[0]!.y).toBeCloseTo(g.pontos[1]!.y, 9);
  });

  it('funciona em cm e com polilinhas abertas', () => {
    const r = importarDXF(dxf(lwpolyline([[0, 0], [400, 0]], false), lwpolyline([[0, 20], [400, 20]], false)), opcoes('cm'));
    expect(r.elementos).toHaveLength(1);
    expect((r.elementos[0] as ElementoDe<'parede'>).props.espessura).toBe(0.2);
  });

  it('o eixo fica na linha média, só no trecho sobreposto', () => {
    const [p] = detectarParedes(
      [
        [{ x: 0, y: 0 }, { x: 4, y: 0 }],
        [{ x: 6, y: 0.2 }, { x: 1, y: 0.2 }],
      ],
      1,
    );
    expect(p!.espessura).toBe(0.2);
    expect(p!.eixo[0].x).toBeCloseTo(1, 9);
    expect(p!.eixo[1].x).toBeCloseTo(4, 9);
    expect(p!.eixo[0].y).toBeCloseTo(0.1, 9);
    expect(p!.eixo[1].y).toBeCloseTo(0.1, 9);
  });

  it('não gera parede fora da faixa de distância, sem paralelismo ou sem sobreposição', () => {
    const base: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 0, y: 0 }, { x: 4, y: 0 }];
    expect(detectarParedes([base, [{ x: 0, y: 0.02 }, { x: 4, y: 0.02 }]], 1)).toHaveLength(0); // perto demais
    expect(detectarParedes([base, [{ x: 0, y: 0.6 }, { x: 4, y: 0.6 }]], 1)).toHaveLength(0); // longe demais
    expect(detectarParedes([base, [{ x: 0, y: 0.15 }, { x: 4, y: 1 }]], 1)).toHaveLength(0); // não paralelas
    expect(detectarParedes([base, [{ x: 5, y: 0.15 }, { x: 9, y: 0.15 }]], 1)).toHaveLength(0); // sem sobreposição
    expect(detectarParedes([base, [{ x: 0, y: 0.05 }, { x: 4, y: 0.05 }]], 1)).toHaveLength(1); // limite inferior
    expect(detectarParedes([base, [{ x: 0, y: 0.4 }, { x: 4, y: 0.4 }]], 1)).toHaveLength(1); // limite superior
  });

  it('evita duplicatas: três linhas paralelas geram uma parede por trecho, não três', () => {
    const paredes = detectarParedes(
      [
        [{ x: 0, y: 0 }, { x: 4, y: 0 }],
        [{ x: 0, y: 0.15 }, { x: 4, y: 0.15 }],
        [{ x: 0, y: 0.3 }, { x: 4, y: 0.3 }],
      ],
      1,
    );
    expect(paredes).toHaveLength(1);
    expect(paredes[0]!.espessura).toBe(0.15);
  });

  it('uma face longa pode formar paredes com faces diferentes em trechos diferentes', () => {
    const paredes = detectarParedes(
      [
        [{ x: 0, y: 0 }, { x: 10, y: 0 }],
        [{ x: 0, y: 0.15 }, { x: 4, y: 0.15 }],
        [{ x: 5, y: 0.15 }, { x: 10, y: 0.15 }],
      ],
      1,
    );
    expect(paredes).toHaveLength(2);
  });

  it('retângulo de paredes (4 faces externas + 4 internas em LINE) gera 4 paredes', () => {
    const e = 0.15;
    const r = importarDXF(
      dxf(
        linha(0, 0, 5, 0), linha(5, 0, 5, 4), linha(5, 4, 0, 4), linha(0, 4, 0, 0),
        linha(e, e, 5 - e, e), linha(5 - e, e, 5 - e, 4 - e), linha(5 - e, 4 - e, e, 4 - e), linha(e, 4 - e, e, e),
      ),
      opcoes('m'),
    );
    const paredes = r.elementos.filter((el) => el.tipo === 'parede') as ElementoDe<'parede'>[];
    expect(paredes).toHaveLength(4);
    expect(paredes.every((p) => p.props.espessura === 0.15)).toBe(true);
  });
});

describe('importarDXF — pendências e erros', () => {
  it('lista a escala a conferir, o pé-direito e as entidades ignoradas por tipo', () => {
    const r = importarDXF(dxf(lwpolyline(retangulo(4, 3), true), circulo(1, 1, 0.5), circulo(2, 1, 0.5), texto(20, 20, 'N')), opcoes('m'));
    expect(r.pendencias.some((p) => p.includes('unidade do desenho (m)') && p.includes('escala'))).toBe(true);
    expect(r.pendencias.some((p) => p.includes('pé-direito'))).toBe(true);
    expect(r.pendencias).toContain('2 entidades ignoradas: 2 CIRCLE.');
    expect(r.pendencias).toContain('1 texto fora de ambientes foi ignorado.');
  });

  it('ids únicos e tudo importado + pendente', () => {
    const r = importarDXF(
      dxf(lwpolyline(retangulo(4, 3), true), linha(0, -1, 4, -1), linha(0, -1.15, 4, -1.15)),
      opcoes('m'),
    );
    expect(r.elementos).toHaveLength(2);
    expect(new Set(r.elementos.map((e) => e.id)).size).toBe(2);
    expect(r.elementos.every((e) => e.origem === 'importado' && e.status === 'pendente')).toBe(true);
  });

  it('DXF vazio ou sem geometria → erro em pt-BR', () => {
    expect(() => importarDXF(dxf(), opcoes('m'))).toThrow(/DXF/);
    expect(() => importarDXF(dxf(circulo(0, 0, 1)), opcoes('m'))).toThrow(/DXF/);
  });

  it('limpa os códigos de formatação do MTEXT', () => {
    expect(limparTextoDxf('{\\fArial|b0|i0;Sala}\\Pde estar')).toBe('Sala de estar');
  });
});
