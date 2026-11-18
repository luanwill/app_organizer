import { describe, expect, it } from 'vitest';
import type { Elemento } from '@/core/model';
import { FATOR_MIN_SIMBOLO, LIMIAR_PX_POR_METRO, PRIORIDADE_ETIQUETA, PRIORIDADE_SEMPRE_VISIVEL, TAMANHO_FONTE_PEQUENA_PX, TAMANHO_FONTE_PX } from './config';
import {
  ancoraEtiqueta,
  caixaEtiqueta,
  distanciaTipicaEntrePontos,
  escolherEtiquetas,
  fatorSimbolo,
  fonteEtiqueta,
  liberadaPeloZoom,
  pixelsPorMetro,
  tamanhoEtiqueta,
  type CandidatoEtiqueta,
} from './etiquetas';

const base = { pagina: 1, vinculos: {}, origem: 'sugerido-auto', status: 'pendente' } as const;
const pilar: Elemento = { ...base, id: 'p', disciplina: 'estrutura', tipo: 'pilar', rotulo: 'P1', props: { secaoB: 0.14, secaoH: 0.3 }, geometria: { tipo: 'ponto', ponto: { x: 100, y: 50 } } };
const ambiente: Elemento = {
  ...base, id: 'a', disciplina: 'arquitetura', tipo: 'ambiente', props: { nome: 'Sala', tipoAmbiente: 'sala', areaMolhada: false, coberto: true },
  geometria: { tipo: 'poligono', pontos: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }] },
};
const caixa = (x: number, y: number, w = 20, h = 10) => ({ x0: x, y0: y, x1: x + w, y1: y + h });
const cand = (id: string, prioridade: number, c = caixa(0, 0), destacado = false): CandidatoEtiqueta => ({ id, prioridade, destacado, caixa: c });

describe('prioridades', () => {
  it('ambiente > telhado/laje > pilar > resto; ambientes e medições sempre visíveis', () => {
    expect(PRIORIDADE_ETIQUETA.ambiente).toBeGreaterThan(PRIORIDADE_ETIQUETA.telhado);
    expect(PRIORIDADE_ETIQUETA.telhado).toBe(PRIORIDADE_ETIQUETA.laje);
    expect(PRIORIDADE_ETIQUETA.laje).toBeGreaterThan(PRIORIDADE_ETIQUETA.pilar);
    for (const t of ['viga-superior', 'calha', 'ponto-eletrico', 'ponto-hidraulico', 'fundacao'] as const) {
      expect(PRIORIDADE_ETIQUETA.pilar).toBeGreaterThan(PRIORIDADE_ETIQUETA[t]);
    }
    expect(PRIORIDADE_ETIQUETA.ambiente).toBeGreaterThanOrEqual(PRIORIDADE_SEMPRE_VISIVEL);
    expect(PRIORIDADE_ETIQUETA.medicao).toBeGreaterThanOrEqual(PRIORIDADE_SEMPRE_VISIVEL);
  });
});

describe('limiar de zoom', () => {
  it('pilares e o resto só aparecem acima do limiar de pixels por metro', () => {
    const p = PRIORIDADE_ETIQUETA.pilar;
    const r = PRIORIDADE_ETIQUETA['ponto-eletrico'];
    expect(liberadaPeloZoom(p, LIMIAR_PX_POR_METRO[p] - 1)).toBe(false);
    expect(liberadaPeloZoom(p, LIMIAR_PX_POR_METRO[p])).toBe(true);
    expect(liberadaPeloZoom(r, LIMIAR_PX_POR_METRO[p])).toBe(false);
    expect(liberadaPeloZoom(r, LIMIAR_PX_POR_METRO[r])).toBe(true);
  });

  it('ambiente, telhado e laje não dependem do zoom; sem escala só os sempre visíveis', () => {
    expect(liberadaPeloZoom(PRIORIDADE_ETIQUETA.ambiente, 1)).toBe(true);
    expect(liberadaPeloZoom(PRIORIDADE_ETIQUETA.telhado, 1)).toBe(true);
    expect(liberadaPeloZoom(PRIORIDADE_ETIQUETA.ambiente, null)).toBe(true);
    expect(liberadaPeloZoom(PRIORIDADE_ETIQUETA.pilar, null)).toBe(false);
  });

  it('pixels por metro = zoom ÷ escala', () => {
    expect(pixelsPorMetro(2, 0.02)).toBe(100);
    expect(pixelsPorMetro(2, null)).toBeNull();
  });
});

