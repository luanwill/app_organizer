import { describe, expect, it } from 'vitest';
import type { ModoFerramenta } from '@/core/model';
import {
  cliquesParaConcluir,
  DICA_SEM_ESCALA,
  DICA_SEM_PLANTA,
  escalaDaCalibracao,
  minimoVertices,
  modoAberto,
  motivoBloqueio,
  pontosDaPrevia,
  resolverPonto,
  tipoGeometriaDoModo,
} from './desenho';
import { rotuloMedida, textoEscala } from './rotulos';

const TODOS: ModoFerramenta[] = [
  'selecionar', 'pan', 'calibrar', 'distancia', 'polilinha', 'poligono', 'retangulo', 'contagem', 'parede', 'ponto',
];
const LIVRES: ModoFerramenta[] = ['selecionar', 'pan', 'calibrar'];

describe('bloqueio das ferramentas', () => {
  it('sem planta, tudo fica bloqueado', () => {
    for (const modo of TODOS) expect(motivoBloqueio(modo, false, 0.02)).toBe(DICA_SEM_PLANTA);
  });

  it('página sem calibração: só selecionar, pan e calibrar funcionam', () => {
    for (const modo of TODOS) {
      const esperado = LIVRES.includes(modo) ? null : DICA_SEM_ESCALA;
      expect(motivoBloqueio(modo, true, null)).toBe(esperado);
    }
    expect(DICA_SEM_ESCALA).toBe('Calibre a escala desta página primeiro');
  });

  it('escala inválida (0, negativa, NaN) também bloqueia', () => {
    for (const escala of [0, -1, NaN]) expect(motivoBloqueio('distancia', true, escala)).toBe(DICA_SEM_ESCALA);
  });

  it('página calibrada libera tudo', () => {
    for (const modo of TODOS) expect(motivoBloqueio(modo, true, 0.02)).toBeNull();
  });
});

describe('regras dos modos', () => {
  it('geometria por modo', () => {
    expect(tipoGeometriaDoModo('ponto')).toBe('ponto');
    expect(tipoGeometriaDoModo('contagem')).toBe('ponto');
    expect(tipoGeometriaDoModo('distancia')).toBe('polilinha');
    expect(tipoGeometriaDoModo('polilinha')).toBe('polilinha');
    expect(tipoGeometriaDoModo('parede')).toBe('polilinha');
    expect(tipoGeometriaDoModo('poligono')).toBe('poligono');
    expect(tipoGeometriaDoModo('retangulo')).toBe('poligono');
    for (const m of LIVRES) expect(tipoGeometriaDoModo(m)).toBeNull();
  });

  it('cliques que concluem e modos abertos', () => {
    expect(cliquesParaConcluir('contagem')).toBe(1);
    expect(cliquesParaConcluir('ponto')).toBe(1);
    expect(cliquesParaConcluir('distancia')).toBe(2);
    expect(cliquesParaConcluir('retangulo')).toBe(2);
    expect(cliquesParaConcluir('calibrar')).toBe(2);
    expect(cliquesParaConcluir('poligono')).toBeNull();
    expect(modoAberto('polilinha') && modoAberto('poligono') && modoAberto('parede')).toBe(true);
    expect(modoAberto('distancia')).toBe(false);
    expect(minimoVertices('poligono')).toBe(3);
    expect(minimoVertices('parede')).toBe(2);
  });
});

