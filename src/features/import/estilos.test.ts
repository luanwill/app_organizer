/**
 * Estilos comuns de planta baixa exportada para PDF, em versões sintéticas mínimas:
 * traço duplo (AutoCAD), poché triangulado (SketchUp/Layout), poché em polígono com furos (Revit/ArchiCAD),
 * traço duplo com hachura de linhas dentro da parede, nomes desenhados como curvas (sem texto),
 * janelas/portas de correr (caixilho no vão) e portas de canto (folha desenhada).
 */
import { describe, expect, it } from 'vitest';
import { areaPoligono, paraM2 } from '@/core/calc';
import type { ElementoDe, Ponto } from '@/core/model';
import { bordasDaUniao, corPodeSerParede } from './poche';
import { reconhecerVetores, type EntradaVetores } from './reconhecimento';

const ESCALA = 0.02; // m por unidade da página
const E = 0.15; // espessura das paredes (m)
const POCHE = '#696969';

type Seg = [Ponto, Ponto];
const pt = (x: number, y: number): Ponto => ({ x: x / ESCALA, y: y / ESCALA });
/** Segmento dado em METROS, convertido para unidades da página. */
const seg = (x1: number, y1: number, x2: number, y2: number): Seg => [pt(x1, y1), pt(x2, y2)];
const ret = (x1: number, y1: number, x2: number, y2: number): Seg[] => [
  seg(x1, y1, x2, y1),
  seg(x2, y1, x2, y2),
  seg(x2, y2, x1, y2),
  seg(x1, y2, x1, y1),
];
const texto = (conteudo: string, x: number, y: number) => ({ texto: conteudo, ponto: pt(x, y) });
const opcoes = { pagina: 1, escala: ESCALA };

/** Retângulo de poché dividido em dois triângulos (como o SketchUp/Layout exporta). */
const triangulos = (x1: number, y1: number, x2: number, y2: number): Ponto[][] => [
  [pt(x1, y1), pt(x2, y1), pt(x2, y2)],
  [pt(x1, y1), pt(x2, y2), pt(x1, y2)],
];
/** Paredes de um cômodo retangular (interno x..x+l, y..y+a) como 4 retângulos. */
const retangulosDasParedes = (x: number, y: number, l: number, a: number): [number, number, number, number][] => [
  [x - E, y - E, x + l + E, y],
  [x - E, y + a, x + l + E, y + a + E],
  [x - E, y, x, y + a],
  [x + l, y, x + l + E, y + a],
];

const ambientes = (r: { elementos: unknown[] }) => (r.elementos as ElementoDe<'ambiente'>[]).filter((e) => e.tipo === 'ambiente');
const paredes = (r: { elementos: unknown[] }) => (r.elementos as ElementoDe<'parede'>[]).filter((e) => e.tipo === 'parede');
const areaM2 = (a: ElementoDe<'ambiente'>): number => (a.geometria.tipo === 'poligono' ? paraM2(areaPoligono(a.geometria.pontos), ESCALA) : NaN);
const nomes = (r: { elementos: unknown[] }) => ambientes(r).map((a) => a.props.nome).sort();