describe('colisão', () => {
  it('na sobreposição vence a maior prioridade; sem sobreposição todas aparecem', () => {
    const r = escolherEtiquetas([cand('ponto', 1, caixa(5, 2)), cand('pilar', 2, caixa(0, 0)), cand('longe', 1, caixa(300, 300))]);
    expect([...r].sort()).toEqual(['longe', 'pilar']);
  });

  it('empate: vale a ordem de chegada', () => {
    expect([...escolherEtiquetas([cand('a', 1), cand('b', 1)])]).toEqual(['a']);
  });

  it('ambientes (sempre visíveis) aparecem mesmo sobrepostos e tiram o lugar dos demais', () => {
    const s = PRIORIDADE_SEMPRE_VISIVEL;
    const r = escolherEtiquetas([cand('pilar', 2), cand('amb1', s), cand('amb2', s)]);
    expect([...r].sort()).toEqual(['amb1', 'amb2']);
  });

  it('a etiqueta destacada (hover/seleção) aparece mesmo colidindo e ganha o lugar', () => {
    const r = escolherEtiquetas([cand('amb', PRIORIDADE_SEMPRE_VISIVEL), cand('tomada', 1, caixa(3, 3), true), cand('viga', 1, caixa(6, 6))]);
    expect([...r].sort()).toEqual(['amb', 'tomada']);
  });

  it('a folga separa etiquetas quase encostadas; células da grade não perdem colisões', () => {
    expect(escolherEtiquetas([cand('a', 1, caixa(0, 0)), cand('b', 1, caixa(21, 0))], 2).size).toBe(1);
    expect(escolherEtiquetas([cand('a', 1, caixa(0, 0)), cand('b', 1, caixa(25, 0))], 2).size).toBe(2);
    // caixa grande que atravessa várias células
    expect(escolherEtiquetas([cand('a', 2, caixa(0, 0, 500, 10)), cand('b', 1, caixa(400, 5))], 0, 64).size).toBe(1);
  });

  it('centenas de etiquetas espalhadas: todas cabem; empilhadas: só a primeira', () => {
    const espalhadas = Array.from({ length: 400 }, (_, i) => cand(`e${i}`, 1, caixa((i % 20) * 40, Math.floor(i / 20) * 20)));
    expect(escolherEtiquetas(espalhadas).size).toBe(400);
    const empilhadas = Array.from({ length: 400 }, (_, i) => cand(`e${i}`, 1, caixa(i * 0.01, 0)));
    expect(escolherEtiquetas(empilhadas).size).toBe(1);
  });
});

