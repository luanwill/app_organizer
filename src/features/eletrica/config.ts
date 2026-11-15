/**
 * Elétrica — parâmetros normativos (NBR 5410) e constantes do módulo.
 * Nenhum número mágico deve ficar espalhado nos outros arquivos.
 * Os parâmetros que o usuário pode alterar ficam em projeto.parametros.eletrica (contrato).
 */
import type { AlturaPonto, TipoAmbiente, TipoPontoEletrico, TipoTUE } from '@/core/model';

// ---------------------------------------------------------------- NBR 5410: iluminação

/** Carga mínima de iluminação: 100 VA para os primeiros 6 m² + 60 VA a cada 4 m² inteiros. */
export const ILUMINACAO = {
  areaBaseM2: 6,
  cargaBaseVA: 100,
  areaIncrementoM2: 4,
  cargaIncrementoVA: 60,
} as const;

// ---------------------------------------------------------------- NBR 5410: TUGs

/** Regra de quantidade de TUGs por tipo de ambiente. */
export type RegraTUG =
  /** 1 tomada a cada `passoM` (ou fração) de perímetro. */
  | { modo: 'perimetro'; passoM: number }
  /** Quantidade fixa (banheiro: 1 junto ao lavatório). */
  | { modo: 'fixo'; quantidade: number }
  /** Até `areaLimiteM2`: `quantidadeMinima`; acima: 1 a cada `passoM` (ou fração) de perímetro. */
  | { modo: 'area-ou-perimetro'; areaLimiteM2: number; quantidadeMinima: number; passoM: number };

const REGRA_TUG_DEMAIS: RegraTUG = { modo: 'area-ou-perimetro', areaLimiteM2: 6, quantidadeMinima: 1, passoM: 5 };

export const REGRA_TUG: Record<TipoAmbiente, RegraTUG> = {
  sala: { modo: 'perimetro', passoM: 5 },
  quarto: { modo: 'perimetro', passoM: 5 },
  cozinha: { modo: 'perimetro', passoM: 3.5 },
  'area-servico': { modo: 'perimetro', passoM: 3.5 },
  banheiro: { modo: 'fixo', quantidade: 1 },
  circulacao: REGRA_TUG_DEMAIS,
  varanda: REGRA_TUG_DEMAIS,
  garagem: REGRA_TUG_DEMAIS,
  outro: REGRA_TUG_DEMAIS,
};

/** Altura de instalação das TUGs por tipo de ambiente (bancadas → média). */
export const ALTURA_TUG_PADRAO: AlturaPonto = 'baixa';
export const ALTURA_TUG_POR_AMBIENTE: Partial<Record<TipoAmbiente, AlturaPonto>> = {
  cozinha: 'media',
  'area-servico': 'media',
  banheiro: 'media',
};

/** Altura de instalação de cada TUE. */
export const ALTURA_TUE: Record<TipoTUE, AlturaPonto> = {
  chuveiro: 'alta',
  'ar-condicionado': 'alta',
  'micro-ondas': 'media',
  'torneira-eletrica': 'media',
  'forno-eletrico': 'media',
  'maquina-lavar': 'media',
};

/**
 * Casas decimais para limpar o ruído binário de áreas/perímetros (m², m) antes de aplicar
 * os degraus da norma (ex.: 9,999999999 m² deve contar como 10 m²).
 */
export const CASAS_DEGRAU_NORMA = 6;

// ---------------------------------------------------------------- posicionamento das sugestões (m)

/** Recuo dos pontos de parede para dentro do ambiente. */
export const RECUO_PAREDE_M = 0.1;
/** Uma porta dá acesso ao ambiente se estiver a até esta distância da borda do polígono. */
export const TOLERANCIA_PORTA_M = 0.3;
/** Folga entre a borda da porta e o interruptor. */
export const FOLGA_INTERRUPTOR_M = 0.15;
/** Afastamento (ao longo da parede) entre o lavatório e a TUG do banheiro. */
export const AFASTAMENTO_LAVATORIO_M = 0.3;
/** Distância mínima entre dois pontos sugeridos (evita sobreposição). */
export const DISTANCIA_MINIMA_PONTOS_M = 0.3;
/** Passo de busca de uma posição livre ao longo do perímetro. */
export const PASSO_BUSCA_POSICAO_M = 0.25;
/** Nº máximo de deslocamentos (para cada lado) ao procurar posição livre para uma TUG. */
export const TENTATIVAS_POSICAO_LIVRE = 8;