describe('snap e ortogonal', () => {
  const candidatos = [{ x: 100, y: 100 }, { x: 200, y: 100 }];

  it('gruda no vértice dentro da tolerância', () => {
    const r = resolverPonto({ x: 103, y: 98 }, { candidatos, tolerancia: 5, ortogonal: false, anterior: null });
    expect(r).toEqual({ ponto: { x: 100, y: 100 }, snap: true });
  });

  it('fora da tolerância devolve o ponto bruto', () => {
    const r = resolverPonto({ x: 110, y: 98 }, { candidatos, tolerancia: 5, ortogonal: false, anterior: null });
    expect(r).toEqual({ ponto: { x: 110, y: 98 }, snap: false });
  });

  it('a tolerância é em px de tela: com mais zoom, menos unidades do PDF', () => {
    const bruto = { x: 104, y: 100 };
    const px = 10;
    expect(resolverPonto(bruto, { candidatos, tolerancia: px / 1, ortogonal: false, anterior: null }).snap).toBe(true);
    expect(resolverPonto(bruto, { candidatos, tolerancia: px / 4, ortogonal: false, anterior: null }).snap).toBe(false);
  });

  it('Shift trava na horizontal/vertical em relação ao vértice anterior', () => {
    const anterior = { x: 50, y: 50 };
    const h = resolverPonto({ x: 120, y: 57 }, { candidatos, tolerancia: 5, ortogonal: true, anterior });
    expect(h.ponto).toEqual({ x: 120, y: 50 });
    const v = resolverPonto({ x: 53, y: 190 }, { candidatos, tolerancia: 5, ortogonal: true, anterior });
    expect(v.ponto).toEqual({ x: 50, y: 190 });
  });
});

describe('calibração + medição', () => {
  // cota de 3,07 m desenhada com 153,5 unidades do PDF (inclinada de propósito)
  const p1 = { x: 100, y: 200 };
  const p2 = { x: 100 + 153.5 * 0.6, y: 200 + 153.5 * 0.8 };

  it('aceita vírgula decimal e calcula m por unidade', () => {
    const escala = escalaDaCalibracao(p1, p2, '3,07');
    expect(escala).not.toBeNull();
    expect(escala as number).toBeCloseTo(0.02, 9);
    expect(textoEscala(escala)).toBe('Escala: 1 un = 0,0200 m');
    expect(textoEscala(null)).toBe('Página sem escala');
  });

  it('recusa medida inválida e pontos coincidentes', () => {
    expect(escalaDaCalibracao(p1, p2, '')).toBeNull();
    expect(escalaDaCalibracao(p1, p2, 'abc')).toBeNull();
    expect(escalaDaCalibracao(p1, p2, '0')).toBeNull();
    expect(escalaDaCalibracao(p1, p2, '-2')).toBeNull();
    expect(escalaDaCalibracao(p1, p1, '3,07')).toBeNull();
  });

  it('uma linha sobre a cota de 3,07 m mede 3,07 m (±1%)', () => {
    const escala = escalaDaCalibracao(p1, p2, '3,07') as number;
    // o usuário clica com ~1 unidade de erro em cada ponta
    const a = { x: p1.x + 0.5, y: p1.y - 0.4 };
    const b = { x: p2.x - 0.3, y: p2.y + 0.5 };
    const comprimentoM = Math.hypot(b.x - a.x, b.y - a.y) * escala;
    expect(Math.abs(comprimentoM - 3.07) / 3.07).toBeLessThan(0.01);
    expect(rotuloMedida('polilinha', [p1, p2], escala)).toBe('3,07 m');
  });

  it('ambiente retangular 3,07 × 2,98 m mostra 9,15 m² ao vivo', () => {
    const escala = escalaDaCalibracao(p1, p2, '3,07') as number;
    const canto = { x: 300, y: 400 };
    const oposto = { x: canto.x + 3.07 / escala, y: canto.y + 2.98 / escala };
    const previa = pontosDaPrevia('retangulo', [canto], oposto);
    expect(previa).toHaveLength(4);
    expect(rotuloMedida(tipoGeometriaDoModo('retangulo'), previa, escala)).toBe('9,15 m²');
  });

  it('polilinha ao vivo soma os trechos até o cursor', () => {
    const previa = pontosDaPrevia('polilinha', [{ x: 0, y: 0 }, { x: 100, y: 0 }], { x: 100, y: 50 });
    expect(rotuloMedida('polilinha', previa, 0.02)).toBe('3,00 m');
  });

  it('sem escala não há medida', () => {
    expect(rotuloMedida('polilinha', [p1, p2], null)).toBeNull();
    expect(rotuloMedida('poligono', [p1, p2, { x: 0, y: 0 }], null)).toBeNull();
  });
});
