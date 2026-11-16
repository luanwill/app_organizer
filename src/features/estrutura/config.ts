/**
 * Configuração da disciplina Estrutura: tolerâncias, coeficientes e textos fixos.
 * Nenhum número mágico deve ficar espalhado nos outros arquivos.
 * (Seções, taxas, vão máximo etc. são PARÂMETROS do projeto — ficam em parametros.estrutura.)
 */
import type { TipoLaje, TipoNo } from '@/core/model';

// ---------------------------------------------------------------- tolerâncias

/** Tolerância (m) para unir vértices/encontros de paredes no grafo e para "pilar sobre o eixo". */
export const TOLERANCIA_GRAFO_M = 0.1;

/** Pilares cuja diferença de y é menor que isto (m) estão na mesma "linha" da numeração. */
export const TOLERANCIA_LINHA_M = 0.2;

/** Distância máxima (m) entre bordas de ambientes para a união de lajes (espessura de uma parede). */
export const TOLERANCIA_UNIAO_LAJES_M = 0.35;

/** Desvio máximo (m) de um lado para ele ainda contar como horizontal/vertical (polígono ortogonal). */
export const TOLERANCIA_ORTOGONAL_M = 0.01;

/** Coordenadas da grade de união mais próximas que isto (unidades do PDF) são a mesma coordenada. */
export const EPSILON_GRADE = 1e-6;

/** Folga numérica na comparação vão × vão máximo (vão EXATAMENTE igual ao máximo não recebe pilar). */
export const EPSILON_VAO = 1e-9;

/**
 * Tolerância relativa do vão máximo (1%): absorve o erro de calibração por clique na planta.
 * Um vão só recebe pilar intermediário quando passa de vão máximo × (1 + tolerância).
 */
export const TOLERANCIA_VAO_RELATIVA = 0.01;

// ---------------------------------------------------------------- pilares

export type NoTipoPilar = TipoNo | 'intermediario';

/** Força do nó na fusão de pilares próximos: fica o mais forte. */
export const FORCA_NO: Record<NoTipoPilar, number> = {
  X: 5,
  T: 4,
  L: 3,
  extremidade: 2,
  intermediario: 1,
  passagem: 0,
};

// ---------------------------------------------------------------- aço

/** Peso linear do aço (kg/m) = d² / 162, com d em mm. */
export const DIVISOR_PESO_LINEAR_ACO = 162;

/** Soma dos dois ganchos do estribo (m). */
export const GANCHOS_ESTRIBO_M = 0.1;

/** Detalhe das linhas de aço calculadas por taxa (kg/m³). */
export const DETALHE_ACO_TAXA = 'CA-50';

// ---------------------------------------------------------------- lajes

/** Espessura equivalente de concreto = espessura total × fator. */
export const FATOR_CONCRETO_LAJE: Record<TipoLaje, number> = {
  macica: 1,
  'trelicada-eps': 0.5,
  'trelicada-lajota': 0.55,
};

/** Comprimento da peça de enchimento (m) ao longo da vigota. */
export const COMPRIMENTO_ENCHIMENTO_M: Record<Exclude<TipoLaje, 'macica'>, number> = {
  'trelicada-eps': 1,
  'trelicada-lajota': 0.2,
};

/** Tela de distribuição das lajes treliçadas: área × fator de transpasse. */
export const FATOR_TRANSPASSE_TELA = 1.1;

export const ROTULO_TIPO_LAJE: Record<TipoLaje, string> = {
  macica: 'Maciça',
  'trelicada-eps': 'Treliçada com EPS',
  'trelicada-lajota': 'Treliçada com lajota',
};

// ---------------------------------------------------------------- rótulos, ids e grupos

export const PREFIXO_ROTULO = {
  pilar: 'P',
  'viga-baldrame': 'VB',
  'viga-superior': 'VS',
  laje: 'L',
  fundacao: 'F',
} as const;

export const ROTULO_RADIER = 'Radier';

/** Prefixo dos ids (determinísticos) das sugestões: `${PREFIXO_ID_SUGESTAO}-${pagina}-${rotulo}`. */
export const PREFIXO_ID_SUGESTAO = 'est';

export const GRUPO = {
  pilares: 'Pilares',
  baldrame: 'Vigas baldrame',
  superiores: 'Vigas superiores',
  lajes: 'Lajes',
  fundacoes: 'Fundações',
} as const;
