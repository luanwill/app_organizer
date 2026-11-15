/** Constantes e tolerâncias da importação (DXF/JSON). */
import type { TipoAmbiente } from '@/core/model';

export type UnidadeDxf = 'm' | 'cm' | 'mm';

/** Metros por unidade do desenho, conforme a unidade ESCOLHIDA pelo usuário (nunca presumida). */
export const METROS_POR_UNIDADE_DXF: Record<UnidadeDxf, number> = { m: 1, cm: 0.01, mm: 0.001 };

export const ROTULO_UNIDADE_DXF: Record<UnidadeDxf, string> = {
  m: 'metros (m)',
  cm: 'centímetros (cm)',
  mm: 'milímetros (mm)',
};

/** Margem (fração de cada lado da página) ao encaixar o desenho do DXF. */
export const MARGEM_PAGINA_FRACAO = 0.05;

/** Planta em branco criada quando não há PDF carregado: A3 paisagem, em pontos. */
export const PAGINA_EM_BRANCO = { largura: 1190.55, altura: 841.89 };
export const NOME_PDF_EM_BRANCO = 'importado.pdf';

/** Detecção de paredes por pares de linhas paralelas. */
export const PAREDE_DXF = {
  /** Distância mínima/máxima entre as duas faces (m). */
  distanciaMinM: 0.05,
  distanciaMaxM: 0.4,
  /** Folga numérica na comparação das distâncias (m). */
  folgaDistanciaM: 1e-6,
  /** Desvio angular máximo entre as duas linhas (graus). */
  toleranciaAngularGraus: 2,
  /** Sobreposição longitudinal mínima para formar uma parede (m). */
  sobreposicaoMinM: 0.1,
  /** Casas decimais da espessura (2 = centímetro). */
  casasEspessura: 2,
};

/** Dois vértices a menos que esta fração da diagonal do desenho são o mesmo ponto (polilinha fechada). */
export const TOLERANCIA_FECHAMENTO_FRACAO = 1e-9;

export const MINIMO_VERTICES_POLIGONO = 3;

export interface RegraAmbiente {
  tipo: TipoAmbiente;
  areaMolhada: boolean;
  /** Trechos procurados no texto sem acentos e em minúsculas. A ordem das regras é a prioridade. */
  palavras: string[];
}

export const PALAVRAS_CHAVE_AMBIENTE: RegraAmbiente[] = [
  { tipo: 'banheiro', areaMolhada: true, palavras: ['banh', 'wc', 'lavabo', 'sanit'] },
  { tipo: 'area-servico', areaMolhada: true, palavras: ['serv', 'lavand'] },
  { tipo: 'cozinha', areaMolhada: true, palavras: ['coz', 'copa'] },
  { tipo: 'quarto', areaMolhada: false, palavras: ['quarto', 'dorm', 'suite'] },
  { tipo: 'sala', areaMolhada: false, palavras: ['sala', 'estar', 'jantar'] },
  { tipo: 'circulacao', areaMolhada: false, palavras: ['circ', 'hall', 'corredor'] },
  { tipo: 'varanda', areaMolhada: false, palavras: ['varanda', 'sacada', 'terraco'] },
  { tipo: 'garagem', areaMolhada: false, palavras: ['garagem', 'abrigo'] },
];

/** Tipos de ambiente que são área molhada quando o tipo vem explícito (JSON). */
export const TIPOS_AREA_MOLHADA: TipoAmbiente[] = ['banheiro', 'cozinha', 'area-servico'];

export const TIPOS_AMBIENTE: TipoAmbiente[] = [
  'sala',
  'quarto',
  'cozinha',
  'area-servico',
  'banheiro',
  'circulacao',
  'varanda',
  'garagem',
  'outro',
];

/** Envelope do JSON exportado pelo próprio app (S8). */
export const FORMATO_APP = 'bim-leve';
export const VERSAO_ENVELOPE = 1;
export const VERSAO_PROJETO = 1;

/** Casas decimais das coordenadas e dimensões escritas no PDF em branco. */
export const CASAS_PDF = 2;

export const TEXTO_EM_BREVE = 'em breve';