describe('poché (paredes preenchidas)', () => {
  it('SketchUp/Layout: retângulos triangulados, sem traço nenhum → 4 paredes + o ambiente pela face interna', () => {
    const contornos = retangulosDasParedes(1, 1, 4, 3).flatMap((r) => triangulos(...r));
    const r = reconhecerVetores(
      { segmentos: [], textos: [texto('Sala', 3, 2.5)], preenchimentos: [{ contornos, cor: POCHE, parImpar: false }] },
      opcoes,
    );
    expect(r.situacao).toBe('ok');
    expect(paredes(r)).toHaveLength(4);
    expect(paredes(r).every((p) => p.props.espessura === 0.15)).toBe(true);
    expect(nomes(r)).toEqual(['Sala']);
    expect(areaM2(ambientes(r)[0]!)).toBeCloseTo(12, 6);
    expect(r.pendencias).toContain(`Paredes lidas por áreas preenchidas (poché, cor ${POCHE}).`);
    expect(r.elementos.every((e) => e.origem === 'importado' && e.status === 'pendente')).toBe(true);
  });

  it('Revit/ArchiCAD: um polígono só, com os cômodos como furos (par-ímpar) → 2 ambientes e 5 paredes', () => {
    const externo = [pt(1 - E, 1 - E), pt(9.15 + E, 1 - E), pt(9.15 + E, 4 + E), pt(1 - E, 4 + E)];
    const furoA = [pt(1, 1), pt(5, 1), pt(5, 4), pt(1, 4)];
    const furoB = [pt(5 + E, 1), pt(9.15, 1), pt(9.15, 4), pt(5 + E, 4)];
    const r = reconhecerVetores(
      {
        segmentos: [],
        textos: [texto('Quarto', 3, 2.5), texto('Banheiro', 7, 2.5)],
        preenchimentos: [{ contornos: [externo, furoA, furoB], cor: POCHE, parImpar: true }],
      },
      opcoes,
    );
    expect(paredes(r)).toHaveLength(5);
    const porNome = Object.fromEntries(ambientes(r).map((a) => [a.props.nome, areaM2(a)]));
    expect(porNome.Quarto).toBeCloseTo(12, 6);
    expect(porNome.Banheiro).toBeCloseTo(12, 6);
  });

  it('paredes empilhadas em faixas da mesma cor (0,10 + 0,05) viram uma parede de 0,15', () => {
    const rets = retangulosDasParedes(1, 1, 4, 3);
    // a parede de cima em duas faixas
    rets[0] = [1 - E, 1 - E, 5 + E, 1 - 0.05];
    rets.push([1 - E, 1 - 0.05, 5 + E, 1]);
    const contornos = rets.flatMap((r) => triangulos(...r));
    const r = reconhecerVetores(
      { segmentos: [], textos: [texto('Sala', 3, 2.5)], preenchimentos: [{ contornos, cor: POCHE, parImpar: false }] },
      opcoes,
    );
    expect(paredes(r)).toHaveLength(4);
    expect(paredes(r).every((p) => p.props.espessura === 0.15)).toBe(true);
    expect(areaM2(ambientes(r)[0]!)).toBeCloseTo(12, 6);
  });

  it('ruído preenchido (piso claro, vegetação, mobiliário fino) não vira parede', () => {
    const paredesDaSala = retangulosDasParedes(1, 1, 4, 3).flatMap((r) => triangulos(...r));
    const piso: Ponto[][] = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) piso.push([pt(1 + i, 1 + j), pt(2 + i, 1 + j), pt(2 + i, 2 + j), pt(1 + i, 2 + j)]);
    const folhas: Ponto[][] = [];
    for (let k = 0; k < 30; k++) {
      const cx = 7 + (k % 6) * 0.5;
      const cy = 1 + Math.floor(k / 6) * 0.5;
      folhas.push(Array.from({ length: 7 }, (_, i) => pt(cx + 0.2 * Math.cos((i * 2 * Math.PI) / 7), cy + 0.2 * Math.sin((i * 2 * Math.PI) / 7))));
    }
    const bancada = triangulos(1.2, 1.2, 3, 1.25); // 5 cm: fina demais para parede
    const r = reconhecerVetores(
      {
        segmentos: [],
        textos: [texto('Sala', 3, 2.5)],
        preenchimentos: [
          { contornos: paredesDaSala, cor: POCHE, parImpar: false },
          { contornos: piso, cor: '#f6f6f6', parImpar: false },
          { contornos: folhas, cor: '#a8c0a8', parImpar: false },
          { contornos: bancada, cor: '#3a3a3a', parImpar: false },
        ],
      },
      opcoes,
    );
    expect(paredes(r)).toHaveLength(4);
    expect(nomes(r)).toEqual(['Sala']);
    expect(areaM2(ambientes(r)[0]!)).toBeCloseTo(12, 6);
  });

  it('bordas internas (lado comum de dois triângulos) se cancelam', () => {
    const bordas = bordasDaUniao(triangulos(0, 0, 4, 0.15));
    expect(bordas).toHaveLength(4);
  });

  it('só cores com cara de poché são analisadas (fundo e piso claros ficam de fora)', () => {
    expect(corPodeSerParede('#000000')).toBe(true);
    expect(corPodeSerParede('#696969')).toBe(true);
    expect(corPodeSerParede('#ff0000')).toBe(true); // parede a demolir/construir em vermelho
    expect(corPodeSerParede('#ffffff')).toBe(false);
    expect(corPodeSerParede('#f6f6f6')).toBe(false);
    expect(corPodeSerParede(null)).toBe(false);
  });
});

