/**
 * Hidráulica e sanitária — tabelas e constantes do módulo (nenhum número mágico fora daqui).
 * Diâmetros, alturas, consumo etc. são PARÂMETROS do projeto (parametros.hidraulica), não ficam aqui.
 */
import type { Aparelho, SistemaHidraulico, TipoAmbiente } from '@/core/model';

/** Aparelhos sugeridos por tipo de ambiente (os demais tipos não recebem sugestão). */
export const APARELHOS_POR_AMBIENTE: Partial<Record<TipoAmbiente, Aparelho[]>> = {
  banheiro: ['vaso', 'lavatorio', 'chuveiro', 'ralo'],
  cozinha: ['pia', 'filtro'],
  'area-servico': ['tanque', 'maquina-lavar', 'ralo'],
};

export interface LigacoesAparelho {
  aguaFria: boolean;
  esgoto: boolean;
  /** Recebe água quente quando o ambiente tem água quente. */
  aceitaAguaQuente: boolean;
  /** Saída de esgoto acima do piso: o ramal de esgoto ganha um trecho vertical = altura do ponto. */
  esgotoElevado: boolean;
}

/** Ligações padrão de cada aparelho (o chuveiro escoa pelo ralo; o filtro só tem água fria). */
export const LIGACOES_APARELHO: Record<Aparelho, LigacoesAparelho> = {
  vaso: { aguaFria: true, esgoto: true, aceitaAguaQuente: false, esgotoElevado: false },
  lavatorio: { aguaFria: true, esgoto: true, aceitaAguaQuente: true, esgotoElevado: true },
  chuveiro: { aguaFria: true, esgoto: false, aceitaAguaQuente: true, esgotoElevado: false },
  ralo: { aguaFria: false, esgoto: true, aceitaAguaQuente: false, esgotoElevado: false },
  pia: { aguaFria: true, esgoto: true, aceitaAguaQuente: true, esgotoElevado: true },
  filtro: { aguaFria: true, esgoto: false, aceitaAguaQuente: false, esgotoElevado: false },
  tanque: { aguaFria: true, esgoto: true, aceitaAguaQuente: false, esgotoElevado: true },
  'maquina-lavar': { aguaFria: true, esgoto: true, aceitaAguaQuente: false, esgotoElevado: true },
};

export const APARELHOS = Object.keys(LIGACOES_APARELHO) as Aparelho[];

export const NOME_APARELHO: Record<Aparelho, string> = {
  vaso: 'Vaso sanitário',
  lavatorio: 'Lavatório',
  chuveiro: 'Chuveiro',
  ralo: 'Ralo',
  pia: 'Pia de cozinha',
  filtro: 'Filtro',
  tanque: 'Tanque',
  'maquina-lavar': 'Máquina de lavar',
};

/** Rótulo curto exibido na planta. */
export const ROTULO_APARELHO: Record<Aparelho, string> = {
  vaso: 'Vaso',
  lavatorio: 'Lav.',
  chuveiro: 'Chuv.',
  ralo: 'Ralo',
  pia: 'Pia',
  filtro: 'Filtro',
  tanque: 'Tanque',
  'maquina-lavar': 'MLR',
};

export const ROTULO_RESERVATORIO = 'Reserv.';
export const ROTULO_CAIXA_INSPECAO = 'CI';

/** Louças e metais gerados por ponto de cada aparelho. */
export const LOUCAS_E_METAIS: Record<Aparelho, { descricao: string; quantidade: number }[]> = {
  vaso: [{ descricao: 'Vaso sanitário com caixa acoplada', quantidade: 1 }],
  lavatorio: [
    { descricao: 'Lavatório', quantidade: 1 },
    { descricao: 'Torneira de lavatório', quantidade: 1 },
  ],
  chuveiro: [{ descricao: 'Chuveiro', quantidade: 1 }],
  ralo: [],
  pia: [
    { descricao: 'Pia de cozinha (cuba)', quantidade: 1 },
    { descricao: 'Torneira de pia', quantidade: 1 },
  ],
  filtro: [{ descricao: 'Torneira para filtro', quantidade: 1 }],
  tanque: [
    { descricao: 'Tanque', quantidade: 1 },
    { descricao: 'Torneira de tanque', quantidade: 1 },
  ],
  'maquina-lavar': [{ descricao: 'Torneira para máquina de lavar', quantidade: 1 }],
};

/** Registros de gaveta por ambiente com pontos de água fria. */
export const REGISTROS_GAVETA_POR_AMBIENTE = 1;
/** Registros de pressão por ponto, por aparelho. */
export const REGISTROS_PRESSAO: Partial<Record<Aparelho, number>> = { chuveiro: 1 };
/** Caixas sifonadas por ambiente que tenha ralo. */
export const CAIXAS_SIFONADAS_POR_AMBIENTE_COM_RALO = 1;
/** Joelhos por transição horizontal → vertical (descida/subida de um ponto). */
export const JOELHOS_POR_TRANSICAO_VERTICAL = 1;

/** Recuo dos pontos sugeridos em relação ao perímetro do ambiente (m). */
export const RECUO_PONTO_M = 0.3;
/** Distância máxima (m) entre a extremidade de um tubo redesenhado e o ponto que ele atende. */
export const TOLERANCIA_TUBO_PONTO_M = 0.15;

/** Casas decimais dos comprimentos de tubo (m). */
export const CASAS_COMPRIMENTO = 2;
/** Casas usadas para limpar ruído binário antes de arredondar quantidades inteiras para cima. */
export const CASAS_GUARDA = 6;

export const NOME_SISTEMA: Record<SistemaHidraulico, string> = {
  AF: 'água fria',
  AQ: 'água quente',
  esgoto: 'esgoto',
  pluvial: 'águas pluviais',
};

/** Sigla usada nos rótulos das rotas na planta. */
export const SIGLA_SISTEMA: Record<SistemaHidraulico, string> = {
  AF: 'AF',
  AQ: 'AQ',
  esgoto: 'ESG',
  pluvial: 'PLUV',
};

export const SISTEMAS: SistemaHidraulico[] = ['AF', 'AQ', 'esgoto', 'pluvial'];

export const GRUPOS = {
  pontos: 'Pontos',
  tubos: 'Tubos',
  conexoes: 'Conexões',
  registros: 'Registros e caixas',
  loucas: 'Louças e metais',
  reservatorio: 'Reservatório',
} as const;

export const MENSAGENS = {
  escala: 'Calibre a escala da página para calcular a hidráulica',
  reservatorio: 'Posicione o reservatório ou a entrada de água',
  caixaInspecao: 'Posicione a caixa de inspeção ou a saída de esgoto',
  peDireito: 'Informe o pé-direito para calcular a tubulação de água',
  numeroPessoas: 'Informe o nº de pessoas para dimensionar o reservatório',
  diametroTubo: 'Informe o diâmetro do tubo desenhado',
} as const;

/** Prefixo dos ids (linhas, rotas derivadas e sugestões). */
export const PREFIXO_ID = 'hid';
