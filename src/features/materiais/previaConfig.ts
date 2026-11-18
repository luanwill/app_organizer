/**
 * Painel "Prévia da análise" — configuração (fases, rótulos, destaques e tempos da animação).
 * As fases espelham a linha do tempo do app (src/app/analise.ts); o app passa a fase por props.
 * Os grupos/descrições abaixo são os que as disciplinas emitem (arq, estrutura, elétrica, hidráulica).
 */
import type { CodigoServico, Disciplina, LinhaQuantitativo } from '@/core/model';

export type FasePrevia =
  | 'varredura'
  | 'paredes'
  | 'ambientes'
  | 'estrutura'
  | 'eletrica'
  | 'hidraulica'
  | 'materiais'
  | 'concluida';

export const ORDEM_FASES_PREVIA: readonly FasePrevia[] = [
  'varredura',
  'paredes',
  'ambientes',
  'estrutura',
  'eletrica',
  'hidraulica',
  'materiais',
  'concluida',
];

export const ROTULO_FASE_PREVIA: Record<FasePrevia, string> = {
  varredura: 'Lendo a planta…',
  paredes: 'Identificando paredes…',
  ambientes: 'Medindo ambientes…',
  estrutura: 'Lançando estrutura…',
  eletrica: 'Distribuindo pontos elétricos…',
  hidraulica: 'Distribuindo pontos hidráulicos…',
  materiais: 'Levantando materiais…',
  concluida: 'Análise concluída',
};

export const TEXTO_PREVIA = 'Prévia — ainda não confirmado; aceite as sugestões para entrar nos totais';
export const TEXTO_CHAMADA_FINAL = 'Confira na planta e aceite as sugestões';
export const TEXTO_NADA = 'Nada identificado';
export const TEXTO_AGUARDANDO_MATERIAIS = 'Os materiais aparecem ao final da análise.';

/** Como um destaque soma as linhas da disciplina. */
export type ModoDestaque =
  /** soma das quantidades das linhas filtradas */
  | 'soma'
  /** nº de elementos distintos (1º elementoId de cada linha filtrada) */
  | 'contagem';

export interface DestaqueConfig {
  rotulo: string;
  unidade: string;
  /** Fase em que o destaque surge e conta. */
  fase: FasePrevia;
  modo: ModoDestaque;
  filtro: (l: LinhaQuantitativo) => boolean;
}

export type DisciplinaPrevia = Exclude<Disciplina, 'materiais'>;

const doServico = (s: CodigoServico, unidade: string) => (l: LinhaQuantitativo) => l.servico === s && l.unidade === unidade;

/** Destaques por disciplina (cartões), na ordem de exibição. */
export const DESTAQUES: Record<DisciplinaPrevia, DestaqueConfig[]> = {
  arquitetura: [
    { rotulo: 'Paredes', unidade: 'un', fase: 'paredes', modo: 'contagem', filtro: (l) => l.grupo === 'Paredes' && l.unidade === 'm' },
    { rotulo: 'Comprimento de paredes', unidade: 'm', fase: 'paredes', modo: 'soma', filtro: (l) => l.grupo === 'Paredes' && l.unidade === 'm' },
    { rotulo: 'Alvenaria', unidade: 'm²', fase: 'paredes', modo: 'soma', filtro: doServico('alvenaria', 'm²') },
    { rotulo: 'Ambientes', unidade: 'un', fase: 'ambientes', modo: 'contagem', filtro: (l) => l.grupo === 'Ambientes' },
    { rotulo: 'Área de piso', unidade: 'm²', fase: 'ambientes', modo: 'soma', filtro: doServico('piso', 'm²') },
  ],
  estrutura: [
    { rotulo: 'Elementos', unidade: 'un', fase: 'estrutura', modo: 'contagem', filtro: () => true },
    { rotulo: 'Concreto', unidade: 'm³', fase: 'estrutura', modo: 'soma', filtro: doServico('concreto', 'm³') },
    { rotulo: 'Aço', unidade: 'kg', fase: 'estrutura', modo: 'soma', filtro: doServico('aco', 'kg') },
    { rotulo: 'Forma', unidade: 'm²', fase: 'estrutura', modo: 'soma', filtro: doServico('forma', 'm²') },
  ],
  eletrica: [
    { rotulo: 'Pontos', unidade: 'un', fase: 'eletrica', modo: 'soma', filtro: (l) => l.grupo === 'Pontos' && l.unidade === 'un' },
    { rotulo: 'Circuitos', unidade: 'un', fase: 'eletrica', modo: 'soma', filtro: (l) => l.descricao === 'Circuitos' },
    { rotulo: 'Eletroduto', unidade: 'm', fase: 'eletrica', modo: 'soma', filtro: (l) => l.descricao === 'Eletroduto' && l.unidade === 'm' },
    { rotulo: 'Fios e cabos', unidade: 'm', fase: 'eletrica', modo: 'soma', filtro: (l) => l.descricao.startsWith('Fio') && l.unidade === 'm' },
  ],
  hidraulica: [
    { rotulo: 'Pontos', unidade: 'un', fase: 'hidraulica', modo: 'soma', filtro: (l) => l.descricao.startsWith('Ponto hidráulico') && l.unidade === 'un' },
    { rotulo: 'Tubos', unidade: 'm', fase: 'hidraulica', modo: 'soma', filtro: (l) => l.grupo === 'Tubos' && l.unidade === 'm' },
    { rotulo: 'Conexões', unidade: 'un', fase: 'hidraulica', modo: 'soma', filtro: (l) => l.grupo === 'Conexões' && l.unidade === 'un' },
    { rotulo: 'Reservatório', unidade: 'L', fase: 'hidraulica', modo: 'soma', filtro: (l) => l.grupo === 'Reservatório' && l.unidade === 'L' },
  ],
};

/** Fase em que cada seção aparece (arquitetura surge com as paredes). */
export const FASE_DA_SECAO: Record<DisciplinaPrevia | 'materiais', FasePrevia> = {
  arquitetura: 'paredes',
  estrutura: 'estrutura',
  eletrica: 'eletrica',
  hidraulica: 'hidraulica',
  materiais: 'materiais',
};

/** Cascata dos materiais: fração da fase em que os itens começam a surgir; o resto é a contagem de cada um. */
export const JANELA_CASCATA = 0.6;
/** Unidades contadas como inteiros (sem casas decimais). */
export const UNIDADES_INTEIRAS: readonly string[] = ['un'];
export const CASAS_PREVIA = 2;