describe('caixas e âncoras', () => {
  it('tamanho estimado cresce com o texto e com as linhas', () => {
    const um = tamanhoEtiqueta('P1', 11);
    expect(tamanhoEtiqueta('P10', 11).largura).toBeGreaterThan(um.largura);
    expect(tamanhoEtiqueta('Sala\n12,00 m²', 11).altura).toBeGreaterThan(um.altura);
  });

  it('ponto: etiqueta à direita do símbolo; ambiente: a partir do canto superior esquerdo', () => {
    const a = ancoraEtiqueta(pilar, [], 2);
    expect(a.modo).toBe('direita');
    const c = caixaEtiqueta(a, 'P1', 11, 2);
    expect(c.x0).toBeGreaterThan(100 * 2);
    expect((c.y0 + c.y1) / 2).toBeCloseTo(50 * 2, 9);
    const amb = ancoraEtiqueta(ambiente, ambiente.geometria.tipo === 'poligono' ? ambiente.geometria.pontos : [], 2);
    expect(amb.modo).toBe('canto');
    expect(caixaEtiqueta(amb, 'Sala', 11, 2).x0).toBeCloseTo(amb.ponto.x * 2, 9);
  });

  it('símbolos menores reaproximam a etiqueta do ponto', () => {
    expect(ancoraEtiqueta(pilar, [], 1, 0.5).deslocamentoPx).toBeLessThan(ancoraEtiqueta(pilar, [], 1, 1).deslocamentoPx);
  });

  it('fonte pequena para pontos não destacados; normal ao destacar e nas sempre visíveis', () => {
    expect(fonteEtiqueta(pilar, false)).toBe(TAMANHO_FONTE_PEQUENA_PX);
    expect(fonteEtiqueta(pilar, true)).toBe(TAMANHO_FONTE_PX);
    expect(fonteEtiqueta(ambiente, false)).toBe(TAMANHO_FONTE_PX);
  });
});

describe('tamanho dos símbolos', () => {
  it('distância típica = mediana do vizinho mais próximo (mede a densidade local)', () => {
    expect(distanciaTipicaEntrePontos([{ x: 0, y: 0 }])).toBeNull();
    // grade 10 × 10 com passo 5 → vizinho mais próximo = 5
    const grade = Array.from({ length: 100 }, (_, i) => ({ x: (i % 10) * 5, y: Math.floor(i / 10) * 5 }));
    expect(distanciaTipicaEntrePontos(grade)).toBeCloseTo(5, 9);
    // 20 pontos agrupados (passo 2) + 3 pontos distantes numa folha enorme: vale o agrupamento
    const banheiro = Array.from({ length: 20 }, (_, i) => ({ x: 1000 + (i % 5) * 2, y: 1000 + Math.floor(i / 5) * 2 }));
    expect(distanciaTipicaEntrePontos([...banheiro, { x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 0, y: 5000 }])).toBeCloseTo(2, 9);
  });

  it('pontos alinhados ou coincidentes não travam o cálculo', () => {
    const linha = Array.from({ length: 500 }, (_, i) => ({ x: 0, y: i * 10 }));
    expect(distanciaTipicaEntrePontos(linha)).toBeCloseTo(10, 9);
    expect(distanciaTipicaEntrePontos([{ x: 3, y: 3 }, { x: 3, y: 3 }])).toBe(0);
  });

  it('confere com a força bruta em pontos aleatórios', () => {
    let semente = 7;
    const aleatorio = () => ((semente = (semente * 16807) % 2147483647) / 2147483647) * 800;
    const pts = Array.from({ length: 300 }, () => ({ x: aleatorio(), y: aleatorio() * 0.3 }));
    const nn = pts.map((p, i) => Math.min(...pts.filter((_, j) => j !== i).map((q) => Math.hypot(q.x - p.x, q.y - p.y)))).sort((a, b) => a - b);
    expect(distanciaTipicaEntrePontos(pts)).toBeCloseTo(nn[150], 9);
  });

  it('fator: cheio com espaço; menor (até o mínimo) quando apertados; volta a crescer com zoom', () => {
    expect(fatorSimbolo(null, 1)).toBe(1);
    expect(fatorSimbolo(100, 1)).toBe(1);
    const apertado = fatorSimbolo(18, 1);
    expect(apertado).toBeLessThan(1);
    expect(apertado).toBeGreaterThan(FATOR_MIN_SIMBOLO);
    expect(fatorSimbolo(1, 1)).toBe(FATOR_MIN_SIMBOLO);
    expect(fatorSimbolo(18, 2)).toBe(1);
  });
});