// ---------------------------------------------------------------- eletrodutos

/** Altura do quadro de distribuição (m) — a descida do quadro é pé-direito − esta altura. */
export const ALTURA_QUADRO_M = 1.5;
/** Uma rota redesenhada atende um ponto se terminar (ou começar) a até esta distância dele. */
export const TOLERANCIA_ROTA_M = 0.15;

// ---------------------------------------------------------------- proteção

/** Correntes nominais comerciais de disjuntores (A), em ordem crescente. */
export const DISJUNTORES_COMERCIAIS_A = [10, 16, 20, 25, 32, 40, 50, 63] as const;
/** Dispositivo DR geral (un) quando houver ao menos um circuito. */
export const QUANTIDADE_DR = 1;
/** DPS: 1 por fase + 1 no neutro (se `neutro`). */
export const DPS = { fases: 1, neutro: true } as const;
export const QUANTIDADE_DPS = DPS.fases + (DPS.neutro ? 1 : 0);

// ---------------------------------------------------------------- pontos manuais

/** Potência inicial (VA) de um ponto de luz adicionado manualmente (carga mínima da norma). */
export const POTENCIA_LUZ_MANUAL_VA = ILUMINACAO.cargaBaseVA;
/** Interruptores não somam carga. */
export const POTENCIA_INTERRUPTOR_VA = 0;

// ---------------------------------------------------------------- textos

export const GRUPOS = {
  pontos: 'Pontos',
  circuitos: 'Circuitos',
  eletrodutos: 'Eletrodutos e fios',
  caixas: 'Caixas',
  luminarias: 'Luminárias',
} as const;

export const ROTULO_TIPO_PONTO: Record<TipoPontoEletrico, string> = {
  luz: 'Ponto de luz',
  tug: 'Tomada de uso geral (TUG)',
  tue: 'Tomada de uso específico (TUE)',
  interruptor: 'Interruptor',
};

export const ROTULO_TUE: Record<TipoTUE, string> = {
  chuveiro: 'Chuveiro',
  'micro-ondas': 'Micro-ondas',
  'ar-condicionado': 'Ar-condicionado',
  'forno-eletrico': 'Forno elétrico',
  'maquina-lavar': 'Máquina de lavar',
  'torneira-eletrica': 'Torneira elétrica',
};

export const TIPOS_TUE = Object.keys(ROTULO_TUE) as TipoTUE[];

export const ROTULO_ALTURA: Record<AlturaPonto, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  teto: 'Teto',
  interruptor: 'Interruptor',
};

export type TipoCircuito = 'iluminacao' | 'tug' | 'tue';

export const ROTULO_TIPO_CIRCUITO: Record<TipoCircuito, string> = {
  iluminacao: 'Iluminação',
  tug: 'TUG',
  tue: 'TUE',
};

export const CAIXA_POR_TIPO: Record<TipoPontoEletrico, { chave: string; descricao: string }> = {
  luz: { chave: 'octogonal', descricao: 'Caixa octogonal (ponto de luz)' },
  tug: { chave: '4x2', descricao: 'Caixa 4×2' },
  interruptor: { chave: '4x2', descricao: 'Caixa 4×2' },
  tue: { chave: '4x4', descricao: 'Caixa 4×4' },
};

export const TEXTO_TUE_NAO_INFORMADA = 'equipamento não informado';

export const AVISO_SECOES =
  'Seções de condutores e disjuntores são valores padrão — confira com o projeto elétrico.';
export const MENSAGEM_SEM_QUADRO = 'Posicione o quadro de distribuição';
export const INSTRUCAO_REDESENHAR = 'Desenhe a rota na planta e termine a rota sobre o ponto.';

/** Prefixo dos ids determinísticos das sugestões (sugerir é função pura — sem ids aleatórios). */
export const PREFIXO_ID_SUGESTAO = 'sug-el';
