/** Regras das ferramentas de desenho (modo → geometria, bloqueio, snap, calibração). Lógica pura. */
import type { Geometria, ModoFerramenta, Ponto } from '@/core/model';
import { calcularEscala, distancia, lerNumero, restringirOrtogonal, retanguloParaPoligono, snapVertice } from '@/core/calc';

export const DICA_SEM_PLANTA = 'Abra uma planta (PDF) primeiro';
export const DICA_SEM_ESCALA = 'Calibre a escala desta página primeiro';
export const DICA_SEM_PAREDE = 'Clique sobre uma parede';

/** Modos que não medem nada e por isso funcionam em página sem escala. */
const MODOS_SEM_MEDIDA: readonly ModoFerramenta[] = ['selecionar', 'pan', 'calibrar'];

/**
 * Decide se a ferramenta está bloqueada. Devolve o motivo (dica) ou null se liberada.
 * Sem planta, tudo fica bloqueado; sem escala, só selecionar/pan/calibrar funcionam.
 */
export function motivoBloqueio(modo: ModoFerramenta, temPlanta: boolean, escala: number | null): string | null {
  if (!temPlanta) return DICA_SEM_PLANTA;
  if (MODOS_SEM_MEDIDA.includes(modo)) return null;
  if (escala === null || !(escala > 0)) return DICA_SEM_ESCALA;
  return null;
}

/** Tipo de geometria que o modo produz (null: o modo não desenha elemento). */
export function tipoGeometriaDoModo(modo: ModoFerramenta): Geometria['tipo'] | null {
  switch (modo) {
    case 'ponto':
    case 'contagem':
      return 'ponto';
    case 'distancia':
    case 'polilinha':
    case 'parede':
      return 'polilinha';
    case 'poligono':
    case 'retangulo':
      return 'poligono';
    default:
      return null;
  }
}

/** Nº de cliques que conclui o desenho sozinho (null: modo aberto ou sem desenho). */
export function cliquesParaConcluir(modo: ModoFerramenta): number | null {
  switch (modo) {
    case 'ponto':
    case 'contagem':
      return 1;
    case 'distancia':
    case 'retangulo':
    case 'calibrar':
      return 2;
    default:
      return null;
  }
}

/** Modos abertos: vértices até duplo clique/Enter. */
export function modoAberto(modo: ModoFerramenta): boolean {
  return modo === 'polilinha' || modo === 'poligono' || modo === 'parede';
}

/** Mínimo de vértices para concluir um modo aberto. */
export function minimoVertices(modo: ModoFerramenta): number {
  return modo === 'poligono' ? 3 : 2;
}

export function mesmoPonto(a: Ponto, b: Ponto, tolerancia: number): boolean {
  return distancia(a, b) <= tolerancia;
}

export interface OpcoesResolucao {
  /** Vértices candidatos ao snap (unidades do PDF). */
  candidatos: Ponto[];
  /** Tolerância do snap em unidades do PDF (px de tela ÷ zoom). */
  tolerancia: number;
  /** Shift pressionado: trava na horizontal/vertical em relação ao vértice anterior. */
  ortogonal: boolean;
  anterior: Ponto | null;
}

/** Ponto efetivo de um clique/cursor: ortogonal (Shift) tem prioridade; senão snap a vértice. */
export function resolverPonto(bruto: Ponto, opcoes: OpcoesResolucao): { ponto: Ponto; snap: boolean } {
  if (opcoes.ortogonal && opcoes.anterior) {
    return { ponto: restringirOrtogonal(opcoes.anterior, bruto), snap: false };
  }
  const alvo = snapVertice(bruto, opcoes.candidatos, opcoes.tolerancia);
  return alvo ? { ponto: { x: alvo.x, y: alvo.y }, snap: true } : { ponto: bruto, snap: false };
}

/** Pontos da pré-visualização elástica (vértices já clicados + cursor). */
export function pontosDaPrevia(modo: ModoFerramenta, pontos: Ponto[], cursor: Ponto | null): Ponto[] {
  if (!cursor || pontos.length === 0) return pontos;
  if (modo === 'retangulo') return retanguloParaPoligono(pontos[0], cursor);
  return [...pontos, cursor];
}

/**
 * Escala (m por unidade do PDF) a partir dos 2 pontos da cota e do texto digitado ("3,07").
 * null se a medida for inválida/não positiva ou os pontos coincidirem.
 */
export function escalaDaCalibracao(p1: Ponto, p2: Ponto, textoMedida: string): number | null {
  const medida = lerNumero(textoMedida);
  if (medida === null || !(medida > 0)) return null;
  if (!(distancia(p1, p2) > 0)) return null;
  const escala = calcularEscala(p1, p2, medida);
  return Number.isFinite(escala) && escala > 0 ? escala : null;
}
