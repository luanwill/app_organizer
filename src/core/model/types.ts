/**
 * CONTRATO DE DADOS — CONGELADO.
 * Nenhum subagente pode alterar este arquivo. Mudanças: reportar ao orquestrador.
 *
 * Convenções:
 * - Geometria SEMPRE em coordenadas do PDF (unidades da página em escala 1, origem no canto
 *   superior esquerdo, y para baixo).
 * - Conversão para metros: metros = unidadesPDF × PaginaInfo.escala (m por unidade).
 * - Propriedades dimensionais (seções, alturas, espessuras) SEMPRE em metros, salvo indicação (mm).
 * - Quantidades são derivadas de geometria + propriedades. Valor manual só com a flag `manuais`.
 * - Dado ausente = null → gerar Alerta "dado faltante". Nunca assumir valor silenciosamente.
 */

// ---------------------------------------------------------------- básicos

export interface Ponto {
  x: number;
  y: number;
}

export type Disciplina = 'arquitetura' | 'estrutura' | 'eletrica' | 'hidraulica' | 'materiais';

export type Origem = 'desenhado' | 'sugerido-auto' | 'importado';
export type Status = 'pendente' | 'confirmado';

export type Geometria =
  | { tipo: 'ponto'; ponto: Ponto }
  | { tipo: 'polilinha'; pontos: Ponto[] }
  | { tipo: 'poligono'; pontos: Ponto[] }; // fechado implicitamente (não repetir o 1º ponto)

// ---------------------------------------------------------------- propriedades por tipo

export type TipoAmbiente =
  | 'sala'
  | 'quarto'
  | 'cozinha'
  | 'area-servico'
  | 'banheiro'
  | 'circulacao'
  | 'varanda'
  | 'garagem'
  | 'outro';

export type TipoTUE =
  | 'chuveiro'
  | 'micro-ondas'
  | 'ar-condicionado'
  | 'forno-eletrico'
  | 'maquina-lavar'
  | 'torneira-eletrica';

export interface PropsAmbiente {
  nome: string;
  tipoAmbiente: TipoAmbiente;
  areaMolhada: boolean;
  /** Ambiente coberto (entra na laje). */
  coberto: boolean;
  /** Pé-direito próprio (m). null/undefined → usa parametros.gerais.peDireito. */
  peDireito?: number | null;
  /** TUEs selecionadas para o ambiente (elétrica). */
  tues?: TipoTUE[];
  /** Ambiente com água quente (hidráulica). */
  aguaQuente?: boolean;
}

export interface PropsParede {
  /** Espessura (m). null → alerta de dado faltante. */
  espessura: number | null;
  /** Altura própria (m). null/undefined → pé-direito geral. */
  altura?: number | null;
}

export interface PropsEsquadria {
  /** id do TipoEsquadria no cadastro (Projeto.esquadrias). */
  tipoEsquadriaId: string;
}

export type ModoMedicao = 'distancia' | 'polilinha' | 'poligono' | 'retangulo' | 'contagem';

export interface PropsMedicao {
  modo: ModoMedicao;
  descricao: string;
}

export type TipoNo = 'L' | 'T' | 'X' | 'extremidade' | 'passagem';

export interface PropsPilar {
  secaoB: number; // m
  secaoH: number; // m
  /** Altura própria (m). null/undefined → pé-direito + altura da viga superior. */
  altura?: number | null;
  /** Como o pilar nasceu. */
  noTipo?: TipoNo | 'intermediario';
}

export interface PropsViga {
  secaoB: number; // m
  secaoH: number; // m
}

export type TipoLaje = 'macica' | 'trelicada-eps' | 'trelicada-lajota';

export interface PropsLaje {
  tipoLaje: TipoLaje;
  /** Espessura total (m). */
  espessura: number;
}

// ---- cobertura (adicionado com autorização do usuário: telhado e calhas)

export type TipoTelha = 'ceramica' | 'concreto' | 'fibrocimento' | 'metalica' | 'sanduiche';

/** Telhado: geometria = polígono da projeção horizontal (já com beiral). */
export interface PropsTelhado {
  /** null = não informado (gera "dado faltante"; não há telha padrão). */
  tipoTelha: TipoTelha | null;
  /** Inclinação (%); null = usar a do tipo de telha nos parâmetros. */
  inclinacaoPct: number | null;
  /** Nº de águas. */
  aguas: 1 | 2 | 4;
  /** Direção da cumeeira (2 águas) ou do caimento (1 água) na planta. */
  direcao: 'horizontal' | 'vertical';
  /** Beiral incluído na geometria (m), informativo. */
  beiral: number;
}