describe('traço duplo com hachura de linhas dentro da parede', () => {
  it('as linhas da hachura não viram paredes nem atrapalham o ambiente', () => {
    const faces: Seg[] = [...ret(1, 1, 5, 4), ...ret(1 - E, 1 - E, 5 + E, 4 + E)];
    const hachura: Seg[] = [];
    // diagonais a 45° dentro das paredes de cima e de baixo, a cada 10 cm
    for (let x = 1; x < 5; x += 0.1) {
      hachura.push(seg(x, 1, x + E, 1 - E));
      hachura.push(seg(x, 4 + E, x + E, 4));
    }
    // e dentro das laterais
    for (let y = 1; y < 4; y += 0.1) {
      hachura.push(seg(1 - E, y, 1, y + E));
      hachura.push(seg(5, y, 5 + E, y + E));
    }
    const r = reconhecerVetores({ segmentos: [...faces, ...hachura], textos: [texto('Quarto', 3, 2.5)] }, opcoes);
    expect(paredes(r)).toHaveLength(4);
    expect(paredes(r).every((p) => p.props.espessura === 0.15)).toBe(true);
    expect(areaM2(ambientes(r)[0]!)).toBeCloseTo(12, 6);
  });
});

describe('nomes desenhados como curvas (sem texto na página)', () => {
  it('fica o conjunto de paredes com mais ambientes fechados, com pendência', () => {
    const planta: Seg[] = [...ret(1 - E, 1 - E, 9.15 + E, 4 + E), ...ret(1, 1, 5, 4), ...ret(5 + E, 1, 9.15, 4)];
    const corte: Seg[] = [...ret(20, 1, 26, 3.8), ...ret(20 - E, 1 - E, 26 + E, 3.8 + E)];
    const r = reconhecerVetores({ segmentos: [...planta, ...corte], textos: [] }, opcoes);
    expect(ambientes(r)).toHaveLength(2);
    expect(paredes(r)).toHaveLength(5);
    expect(r.pendencias.some((p) => p.startsWith('Nenhum nome de cômodo foi reconhecido nos textos (nomes desenhados como curvas?)'))).toBe(true);
    expect(r.pendencias.some((p) => p.includes('4 trechos com cara de parede foram descartados'))).toBe(true);
  });
});

describe('vãos grandes: só fecham com esquadria desenhada', () => {
  /** Sala 5 × 4 com a parede da direita interrompida entre y = 2 e y = 4 (vão de 2 m). */
  const comVao = (extras: Seg[]): EntradaVetores => ({
    segmentos: [
      ...ret(1, 1, 6, 5).filter((_, i) => i !== 1), // face interna sem o lado direito
      ...ret(1 - E, 1 - E, 6 + E, 5 + E).filter((_, i) => i !== 1),
      seg(6, 1, 6, 2), seg(6 + E, 1 - E, 6 + E, 2), seg(6, 2, 6 + E, 2), // trecho de cima
      seg(6, 4, 6, 5), seg(6 + E, 4, 6 + E, 5 + E), seg(6, 4, 6 + E, 4), // trecho de baixo
      ...extras,
    ],
    textos: [texto('Sala', 3.5, 3)],
  });

  it('janela (caixilho e vidro dentro da faixa da parede) → a parede fecha e a sala sai', () => {
    const r = reconhecerVetores(comVao([seg(6.05, 2, 6.05, 4), seg(6.1, 2, 6.1, 4)]), opcoes);
    expect(nomes(r)).toEqual(['Sala']);
    expect(areaM2(ambientes(r)[0]!)).toBeCloseTo(20, 6);
  });

  it('janela de correr (folhas que cobrem só parte do vão, em linhas diferentes) também fecha', () => {
    const r = reconhecerVetores(comVao([seg(6.06, 2, 6.06, 3.1), seg(6.09, 2.9, 6.09, 4)]), opcoes);
    expect(nomes(r)).toEqual(['Sala']);
  });

  it('passagem livre (nada desenhado no vão) → não inventa parede: sem ambiente e com pendência', () => {
    const r = reconhecerVetores(comVao([]), opcoes);
    expect(ambientes(r)).toEqual([]);
    expect(r.pendencias.some((p) => p.startsWith('"Sala": o nome está na planta, mas as paredes em volta não fecham'))).toBe(true);
  });

  it('uma linha só no vão (junta de piso) não basta', () => {
    const r = reconhecerVetores(comVao([seg(6.075, 1.5, 6.075, 4.5)]), opcoes);
    expect(ambientes(r)).toEqual([]);
  });
});

