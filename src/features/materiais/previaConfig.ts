/**
 * Painel "Prévia da análise" — configuração (fases, rótulos, destaques e tempos da animação).
 * As fases espelham a linha do tempo do app (src/app/analise.ts); o app passa a fase por props.
 * Os grupos/descrições abaixo são os que as disciplinas emitem (arq, estrutura, elétrica, hidráulica).
 */
import type { Alerta, CodigoServico, Disciplina, LinhaQuantitativo } from '@/core/model';

export type FasePrevia =
  | 'varredura'
  | 'paredes'
  | 'ambientes'
  | 'estrutura'
  | 'laje'
  | 'telhado'
  | 'calhas'
  | 'eletrica'
  | 'hidraulica'
  | 'materiais'
  | 'concluida';

export const ORDEM_FASES_PREVIA: readonly FasePrevia[] = [
  'varredura',
  'paredes',
  'ambientes',
  'estrutura',
  'laje',
  'telhado',
  'calhas',
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
  laje: 'Lançando lajes…',
  telhado: 'Montando o telhado…',
  calhas: 'Posicionando calhas e condutores…',
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

/** Seções (cartões) da prévia. Estrutura, lajes, cobertura e calhas vêm da disciplina estrutura. */
export type IdSecaoPrevia = 'arquitetura' | 'estrutura' | 'laje' | 'cobertura' | 'calhas' | 'eletrica' | 'hidraulica';

export interface SecaoConfig {
  id: IdSecaoPrevia;
  rotulo: string;
  /** Disciplina de onde vêm as linhas, os alertas e a cor. */
  disciplina: DisciplinaPrevia;
  /** Fase em que o cartão aparece. */
  fase: FasePrevia;
  /** Linhas da disciplina que pertencem a esta seção. */
  linhas: (l: LinhaQuantitativo) => boolean;
  /**
   * Alertas da disciplina que pertencem a esta seção (selo "dados faltantes").
   * Sem predicado = seção padrão da disciplina: recebe os alertas que nenhuma outra seção pegou.
   */
  alertas?: (a: Alerta) => boolean;
  /** Faltantes com selo próprio (ex.: "tipo de telha"); os demais entram só na contagem. */
  faltantesNomeados?: { nome: string; alerta: (a: Alerta) => boolean }[];
  destaques: DestaqueConfig[];
}

const doServico = (s: CodigoServico, unidade: string) => (l: LinhaQuantitativo) => l.servico === s && l.unidade === unidade;
const servicoEm = (servicos: readonly CodigoServico[]) => (l: LinhaQuantitativo) => !!l.servico && servicos.includes(l.servico);

/** Grupos que a estrutura emite (src/features/estrutura/config.ts → GRUPO). */
const GRUPOS_ESTRUTURA_PRINCIPAL = ['Pilares', 'Vigas baldrame', 'Vigas superiores', 'Fundações'];
const GRUPO_LAJES = 'Lajes';
const SERVICOS_COBERTURA: CodigoServico[] = ['telhamento', 'madeiramento', 'cumeeira'];
const SERVICOS_CALHAS: CodigoServico[] = ['calha', 'rufo', 'condutor'];

const RE_TELHA = /telha|telhado|cobertura/i;
const RE_TIPO_TELHA = /tipo\s*de\s*telha|tipoTelha/i;
const RE_CALHA = /calha|rufo|condutor/i;
const RE_LAJE = /laje|intereixo/i;
const alertaCom = (re: RegExp) => (a: Alerta) => re.test(a.campo) || re.test(a.mensagem);

/** Seções na ordem de exibição. */
export const SECOES_PREVIA: SecaoConfig[] = [
  {
    id: 'arquitetura',
    rotulo: 'Arquitetura',
    disciplina: 'arquitetura',
    fase: 'paredes',
    linhas: () => true,
    destaques: [
      { rotulo: 'Paredes', unidade: 'un', fase: 'paredes', modo: 'contagem', filtro: (l) => l.grupo === 'Paredes' && l.unidade === 'm' },
      { rotulo: 'Comprimento de paredes', unidade: 'm', fase: 'paredes', modo: 'soma', filtro: (l) => l.grupo === 'Paredes' && l.unidade === 'm' },
      { rotulo: 'Alvenaria', unidade: 'm²', fase: 'paredes', modo: 'soma', filtro: doServico('alvenaria', 'm²') },
      { rotulo: 'Ambientes', unidade: 'un', fase: 'ambientes', modo: 'contagem', filtro: (l) => l.grupo === 'Ambientes' },
      { rotulo: 'Área de piso', unidade: 'm²', fase: 'ambientes', modo: 'soma', filtro: doServico('piso', 'm²') },
    ],
  },
  {
    id: 'estrutura',
    rotulo: 'Estrutura',
    disciplina: 'estrutura',
    fase: 'estrutura',
    linhas: (l) => GRUPOS_ESTRUTURA_PRINCIPAL.includes(l.grupo),
    destaques: [
      { rotulo: 'Elementos', unidade: 'un', fase: 'estrutura', modo: 'contagem', filtro: () => true },
      { rotulo: 'Concreto', unidade: 'm³', fase: 'estrutura', modo: 'soma', filtro: doServico('concreto', 'm³') },
      { rotulo: 'Aço', unidade: 'kg', fase: 'estrutura', modo: 'soma', filtro: doServico('aco', 'kg') },
      { rotulo: 'Forma', unidade: 'm²', fase: 'estrutura', modo: 'soma', filtro: doServico('forma', 'm²') },
    ],
  },
  {
    id: 'laje',
    rotulo: 'Lajes',
    disciplina: 'estrutura',
    fase: 'laje',
    linhas: (l) => l.grupo === GRUPO_LAJES,
    alertas: alertaCom(RE_LAJE),
    destaques: [
      { rotulo: 'Lajes', unidade: 'un', fase: 'laje', modo: 'contagem', filtro: () => true },
      { rotulo: 'Área de laje', unidade: 'm²', fase: 'laje', modo: 'soma', filtro: (l) => l.unidade === 'm²' && l.descricao.endsWith('área') },
      { rotulo: 'Concreto', unidade: 'm³', fase: 'laje', modo: 'soma', filtro: doServico('concreto', 'm³') },
    ],
  },
  {
    id: 'cobertura',
    rotulo: 'Cobertura',
    disciplina: 'estrutura',
    fase: 'telhado',
    linhas: servicoEm(SERVICOS_COBERTURA),
    alertas: alertaCom(RE_TELHA),
    faltantesNomeados: [{ nome: 'tipo de telha', alerta: alertaCom(RE_TIPO_TELHA) }],
    destaques: [
      { rotulo: 'Área de telhado', unidade: 'm²', fase: 'telhado', modo: 'soma', filtro: doServico('telhamento', 'm²') },
      { rotulo: 'Cumeeira', unidade: 'm', fase: 'telhado', modo: 'soma', filtro: doServico('cumeeira', 'm') },
    ],
  },
  {
    id: 'calhas',
    rotulo: 'Calhas e condutores',
    disciplina: 'estrutura',
    fase: 'calhas',
    linhas: servicoEm(SERVICOS_CALHAS),
    alertas: alertaCom(RE_CALHA),
    destaques: [
      { rotulo: 'Calha', unidade: 'm', fase: 'calhas', modo: 'soma', filtro: doServico('calha', 'm') },
      { rotulo: 'Rufo', unidade: 'm', fase: 'calhas', modo: 'soma', filtro: doServico('rufo', 'm') },
      { rotulo: 'Condutores', unidade: 'm', fase: 'calhas', modo: 'soma', filtro: doServico('condutor', 'm') },
    ],
  },
  {
    id: 'eletrica',
    rotulo: 'Elétrica',
    disciplina: 'eletrica',
    fase: 'eletrica',
    linhas: () => true,
    destaques: [
      { rotulo: 'Pontos', unidade: 'un', fase: 'eletrica', modo: 'soma', filtro: (l) => l.grupo === 'Pontos' && l.unidade === 'un' },
      { rotulo: 'Circuitos', unidade: 'un', fase: 'eletrica', modo: 'soma', filtro: (l) => l.descricao === 'Circuitos' },
      { rotulo: 'Eletroduto', unidade: 'm', fase: 'eletrica', modo: 'soma', filtro: (l) => l.descricao === 'Eletroduto' && l.unidade === 'm' },
      { rotulo: 'Fios e cabos', unidade: 'm', fase: 'eletrica', modo: 'soma', filtro: (l) => l.descricao.startsWith('Fio') && l.unidade === 'm' },
    ],
  },
  {
    id: 'hidraulica',
    rotulo: 'Hidráulica',
    disciplina: 'hidraulica',
    fase: 'hidraulica',
    linhas: () => true,
    destaques: [
      { rotulo: 'Pontos', unidade: 'un', fase: 'hidraulica', modo: 'soma', filtro: (l) => l.descricao.startsWith('Ponto hidráulico') && l.unidade === 'un' },
      { rotulo: 'Tubos', unidade: 'm', fase: 'hidraulica', modo: 'soma', filtro: (l) => l.grupo === 'Tubos' && l.unidade === 'm' },
      { rotulo: 'Conexões', unidade: 'un', fase: 'hidraulica', modo: 'soma', filtro: (l) => l.grupo === 'Conexões' && l.unidade === 'un' },
      { rotulo: 'Reservatório', unidade: 'L', fase: 'hidraulica', modo: 'soma', filtro: (l) => l.grupo === 'Reservatório' && l.unidade === 'L' },
    ],
  },
];

/** Fase em que os materiais aparecem. */
export const FASE_MATERIAIS: FasePrevia = 'materiais';

/** Cascata dos materiais: fração da fase em que os itens começam a surgir; o resto é a contagem de cada um. */
export const JANELA_CASCATA = 0.6;
/** Unidades contadas como inteiros (sem casas decimais). */
export const UNIDADES_INTEIRAS: readonly string[] = ['un'];
export const CASAS_PREVIA = 2;
