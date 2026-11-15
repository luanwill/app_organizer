/** Construtores de projeto usados apenas pelos testes da hidráulica. */
import type { Aparelho, Elemento, ElementoDe, Ponto, Projeto, SistemaHidraulico, Status, TipoAmbiente } from '@/core/model';
import { projetoVazio } from '@/core/model';
import { propsPadraoPonto } from './sugestao';

/** 100 unidades do PDF = 1 m. */
export const ESCALA = 0.01;

export function projetoBase(elementos: Elemento[], ajustar?: (p: Projeto) => void): Projeto {
  const projeto = projetoVazio('p1', '2026-01-01T00:00:00.000Z');
  projeto.totalPaginas = 1;
  projeto.paginas = { 1: { escala: ESCALA } };
  projeto.parametros.gerais.peDireito = 2.7;
  projeto.parametros.gerais.numeroPessoas = 4;
  projeto.elementos = elementos;
  ajustar?.(projeto);
  return projeto;
}

const base = (id: string, status: Status) => ({
  id,
  disciplina: 'hidraulica' as const,
  pagina: 1,
  vinculos: {},
  origem: 'desenhado' as const,
  status,
});

/** Ambiente retangular (x0, y0)–(x1, y1) em unidades do PDF. */
export function ambiente(
  id: string,
  tipoAmbiente: TipoAmbiente,
  [x0, y0, x1, y1]: [number, number, number, number],
  extras: Partial<ElementoDe<'ambiente'>['props']> = {},
): ElementoDe<'ambiente'> {
  return {
    ...base(id, 'confirmado'),
    disciplina: 'arquitetura',
    tipo: 'ambiente',
    geometria: { tipo: 'poligono', pontos: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] },
    props: { nome: id, tipoAmbiente, areaMolhada: true, coberto: true, ...extras },
  };
}

export function ponto(
  id: string,
  aparelho: Aparelho,
  p: Ponto,
  ambienteId?: string,
  status: Status = 'confirmado',
  extras: Partial<ElementoDe<'ponto-hidraulico'>['props']> = {},
): ElementoDe<'ponto-hidraulico'> {
  return {
    ...base(id, status),
    tipo: 'ponto-hidraulico',
    geometria: { tipo: 'ponto', ponto: p },
    vinculos: ambienteId ? { ambienteId } : {},
    props: { ...propsPadraoPonto(aparelho, false), ...extras },
  };
}

export function reservatorio(p: Ponto, status: Status = 'confirmado'): ElementoDe<'reservatorio'> {
  return { ...base('res', status), tipo: 'reservatorio', geometria: { tipo: 'ponto', ponto: p }, props: {} };
}

export function caixaInspecao(p: Ponto, status: Status = 'confirmado'): ElementoDe<'caixa-inspecao'> {
  return { ...base('ci', status), tipo: 'caixa-inspecao', geometria: { tipo: 'ponto', ponto: p }, props: {} };
}

export function tubo(id: string, sistema: SistemaHidraulico, pontos: Ponto[], diametroMm?: number): ElementoDe<'tubo'> {
  return { ...base(id, 'confirmado'), tipo: 'tubo', geometria: { tipo: 'polilinha', pontos }, props: { sistema, diametroMm } };
}
