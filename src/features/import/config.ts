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

export interface ConfigParede {
  distanciaMinM: number;
  distanciaMaxM: number;
  folgaDistanciaM: number;
  toleranciaAngularGraus: number;
  sobreposicaoMinM: number;
  casasEspessura: number;
}

/** Detecção de paredes por pares de linhas paralelas. */
export const PAREDE_DXF: ConfigParede = {
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
  /**
   * Inícios de palavra procurados no texto sem acentos e em minúsculas ("coz" casa "COZINHA", mas "serv" não
   * casa "obSERVação"). Num nome composto vale o termo que aparece PRIMEIRO; a área é molhada se QUALQUER
   * termo for de área molhada ("SALA E COZINHA" → sala, molhada).
   */
  palavras: string[];
}

export const PALAVRAS_CHAVE_AMBIENTE: RegraAmbiente[] = [
  { tipo: 'banheiro', areaMolhada: true, palavras: ['banh', 'wc', 'lavabo', 'sanit', 'toalete'] },
  { tipo: 'area-servico', areaMolhada: true, palavras: ['serv', 'lavand'] },
  { tipo: 'cozinha', areaMolhada: true, palavras: ['coz', 'copa'] },
  { tipo: 'quarto', areaMolhada: false, palavras: ['quarto', 'dorm', 'suite'] },
  { tipo: 'sala', areaMolhada: false, palavras: ['sala', 'estar', 'jantar', 'living'] },
  { tipo: 'circulacao', areaMolhada: false, palavras: ['circ', 'hall', 'corredor', 'escada'] },
  { tipo: 'varanda', areaMolhada: false, palavras: ['varanda', 'sacada', 'terraco', 'alpendre', 'deck'] },
  { tipo: 'garagem', areaMolhada: false, palavras: ['garagem', 'abrigo'] },
  // cômodos sem tipo próprio no contrato: são cômodos (contam para achar a planta), mas ficam 'outro'
  { tipo: 'outro', areaMolhada: false, palavras: ['closet', 'deposito', 'despensa', 'escritorio', 'estudo', 'gourmet', 'churrasq'] },
];

