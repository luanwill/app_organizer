import { describe, expect, it } from 'vitest';
import { areaPoligono, comprimentoPolilinha, paraM2, paraMetros } from '@/core/calc';
import type { ElementoDe, Ponto } from '@/core/model';
import { RECONHECIMENTO_PDF } from './config';
import {
  ehDoReconhecimentoPdf,
  MENSAGEM_NAO_VETORIAL,
  MENSAGEM_SEM_ESCALA,
  reconhecerVetores,
  recuarParaFaceInterna,
  type EntradaVetores,
} from './reconhecimento';

const ESCALA = 0.02; // m por unidade da página
const E = 0.15; // espessura das paredes (m)

type Seg = [Ponto, Ponto];
/** Segmento dado em METROS, convertido para unidades da página. */
const seg = (x1: number, y1: number, x2: number, y2: number): Seg => [
  { x: x1 / ESCALA, y: y1 / ESCALA },
  { x: x2 / ESCALA, y: y2 / ESCALA },
];
const ret = (x1: number, y1: number, x2: number, y2: number): Seg[] => [
  seg(x1, y1, x2, y1),
  seg(x2, y1, x2, y2),
  seg(x2, y2, x1, y2),
  seg(x1, y2, x1, y1),
];
const texto = (conteudo: string, x: number, y: number) => ({ texto: conteudo, ponto: { x: x / ESCALA, y: y / ESCALA } });

/** Cômodo de paredes duplas: face interna (x, y, largura, altura) e face externa a E de distância. */
const comodo = (x: number, y: number, l: number, a: number): Seg[] => [...ret(x, y, x + l, y + a), ...ret(x - E, y - E, x + l + E, y + a + E)];

const opcoes = { pagina: 2, escala: ESCALA };
const ambientes = (r: { elementos: unknown[] }) => (r.elementos as ElementoDe<'ambiente'>[]).filter((e) => e.tipo === 'ambiente');
const paredes = (r: { elementos: unknown[] }) => (r.elementos as ElementoDe<'parede'>[]).filter((e) => e.tipo === 'parede');
const areaM2 = (a: ElementoDe<'ambiente'>): number => (a.geometria.tipo === 'poligono' ? paraM2(areaPoligono(a.geometria.pontos), ESCALA) : NaN);

describe('reconhecerVetores — um cômodo', () => {
  const entrada: EntradaVetores = { segmentos: comodo(1, 1, 4, 3), textos: [texto('Sala', 3, 2.4), texto('12,00 m²', 3, 2.7)] };
  const r = reconhecerVetores(entrada, opcoes);

  it('retângulo de paredes duplas com o texto "Sala" → 4 paredes + 1 ambiente tipo sala', () => {
    expect(r.situacao).toBe('ok');
    expect(paredes(r)).toHaveLength(4);
    expect(paredes(r).every((p) => p.props.espessura === 0.15)).toBe(true);
    const [sala, ...outros] = ambientes(r);
    expect(outros).toEqual([]);
    expect(sala!.props).toEqual({ nome: 'Sala', tipoAmbiente: 'sala', areaMolhada: false, coberto: true });
    expect(sala!.rotulo).toBe('Sala');
  });

  it('a área do ambiente é a interna (face das paredes), na escala da página', () => {
    expect(areaM2(ambientes(r)[0]!)).toBeCloseTo(12, 6);
    expect(r.pendencias.some((p) => p.includes('difere da escrita'))).toBe(false);
  });

  it('as paredes ficam no eixo e se encontram nos cantos', () => {
    const comprimentos = paredes(r)
      .map((p) => (p.geometria.tipo === 'polilinha' ? paraMetros(comprimentoPolilinha(p.geometria.pontos), ESCALA) : NaN))
      .sort((a, b) => a - b);
    // eixo a eixo: 3 + E e 4 + E
    expect(comprimentos[0]).toBeCloseTo(3.15, 6);
    expect(comprimentos[1]).toBeCloseTo(3.15, 6);
    expect(comprimentos[2]).toBeCloseTo(4.15, 6);
    expect(comprimentos[3]).toBeCloseTo(4.15, 6);
  });

  it('tudo importado + pendente, na página pedida, com ids do reconhecimento', () => {
    expect(r.elementos.every((e) => e.origem === 'importado' && e.status === 'pendente' && e.pagina === 2)).toBe(true);
    expect(r.elementos.every((e) => e.id.startsWith(RECONHECIMENTO_PDF.prefixoId) && ehDoReconhecimentoPdf(e))).toBe(true);
    expect(new Set(r.elementos.map((e) => e.id)).size).toBe(r.elementos.length);
    expect(ehDoReconhecimentoPdf({ id: 'abc', origem: 'importado' })).toBe(false);
    expect(ehDoReconhecimentoPdf({ id: `${RECONHECIMENTO_PDF.prefixoId}x`, origem: 'desenhado' })).toBe(false);
  });

  it('área escrita na planta diferente da reconhecida → pendência', () => {
    const outra = reconhecerVetores({ ...entrada, textos: [texto('Sala', 3, 2.4), texto('20.00 m²', 3, 2.7)] }, opcoes);
    expect(outra.pendencias.some((p) => p.startsWith('Sala: a área reconhecida (12,00 m²) difere da escrita na planta (20,00 m²)'))).toBe(true);
  });

  it('nome quebrado em vários textos é reunido ("QUARTO" + "01"); cotas não entram no nome', () => {
    const q = reconhecerVetores(
      { segmentos: entrada.segmentos, textos: [texto('01', 3, 2.5), texto('QUARTO', 3, 2.3), texto('2.95', 3, 1.2), texto('12.00 m²', 3, 2.7)] },
      opcoes,
    );
    expect(ambientes(q)[0]!.props).toMatchObject({ nome: 'QUARTO 01', tipoAmbiente: 'quarto' });
  });
});

