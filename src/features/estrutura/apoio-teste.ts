/** Apoio aos testes: monta projetos pequenos em metros e converte para unidades do PDF. */
import type { Elemento, Ponto, Projeto } from '@/core/model';
import { projetoVazio } from '@/core/model';

/** Escala dos testes: 1 unidade do PDF = 2 cm. */
export const ESCALA = 0.02;
export const u = (metros: number): number => metros / ESCALA;
export const pt = (x: number, y: number): Ponto => ({ x: u(x), y: u(y) });

export function parede(id: string, a: [number, number], b: [number, number]): Elemento {
  return {
    id,
    tipo: 'parede',
    disciplina: 'arquitetura',
    pagina: 1,
    geometria: { tipo: 'polilinha', pontos: [pt(...a), pt(...b)] },
    vinculos: {},
    origem: 'desenhado',
    status: 'confirmado',
    props: { espessura: 0.15 },
  };
}

/** Ambiente retangular (metros). */
export function ambiente(id: string, x0: number, y0: number, x1: number, y1: number, coberto = true): Elemento {
  return {
    id,
    tipo: 'ambiente',
    disciplina: 'arquitetura',
    pagina: 1,
    geometria: { tipo: 'poligono', pontos: [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)] },
    vinculos: {},
    origem: 'desenhado',
    status: 'confirmado',
    props: { nome: id, tipoAmbiente: 'sala', areaMolhada: false, coberto },
  };
}

export function projetoCom(elementos: Elemento[], escala: number | null = ESCALA): Projeto {
  const projeto = projetoVazio('teste', '2026-01-01T00:00:00.000Z');
  projeto.paginas = { 1: { escala } };
  projeto.elementos = elementos;
  projeto.parametros.gerais.peDireito = 2.8;
  return projeto;
}

/**
 * Planta em "L" (6 cantos) + 1 parede interna que encontra a parede esquerda no meio (T):
 *
 *  (0,0)────────────────(9,0)
 *    │                    │
 *  (0,4)══════(4,4)─────(9,4)
 *    │          │
 *  (0,8)──────(4,8)
 */
export function plantaEmL(): Elemento[] {
  return [
    parede('topo', [0, 0], [9, 0]),
    parede('direita', [9, 0], [9, 4]),
    parede('meio', [9, 4], [4, 4]),
    parede('dentro', [4, 4], [4, 8]),
    parede('base', [4, 8], [0, 8]),
    parede('esquerda', [0, 8], [0, 0]),
    parede('interna', [0, 4], [4, 4]),
  ];
}