/** Textos que nunca são nome de ambiente (títulos, carimbo, entorno), conferidos pelo início da 1ª palavra. */
export const TEXTOS_NAO_AMBIENTE = [
  'planta',
  'corte',
  'fachada',
  'elevacao',
  'cobertura',
  'situacao',
  'locacao',
  'escala',
  'esc.',
  'calcada',
  'passeio',
  'rua',
  'avenida',
  'detalhe',
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

/** Reconhecimento de paredes e ambientes nos traços de um PDF vetorial. */
export const RECONHECIMENTO_PDF = {
  /** Prefixo dos ids gerados: permite trocar o resultado anterior ao reconhecer de novo. */
  prefixoId: 'pdfvet-',
  /** Traços mais curtos que isto (m) são ruído (hachuras, símbolos, letras em curvas). */
  comprimentoMinSegmentoM: 0.1,
  /** Faixa de espessura mais estreita que a do DXF: no PDF há hachuras e mobiliário entre os traços. */
  parede: {
    distanciaMinM: 0.08,
    distanciaMaxM: 0.26,
    folgaDistanciaM: 1e-6,
    toleranciaAngularGraus: 2,
    sobreposicaoMinM: 0.1,
    casasEspessura: 2,
  } satisfies ConfigParede,
  /** Trechos colineares de mesma espessura separados por até isto (m) viram uma parede só (vão de porta/passagem). */
  vaoMaximoM: 1.6,
  /** Vão livre máximo (m) fechado a partir da PONTA de uma parede até a parede perpendicular seguinte (porta de canto). */
  vaoMaximoNaPontaM: 1.2,
  /** Diferença máxima de espessura (m) entre trechos da mesma parede. */
  toleranciaEspessuraM: 0.011,
  /** Desalinhamento lateral máximo (m) entre trechos da mesma parede. */
  toleranciaColinearM: 0.02,
  /** Traços com as mesmas extremidades dentro desta malha (m) são o mesmo traço repetido. */
  toleranciaRepetidoM: 0.005,
  /** Uma candidata é descartada quando mais que esta fração do seu comprimento cai dentro do corpo de outra parede. */
  fracaoSobreposicaoCorpo: 0.5,
  /** Pontos do eixo examinados para saber se uma candidata corre dentro do corpo de outra parede. */
  amostrasCorpo: 8,
  /** Folga (m), além da meia espessura das duas paredes, para estender um eixo até o encontro com outro. */
  folgaJuncaoM: 0.05,
  /** Vértices de eixos mais próximos que isto (m) são o mesmo nó. */
  toleranciaNoM: 0.02,
  /** Faces menores que isto (m²) não são ambientes (shafts, pilares, sobras entre traços). */
  areaMinAmbienteM2: 1,
  /** Uma espessura é "de parede" quando responde por ao menos esta fração do contorno dos cômodos nomeados. */
  fracaoEspessuraReferencia: 0.15,
  /** Diferença relativa aceita entre a área reconhecida e a área escrita na planta ("11,06 m²"). */
  toleranciaAreaEscrita: 0.03,
  /** Acima disto o reconhecimento não roda (a comparação par a par travaria o navegador). */
  maxSegmentos: 8000,
  /** Vãos com desenho de esquadria (janela, porta de correr): linhas paralelas dentro da faixa da parede. */
  esquadria: {
    /** Vão máximo (m) fechado quando há esquadria desenhada (sem ela, valem `vaoMaximoM` e `vaoMaximoNaPontaM`). */
    vaoMaximoM: 3.5,
    /** Linhas distintas (caixilho, vidro, folhas) dentro da faixa — uma linha só pode ser o piso. */
    linhasMin: 2,
    /** Fração do vão que cada uma dessas linhas precisa cobrir (folhas de correr cobrem só parte). */
    coberturaLinhaMin: 0.2,
    /** Fração do vão coberta pela união de todas as linhas dentro da faixa. */
    coberturaMin: 0.6,
    /** As linhas precisam estar a pelo menos isto (m) para dentro das faces (linha de piso na face não conta). */
    margemFaceM: 0.02,
    /** Linhas a menos que isto (m) de distância lateral contam como a mesma linha. */
    agrupamentoLateralM: 0.01,
    /** Célula da grade de busca dos traços (m). */
    celulaIndiceM: 1,
  },
  /** Portas: evidência para levar a ponta de uma parede até a parede da frente (porta de canto). */
  porta: {
    /** Tamanho da folha (ou da corda do giro ÷ √2) em relação ao vão: mínimo e máximo. */
    fracaoMinima: 0.6,
    fracaoMaxima: 1.15,
    /** Distância máxima (m), além da espessura da parede, entre a folha/arco e um dos batentes do vão. */
    folgaBatenteM: 0.1,
    /** Ângulo mínimo (graus) entre a folha aberta e o vão. */
    anguloMinGraus: 60,
    /** A folha é um retângulo fino: distância (m) entre os dois traços longos e quanto um cobre o outro
     *  (também a razão mínima entre os comprimentos dos dois). */
    espessuraFolhaMinM: 0.015,
    espessuraFolhaMaxM: 0.08,
    sobreposicaoFolha: 0.8,
  },
  /** Paredes preenchidas (poché). */
  poche: {
    /** Cores mais claras que isto (luminância 0–1) não são analisadas como parede (fundo, piso, papel). */
    luminanciaMaxima: 0.9,
    /** Pontos do eixo (fração do comprimento) que precisam cair dentro do preenchimento. */
    amostrasDentro: [0.25, 0.5, 0.75],
    /** Quantas cores (as que mais rendem parede) entram na comparação com o método de traço duplo. */
    maxCores: 3,
  },
  /** Com menos traços que isto a página é tratada como não vetorial (imagem/escaneado). */
  minSegmentosVetorial: 4,
};