describe('reconhecerVetores — vários cômodos e vãos', () => {
  // A (4 × 3) e B (3 × 3) lado a lado, com a parede comum entre x = 5 e x = 5,15
  const doisComodos: Seg[] = [...ret(1 - E, 1 - E, 8.15 + E, 4 + E), ...ret(1, 1, 5, 4), ...ret(5 + E, 1, 8.15, 4)];

  it('dois cômodos com parede comum → 2 ambientes e 5 paredes', () => {
    const r = reconhecerVetores({ segmentos: doisComodos, textos: [texto('Quarto', 3, 2.5), texto('Banheiro', 6.5, 2.5)] }, opcoes);
    const [a, b] = ambientes(r).sort((p, q) => areaM2(q) - areaM2(p));
    expect(ambientes(r)).toHaveLength(2);
    expect(a!.props).toMatchObject({ nome: 'Quarto', tipoAmbiente: 'quarto', areaMolhada: false });
    expect(b!.props).toMatchObject({ nome: 'Banheiro', tipoAmbiente: 'banheiro', areaMolhada: true });
    expect(areaM2(a!)).toBeCloseTo(12, 6);
    expect(areaM2(b!)).toBeCloseTo(9, 6);
    expect(paredes(r)).toHaveLength(5); // as faces externas partidas pela parede comum viram uma parede só
  });

  it('sem texto → nome genérico + pendência', () => {
    const r = reconhecerVetores({ segmentos: comodo(1, 1, 4, 3), textos: [] }, opcoes);
    expect(ambientes(r)[0]!.props).toMatchObject({ nome: 'Ambiente 1', tipoAmbiente: 'outro' });
    expect(r.pendencias.some((p) => p.startsWith('Ambiente 1 sem nome'))).toBe(true);
    expect(r.pendencias.some((p) => p.startsWith('Nenhum nome de cômodo foi reconhecido'))).toBe(true);
  });

  it('vão de porta no meio da parede: a parede fica contínua, o ambiente fecha e sai a pendência', () => {
    // parede de cima com a porta entre x = 2 e x = 2,8 (faces interrompidas + ombreiras)
    const segmentos: Seg[] = [
      seg(1, 1, 2, 1), seg(2.8, 1, 5, 1), seg(1 - E, 1 - E, 2, 1 - E), seg(2.8, 1 - E, 5 + E, 1 - E),
      seg(2, 1 - E, 2, 1), seg(2.8, 1 - E, 2.8, 1),
      seg(5, 1, 5, 4), seg(5, 4, 1, 4), seg(1, 4, 1, 1),
      seg(5 + E, 1 - E, 5 + E, 4 + E), seg(5 + E, 4 + E, 1 - E, 4 + E), seg(1 - E, 4 + E, 1 - E, 1 - E),
    ];
    const r = reconhecerVetores({ segmentos, textos: [texto('Sala', 3, 2.5)] }, opcoes);
    expect(paredes(r)).toHaveLength(4);
    expect(ambientes(r)).toHaveLength(1);
    expect(areaM2(ambientes(r)[0]!)).toBeCloseTo(12, 6);
    expect(r.pendencias.some((p) => p.startsWith('1 vão (porta/passagem) foi fechado'))).toBe(true);
  });

  it('lado aberto: não inventa o fechamento — sem ambiente e com pendência citando o nome', () => {
    // só três paredes (falta a de baixo, com 4 m de abertura)
    const segmentos: Seg[] = [
      seg(1, 4, 1, 1), seg(1, 1, 5, 1), seg(5, 1, 5, 4),
      seg(1 - E, 4, 1 - E, 1 - E), seg(1 - E, 1 - E, 5 + E, 1 - E), seg(5 + E, 1 - E, 5 + E, 4),
    ];
    const r = reconhecerVetores({ segmentos, textos: [texto('Lavanderia', 3, 2.5)] }, opcoes);
    expect(ambientes(r)).toEqual([]);
    expect(paredes(r)).toHaveLength(3);
    expect(r.pendencias.some((p) => p.startsWith('"Lavanderia": o nome está na planta, mas as paredes em volta não fecham'))).toBe(true);
  });
});