describe('porta de canto: a ponta da parede só vai até a parede da frente com porta desenhada', () => {
  /** Quarto 4 × 3 cuja parede da direita para em y = 3,1, deixando 0,9 m livres junto à parede de baixo. */
  const comAbertura = (extras: Seg[]): EntradaVetores => ({
    segmentos: [
      seg(1, 1, 5, 1), seg(1 - E, 1 - E, 5 + E, 1 - E), // cima
      seg(1, 1, 1, 4), seg(1 - E, 1 - E, 1 - E, 4 + E), // esquerda
      seg(1, 4, 5 + E, 4), seg(1 - E, 4 + E, 5 + E, 4 + E), // baixo (passa sob a abertura)
      seg(5, 1, 5, 3.1), seg(5 + E, 1 - E, 5 + E, 3.1), seg(5, 3.1, 5 + E, 3.1), // direita, até a abertura
      ...extras,
    ],
    textos: [texto('Quarto', 3, 2.5)],
  });

  it('com a folha aberta (retângulo fino perpendicular ao vão, no batente) → fecha', () => {
    const folha = [seg(5, 3.12, 4.15, 3.12), seg(5, 3.16, 4.15, 3.16)];
    const r = reconhecerVetores(comAbertura(folha), opcoes);
    expect(nomes(r)).toEqual(['Quarto']);
    expect(areaM2(ambientes(r)[0]!)).toBeCloseTo(12, 6);
  });

  it('sem nada desenhado (corredor aberto) → fica aberto e sai a pendência', () => {
    const r = reconhecerVetores(comAbertura([]), opcoes);
    expect(ambientes(r)).toEqual([]);
    expect(r.pendencias.some((p) => p.startsWith('"Quarto": o nome está na planta'))).toBe(true);
  });

  it('juntas do piso junto à parede (traço solto, sem o par da folha) não contam como porta', () => {
    const juntas = [seg(5, 3.12, 4.2, 3.12), seg(5, 3.83, 4.2, 3.83)]; // 0,71 m de distância: não é folha
    const r = reconhecerVetores(comAbertura(juntas), opcoes);
    expect(ambientes(r)).toEqual([]);
  });

  it('o giro da porta (arco) também serve de evidência', () => {
    const arcos: [Ponto, Ponto][] = [[pt(5.075, 3.1), pt(4.2, 4)]];
    const r = reconhecerVetores({ ...comAbertura([]), arcos }, opcoes);
    expect(nomes(r)).toEqual(['Quarto']);
  });
});

describe('escolha automática do método', () => {
  it('com traço duplo e poché na mesma página, fica o que fecha mais cômodos com nome', () => {
    // planta em traço duplo; um "desenho" preenchido escuro sem cômodos (cobertura hachurada) ao lado
    const planta: Seg[] = [...ret(1, 1, 5, 4), ...ret(1 - E, 1 - E, 5 + E, 4 + E)];
    const cobertura = triangulos(20, 1, 30, 1.2);
    const r = reconhecerVetores(
      {
        segmentos: planta,
        textos: [texto('Sala', 3, 2.5)],
        preenchimentos: [{ contornos: cobertura, cor: '#000000', parImpar: false }],
      },
      opcoes,
    );
    expect(nomes(r)).toEqual(['Sala']);
    expect(r.pendencias).toContain('Paredes lidas por pares de linhas paralelas (traço duplo).');
  });
});