export type FuncaoCalha = 'calha' | 'rufo' | 'condutor';

/** Calha/rufo: polilinha ao longo da borda; condutor vertical: ponto (comprimento = altura). */
export interface PropsCalha {
  funcao: FuncaoCalha;
  /** Desenvolvimento da chapa (cm) — calha/rufo. */
  desenvolvimentoCm?: number | null;
  /** Diâmetro (mm) — condutor. */
  diametroMm?: number | null;
}

export type TipoFundacao = 'sapata' | 'bloco-estaca' | 'radier';

export interface PropsFundacao {
  tipoFundacao: TipoFundacao;
}

export type TipoPontoEletrico = 'luz' | 'tug' | 'tue' | 'interruptor';
export type AlturaPonto = 'baixa' | 'media' | 'alta' | 'teto' | 'interruptor';

export interface PropsPontoEletrico {
  tipoPonto: TipoPontoEletrico;
  potenciaVA: number;
  altura: AlturaPonto;
  /** Para TUE: qual equipamento. */
  tue?: TipoTUE;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PropsQuadro {}

/** Rota de eletroduto redesenhada pelo usuário; vinculos.alvoId = id do ponto elétrico. */
export interface PropsEletroduto {
  diametroMm?: number | null;
}

export type Aparelho =
  | 'vaso'
  | 'lavatorio'
  | 'chuveiro'
  | 'ralo'
  | 'pia'
  | 'filtro'
  | 'tanque'
  | 'maquina-lavar';

export interface PropsPontoHidraulico {
  aparelho: Aparelho;
  aguaFria: boolean;
  aguaQuente: boolean;
  esgoto: boolean;
  /** Diâmetros próprios (mm). null/undefined → parametros.hidraulica. */
  diametroAF?: number | null;
  diametroAQ?: number | null;
  diametroEsgoto?: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PropsReservatorio {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PropsCaixaInspecao {}

export type SistemaHidraulico = 'AF' | 'AQ' | 'esgoto' | 'pluvial';

/** Rota de tubo redesenhada pelo usuário; vinculos.alvoId = id do ponto hidráulico. */
export interface PropsTubo {
  sistema: SistemaHidraulico;
  diametroMm?: number | null;
}

/** Mapa tipo de elemento → propriedades e geometria esperada. */
export interface PropsPorTipo {
  // arquitetura
  ambiente: PropsAmbiente; // poligono
  parede: PropsParede; // polilinha (eixo)
  esquadria: PropsEsquadria; // ponto (centro do vão, sobre o eixo da parede hospedeira)
  medicao: PropsMedicao; // ponto | polilinha | poligono
  // estrutura
  pilar: PropsPilar; // ponto
  'viga-baldrame': PropsViga; // polilinha (2 pontos: trecho entre pilares)
  'viga-superior': PropsViga; // polilinha (2 pontos)
  laje: PropsLaje; // poligono
  fundacao: PropsFundacao; // ponto (sapata/bloco) | poligono (radier)
  telhado: PropsTelhado; // poligono (projeção horizontal com beiral)
  calha: PropsCalha; // polilinha (calha/rufo) | ponto (condutor)
  // elétrica
  'ponto-eletrico': PropsPontoEletrico; // ponto
  quadro: PropsQuadro; // ponto
  eletroduto: PropsEletroduto; // polilinha
  // hidráulica
  'ponto-hidraulico': PropsPontoHidraulico; // ponto
  reservatorio: PropsReservatorio; // ponto
  'caixa-inspecao': PropsCaixaInspecao; // ponto
  tubo: PropsTubo; // polilinha
}

export type TipoElemento = keyof PropsPorTipo;

/** Disciplina dona de cada tipo de elemento. */
export const DISCIPLINA_DO_TIPO: Record<TipoElemento, Disciplina> = {
  ambiente: 'arquitetura',
  parede: 'arquitetura',
  esquadria: 'arquitetura',
  medicao: 'arquitetura',
  pilar: 'estrutura',
  'viga-baldrame': 'estrutura',
  'viga-superior': 'estrutura',
  laje: 'estrutura',
  fundacao: 'estrutura',
  telhado: 'estrutura',
  calha: 'estrutura',
  'ponto-eletrico': 'eletrica',
  quadro: 'eletrica',
  eletroduto: 'eletrica',
  'ponto-hidraulico': 'hidraulica',
  reservatorio: 'hidraulica',
  'caixa-inspecao': 'hidraulica',
  tubo: 'hidraulica',
};

// ---------------------------------------------------------------- elemento

export interface Vinculos {
  /** Ambiente ao qual o elemento pertence. */
  ambienteId?: string;
  /** Ambientes cobertos por uma laje. */
  ambienteIds?: string[];
  /** Telhado atendido por uma calha/rufo/condutor. */
  telhadoId?: string;
  /** Parede hospedeira (esquadria) ou parede sob/sobre a viga. */
  paredeId?: string;
  /** Pilar sobre a fundação. */
  pilarId?: string;
  /** Elementos apoiados neste (ex.: vigas apoiadas num pilar). */
  apoiadosIds?: string[];
  /** Ponto atendido por uma rota redesenhada (eletroduto/tubo). */
  alvoId?: string;
}

export interface ElementoBase {
  id: string;
  disciplina: Disciplina;
  /** Página do PDF (1-based). */
  pagina: number;
  geometria: Geometria;
  vinculos: Vinculos;
  origem: Origem;
  status: Status;
  /** Rótulo exibido na planta e na árvore (P1, VB3, L2, "Sala"...). */
  rotulo?: string;
  /**
   * Valores manuais (flag "valor manual"): chave = nome da quantidade
   * (ex.: 'area', 'comprimento', 'altura'), valor na unidade métrica da quantidade.
   * Quando presente, substitui o valor derivado e a linha sai com manual=true.
   */
  manuais?: Record<string, number>;
}

export type ElementoDe<K extends TipoElemento> = ElementoBase & {
  tipo: K;
  props: PropsPorTipo[K];
};

export type Elemento = { [K in TipoElemento]: ElementoDe<K> }[TipoElemento];

// ---------------------------------------------------------------- cadastro de esquadrias

export interface TipoEsquadria {
  id: string;
  /** Código: P1, J1... */
  codigo: string;
  categoria: 'porta' | 'janela';
  largura: number; // m
  altura: number; // m
  peitoril: number; // m (0 para portas)
  /** Quantidade prevista no projeto (informativa; a contagem real vem das posicionadas). */
  quantidade: number;
}

// ---------------------------------------------------------------- parâmetros

export interface ParametrosGerais {
  /** Pé-direito (m). null → alerta "dado faltante". */
  peDireito: number | null;
  /** Espessura padrão das paredes novas (m). null → alerta. */
  espessuraParede: number | null;
  /** Nº de pessoas (reservatório). null → alerta. */
  numeroPessoas: number | null;
}

export type ModoDescontoVao = 'acima-do-limite' | 'todos' | 'nenhum';

export interface ParametrosArquitetura {
  modoDescontoVao: ModoDescontoVao;
  /** Descontar vãos com área maior que este limite (m²). Padrão 2. */
  limiteDescontoVaoM2: number;
  /** Subida da impermeabilização nas áreas molhadas (m). Padrão 0,30. */
  subidaImpermeabilizacao: number;
  demaosPintura: number;
}

export interface ArmaduraDetalhada {
  barrasLongitudinais: number; // nº de barras
  bitolaLongitudinalMm: number;
  bitolaEstriboMm: number;
  espacamentoEstribo: number; // m
}

export interface ParametrosEstrutura {
  vaoMaximo: number; // m (padrão 4,00)
  distanciaFusao: number; // m (padrão 0,50)
  pilar: { secaoB: number; secaoH: number };
  baldrame: { secaoB: number; secaoH: number };
  vigaSuperior: { ativa: boolean; secaoB: number; secaoH: number };
  fck: number; // MPa
  cobrimento: number; // m
  aco: {
    modo: 'taxa' | 'detalhado';
    taxaPilar: number; // kg/m³
    taxaViga: number; // kg/m³
    taxaLaje: number; // kg/m³
    taxaFundacao: number; // kg/m³
    detalhado: ArmaduraDetalhada;
  };
  laje: {
    tipo: TipoLaje;
    modo: 'por-ambiente' | 'uniao';
    espessura: number; // m (total)
    intereixo: number; // m (treliçadas)
  };
  fundacao: {
    tipo: TipoFundacao;
    sapata: { ladoA: number; ladoB: number; altura: number; profundidade: number };
    bloco: {
      ladoA: number;
      ladoB: number;
      altura: number;
      estacasPorBloco: number;
      diametroEstaca: number;
      comprimentoEstaca: number;
    };
    radier: { espessura: number };
    espessuraLastro: number; // m
  };
  cobertura: ParametrosCobertura;
}

export interface ParametrosCobertura {
  /** Beiral padrão das sugestões (m). */
  beiral: number;
  /** Inclinação padrão (%) por tipo de telha. */
  inclinacaoPct: Record<TipoTelha, number>;
  /** Altura do condutor vertical (m); null = usar o pé-direito. */
  alturaCondutor: number | null;
  /** Comprimento máximo de calha atendido por um condutor (m). */
  calhaPorCondutorM: number;
  desenvolvimentoCalhaCm: number;
  desenvolvimentoRufoCm: number;
  diametroCondutorMm: number;
}

export interface ParametrosEletrica {
  limiteVAPorCircuito: number;
  tensao: 127 | 220;
  /** Altura de instalação (m) por posição. */
  alturas: { baixa: number; media: number; alta: number; interruptor: number };
  /** Potência por TUG (VA). */
  potenciaTUG: number;
  /** Potência por TUE (VA). */
  potenciaTUE: Record<TipoTUE, number>;
  /** Seção dos condutores (mm²). */
  secoes: { iluminacao: number; tug: number; tue: Record<TipoTUE, number> };
  /** Nº de condutores por circuito no eletroduto. */
  condutores: { iluminacao: number; tug: number; tue: number };
  diametroEletrodutoMm: number;
}

export interface ParametrosHidraulica {
  diametroAFmm: number; // padrão 25
  diametroAQmm: number;
  /** Diâmetro de esgoto (mm) por aparelho. */
  diametroEsgotoMm: Record<Aparelho, number>;
  /** Altura do ponto de água (m) por aparelho. */
  alturaPontoM: Record<Aparelho, number>;
  consumoPerCapitaL: number; // L/pessoa/dia
  diasReserva: number;
  percentualConexoesDiversas: number; // %
  pluvial: boolean;
  comprimentoBarraM: number; // 6
}

export interface Parametros {
  gerais: ParametrosGerais;
  arquitetura: ParametrosArquitetura;
  estrutura: ParametrosEstrutura;
  eletrica: ParametrosEletrica;
  hidraulica: ParametrosHidraulica;
}

// ---------------------------------------------------------------- composições / serviços

/** Códigos de serviço que as disciplinas emitem e as composições (S8) consomem. */
export const SERVICOS = {
  alvenaria: { descricao: 'Alvenaria de bloco cerâmico 14×19×29', unidade: 'm²' },
  chapisco: { descricao: 'Chapisco', unidade: 'm²' },
  emboco: { descricao: 'Emboço', unidade: 'm²' },
  reboco: { descricao: 'Reboco', unidade: 'm²' },
  contrapiso: { descricao: 'Contrapiso', unidade: 'm²' },
  piso: { descricao: 'Piso cerâmico', unidade: 'm²' },
  rodape: { descricao: 'Rodapé', unidade: 'm' },
  'revestimento-parede': { descricao: 'Revestimento cerâmico de parede', unidade: 'm²' },
  'pintura-parede': { descricao: 'Pintura de parede', unidade: 'm²' },
  'pintura-teto': { descricao: 'Pintura de teto', unidade: 'm²' },
  impermeabilizacao: { descricao: 'Impermeabilização', unidade: 'm²' },
  concreto: { descricao: 'Concreto estrutural', unidade: 'm³' },
  forma: { descricao: 'Forma de madeira', unidade: 'm²' },
  aco: { descricao: 'Aço CA-50/CA-60', unidade: 'kg' },
  lastro: { descricao: 'Lastro de concreto magro', unidade: 'm³' },
  escavacao: { descricao: 'Escavação', unidade: 'm³' },
  telhamento: { descricao: 'Telhamento', unidade: 'm²' },
  madeiramento: { descricao: 'Estrutura do telhado', unidade: 'm²' },
  cumeeira: { descricao: 'Cumeeira / espigão', unidade: 'm' },
  calha: { descricao: 'Calha', unidade: 'm' },
  rufo: { descricao: 'Rufo', unidade: 'm' },
  condutor: { descricao: 'Condutor vertical', unidade: 'm' },
} as const;

export type CodigoServico = keyof typeof SERVICOS;

export interface InsumoComposicao {
  material: string;
  unidade: string;
  /** Quantidade de material por unidade de serviço. */
  coeficiente: number;
  perdaPct: number;
}

export interface Composicao {
  id: string;
  servico: CodigoServico;
  /** Filtro opcional pelo `detalhe` da linha (ex.: 'fck 25'). Vazio = qualquer. */
  detalhe?: string;
  insumos: InsumoComposicao[];
}

// ---------------------------------------------------------------- projeto

export interface PaginaInfo {
  /** Metros por unidade do PDF. null = página não calibrada (medições bloqueadas). */
  escala: number | null;
  largura?: number;
  altura?: number;
}

export interface Projeto {
  id: string;
  nome: string;
  versao: 1;
  criadoEm: string; // ISO
  atualizadoEm: string; // ISO
  /** Nome do arquivo de planta (o binário fica fora do Projeto, no IndexedDB). */
  arquivoNome: string | null;
  totalPaginas: number;
  paginas: Record<number, PaginaInfo>;
  elementos: Elemento[];
  esquadrias: TipoEsquadria[];
  parametros: Parametros;
  /** null = usar composições padrão do módulo de materiais. */
  composicoes: Composicao[] | null;
  camadas: Record<Disciplina, boolean>;
}

// ---------------------------------------------------------------- quantitativos

/** Grupos fixos (viram abas/ramos). */
export type GrupoArquitetura = 'Ambientes' | 'Esquadrias' | 'Paredes' | 'Acabamentos' | 'Medições';

export interface LinhaQuantitativo {
  /** Id estável (ex.: `${elementoId}:area`). */
  id: string;
  disciplina: Disciplina;
  /** Ramo da árvore. Arquitetura usa GrupoArquitetura. */
  grupo: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  /** 'confirmado' entra nos totais finais; 'pendente' é somado à parte. */
  status: Status;
  elementoIds: string[];
  /** Serviço para conversão em materiais (S8). */
  servico?: CodigoServico;
  /** A linha já é um material/insumo (tubo, fio, EPS...) e vai direto ao consolidado. */
  ehMaterial?: boolean;
  /** Detalhe de agrupamento: bitola, diâmetro, fck, seção... */
  detalhe?: string;
  /** Algum valor desta linha veio de `manuais`. */
  manual?: boolean;
}

export interface Alerta {
  disciplina: Disciplina;
  elementoId?: string;
  /** Campo faltante (ex.: 'peDireito'). */
  campo: string;
  mensagem: string;
}

/** Geometria derivada (não é elemento) para a planta desenhar: rotas automáticas etc. */
export interface GeometriaDerivada {
  id: string;
  disciplina: Disciplina;
  pagina: number;
  pontos: Ponto[];
  status: Status;
  rotulo?: string;
  /** Elemento ao qual se refere (para seleção). */
  elementoId?: string;
}

export interface ResultadoDisciplina {
  linhas: LinhaQuantitativo[];
  alertas: Alerta[];
  derivados?: GeometriaDerivada[];
}

export interface LinhaMaterial {
  id: string;
  material: string;
  unidade: string;
  quantidade: number;
  status: Status;
  /** De onde veio: serviço (composição) ou disciplina (material direto). */
  origem: string;
}

/** Levantamento consolidado (calculado pelo orquestrador em src/app). */
export interface Levantamento {
  arquitetura: ResultadoDisciplina;
  estrutura: ResultadoDisciplina;
  eletrica: ResultadoDisciplina;
  hidraulica: ResultadoDisciplina;
  materiais: LinhaMaterial[];
}

// ---------------------------------------------------------------- ferramentas de desenho

export type ModoFerramenta =
  | 'selecionar'
  | 'pan'
  | 'calibrar'
  | 'distancia'
  | 'polilinha'
  | 'poligono'
  | 'retangulo'
  | 'contagem'
  | 'parede'
  | 'ponto';

/**
 * O que a ferramenta cria ao concluir o desenho. Sem alvo, cria `medicao`.
 * - modo 'parede' sempre cria `parede` (espessura = parametros.gerais.espessuraParede).
 * - alvo.tipo === 'esquadria': o ponto é projetado na parede mais próxima e vinculos.paredeId é preenchido.
 * - elementos de geometria 'ponto' recebem vinculos.ambienteId se caírem dentro de um ambiente.
 */
export interface AlvoDesenho {
  tipo: TipoElemento;
  props: PropsPorTipo[TipoElemento];
  rotulo?: string;
}

export interface Ferramenta {
  modo: ModoFerramenta;
  alvo?: AlvoDesenho;
}