describe('reconhecerVetores — ruído e outros desenhos', () => {
  const planta = comodo(1, 1, 4, 3);
  const textos = [texto('Sala', 3, 2.5)];

  it('traços curtos (hachuras, símbolos) são ignorados', () => {
    const ruido: Seg[] = [];
    for (let i = 0; i < 200; i++) ruido.push(seg(2 + i * 0.01, 2, 2 + i * 0.01, 2.06)); // 6 cm cada
    const r = reconhecerVetores({ segmentos: [...planta, ...ruido], textos }, opcoes);
    expect(paredes(r)).toHaveLength(4);
    expect(ambientes(r)).toHaveLength(1);
  });

  it('outro desenho da mesma folha (sem nome de cômodo) é descartado', () => {
    const corte = comodo(20, 1, 6, 2.8);
    const r = reconhecerVetores({ segmentos: [...planta, ...corte], textos: [...textos, texto('Corte 1', 23, 5)] }, opcoes);
    expect(paredes(r)).toHaveLength(4);
    expect(ambientes(r).map((a) => a.props.nome)).toEqual(['Sala']);
    expect(r.pendencias.some((p) => p.includes('4 trechos com cara de parede foram descartados'))).toBe(true);
  });

  it('traço fino junto à face da parede (bancada) não rouba a parede de traço grosso', () => {
    const bancada = [seg(1.1, 1, 1.1, 4)]; // a 10 cm da face interna esquerda
    const segmentos = [...planta, ...bancada];
    const larguras = [...planta.map(() => 0.7), 0.25];
    const r = reconhecerVetores({ segmentos, larguras, textos }, opcoes);
    expect(paredes(r)).toHaveLength(4);
    expect(paredes(r).every((p) => p.props.espessura === 0.15)).toBe(true);
    expect(areaM2(ambientes(r)[0]!)).toBeCloseTo(12, 6);
  });

  it('traços repetidos (a mesma linha desenhada duas vezes) não duplicam paredes', () => {
    const r = reconhecerVetores({ segmentos: [...planta, ...planta], textos }, opcoes);
    expect(paredes(r)).toHaveLength(4);
    expect(ambientes(r)).toHaveLength(1);
  });

  it('região: só o que está dentro do polígono é analisado', () => {
    const outra = comodo(20, 1, 3, 3);
    const tudo = { segmentos: [...planta, ...outra], textos: [...textos, texto('Quarto', 21.5, 2.5)] };
    expect(ambientes(reconhecerVetores(tudo, opcoes))).toHaveLength(2);
    const regiao = [{ x: 0, y: 0 }, { x: 10 / ESCALA, y: 0 }, { x: 10 / ESCALA, y: 10 / ESCALA }, { x: 0, y: 10 / ESCALA }];
    const r = reconhecerVetores(tudo, { ...opcoes, regiao });
    expect(ambientes(r).map((a) => a.props.nome)).toEqual(['Sala']);
    expect(paredes(r)).toHaveLength(4);
  });
});

describe('reconhecerVetores — quando não roda', () => {
  it('zero (ou quase zero) segmentos → mensagem de PDF não vetorial', () => {
    for (const segmentos of [[], [seg(0, 0, 1, 0)]]) {
      const r = reconhecerVetores({ segmentos, textos: [] }, opcoes);
      expect(r.situacao).toBe('nao-vetorial');
      expect(r.elementos).toEqual([]);
      expect(r.mensagem).toBe(MENSAGEM_NAO_VETORIAL);
      expect(r.mensagem).toContain('não é vetorial');
    }
  });

  it('página sem escala → não presume escala: avisa e não gera nada', () => {
    const r = reconhecerVetores({ segmentos: comodo(1, 1, 4, 3), textos: [] }, { pagina: 1, escala: null });
    expect(r.situacao).toBe('sem-escala');
    expect(r.elementos).toEqual([]);
    expect(r.pendencias).toEqual([MENSAGEM_SEM_ESCALA]);
  });

  it('traços sem pares de paralelas na distância de parede → nada reconhecido, com explicação', () => {
    const r = reconhecerVetores({ segmentos: ret(1, 1, 5, 4), textos: [] }, opcoes);
    expect(r.situacao).toBe('nada');
    expect(r.mensagem).toContain('Nenhuma parede foi reconhecida');
  });

  it('traços demais → pendência clara em vez de travar', () => {
    const muitos: Seg[] = [];
    for (let i = 0; i <= RECONHECIMENTO_PDF.maxSegmentos; i++) muitos.push(seg(i, 0, i, 1));
    const r = reconhecerVetores({ segmentos: muitos, textos: [] }, opcoes);
    expect(r.situacao).toBe('excesso');
    expect(r.elementos).toEqual([]);
    expect(r.mensagem).toContain('traços demais');
  });
});

describe('recuarParaFaceInterna', () => {
  it('recua cada aresta pela meia espessura da sua parede', () => {
    const eixos = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
    const interno = recuarParaFaceInterna(eixos, [0.1, 0.2, 0.1, 0.05])!;
    expect(areaPoligono(interno)).toBeCloseTo((4 - 0.25) * (3 - 0.2), 9);
  });

  it('recuo maior que o polígono → null', () => {
    expect(recuarParaFaceInterna([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], [1, 1, 1, 1])).toBeNull();
  });
});
