/**
 * CONTRATO — CONGELADO. Interfaces públicas dos módulos.
 *
 * Exportações obrigatórias de cada pasta (pelo index.ts / index.tsx):
 *  - '@/core/calc'            → funções de CalcApi (exportadas por nome)
 *  - '@/core/store'           → useLevantamento (hook Zustand de LevantamentoStore)
 *  - '@/features/viewer'      → Visualizador, PainelEscala, capturarPlantaComCamadas
 *  - '@/features/arq'         → moduloArquitetura: ModuloDisciplina, PainelDadosEssenciais
 *  - '@/features/estrutura'   → moduloEstrutura: ModuloDisciplina
 *  - '@/features/eletrica'    → moduloEletrica: ModuloDisciplina
 *  - '@/features/hidraulica'  → moduloHidraulica: ModuloDisciplina
 *  - '@/features/materiais'   → calcularMateriais, COMPOSICOES_PADRAO, PainelMateriais
 *  - '@/features/export'      → exportarExcel, exportarJSON, exportarPDF, PainelExportacao
 *  - '@/features/import'      → importarDXF, importarJSON, PainelImportacao, AIAnalyzer
 *  - '@/features/3d'          → Visualizacao3D
 *  - '@/app/levantamento'     → calcularLevantamento, useLevantamentoCalculado (orquestrador)
 */
import type { ComponentType } from 'react';
import type {
  Composicao,
  Disciplina,
  Elemento,
  Ferramenta,
  Levantamento,
  LinhaMaterial,
  LinhaQuantitativo,
  Parametros,
  Ponto,
  Projeto,
  ResultadoDisciplina,
  TipoEsquadria,
  TipoNo,
} from './types';

// ---------------------------------------------------------------- S2: cálculo geométrico

export interface ProjecaoSegmento {
  ponto: Ponto;
  /** Parâmetro 0..1 ao longo do segmento. */
  t: number;
  distancia: number;
}

export interface ProjecaoPolilinha extends ProjecaoSegmento {
  indiceSegmento: number;
}

export interface NoGrafo {
  id: string;
  ponto: Ponto;
  tipo: TipoNo;
  /** Nº de arestas incidentes. */
  grau: number;
}

export interface ArestaGrafo {
  id: string;
  noA: string;
  noB: string;
  /** Parede de origem. */
  paredeId: string;
  /** Comprimento em unidades do PDF. */
  comprimento: number;
}

export interface GrafoParedes {
  nos: NoGrafo[];
  arestas: ArestaGrafo[];
}

export interface CalcApi {
  // --- geometria (unidades do PDF)
  distancia(a: Ponto, b: Ponto): number;
  comprimentoPolilinha(pontos: Ponto[], fechada?: boolean): number;
  /** Área (valor absoluto, shoelace). */
  areaPoligono(pontos: Ponto[]): number;
  perimetroPoligono(pontos: Ponto[]): number;
  centroidePoligono(pontos: Ponto[]): Ponto;
  pontoEmPoligono(p: Ponto, poligono: Ponto[]): boolean;
  projetarNoSegmento(p: Ponto, a: Ponto, b: Ponto): ProjecaoSegmento;
  projetarNaPolilinha(p: Ponto, pontos: Ponto[], fechada?: boolean): ProjecaoPolilinha;
  /** Trava o ponto na horizontal/vertical em relação à origem (Shift). */
  restringirOrtogonal(origem: Ponto, p: Ponto): Ponto;
  /** Vértice candidato mais próximo dentro da tolerância, ou null. */
  snapVertice(p: Ponto, candidatos: Ponto[], tolerancia: number): Ponto | null;
  retanguloParaPoligono(a: Ponto, b: Ponto): Ponto[];
  caixaEnvolvente(pontos: Ponto[]): { minX: number; minY: number; maxX: number; maxY: number };
  // --- escala
  /** Metros por unidade a partir de 2 pontos e da medida real (m). */
  calcularEscala(p1: Ponto, p2: Ponto, medidaRealM: number): number;
  paraMetros(unidades: number, escala: number): number;
  paraM2(unidadesQuadradas: number, escala: number): number;
  paraUnidades(metros: number, escala: number): number;
  // --- grafo de paredes
  /**
   * Monta o grafo dos eixos das paredes. Une vértices dentro da tolerância, divide segmentos
   * em encontros (T) e cruzamentos (X). Classificação do nó:
   * grau 1 → 'extremidade'; grau 2 colinear → 'passagem'; grau 2 em ângulo → 'L';
   * grau 3 → 'T'; grau ≥ 4 → 'X'.
   */
  construirGrafoParedes(paredes: { id: string; pontos: Ponto[] }[], tolerancia: number): GrafoParedes;
  // --- rotas
  /** Rota ortogonal (em L: primeiro horizontal, depois vertical) entre dois pontos. */
  rotaOrtogonal(a: Ponto, b: Ponto): Ponto[];
  /** Nº de mudanças de direção de uma polilinha. */
  contarMudancasDirecao(pontos: Ponto[]): number;
  // --- formatação pt-BR
  arredondar(valor: number, casas?: number): number;
  /** Vírgula decimal e ponto de milhar: 1.234,56 */
  formatarNumero(valor: number, casas?: number): string;
  /** "12,10 m" */
  formatarQuantidade(valor: number, unidade: string, casas?: number): string;
  /** Aceita "3,07" ou "3.07"; retorna null se inválido. */
  lerNumero(texto: string): number | null;
}

// ---------------------------------------------------------------- S3: store

export interface LevantamentoStore {
  // --- estado
  projeto: Projeto;
  /** Bytes do PDF carregado (persistidos no IndexedDB, fora do Projeto). */
  pdfDados: Uint8Array | null;
  /** true depois que `inicializar` terminou de ler o IndexedDB. */
  carregado: boolean;
  paginaAtual: number;
  ferramenta: Ferramenta;
  selecaoIds: string[];
  podeDesfazer: boolean;
  podeRefazer: boolean;

  // --- ciclo de vida / persistência
  inicializar(): Promise<void>;
  novoProjeto(): Promise<void>;
  /** Substitui o projeto inteiro (JSON reimportado). */
  carregarProjeto(projeto: Projeto): void;
  definirPdf(nome: string, dados: Uint8Array, totalPaginas: number): void;
  definirNome(nome: string): void;

  // --- navegação / UI
  definirPagina(pagina: number): void;
  definirDimensoesPagina(pagina: number, largura: number, altura: number): void;
  definirFerramenta(ferramenta: Ferramenta): void;
  selecionar(ids: string[]): void;
  definirCamada(disciplina: Disciplina, visivel: boolean): void;

  // --- escala
  calibrarPagina(pagina: number, escala: number | null): void;

  // --- elementos (entram no histórico de desfazer/refazer)
  adicionarElementos(elementos: Elemento[]): void;
  /** Patch raso em ElementoBase; `props` é mesclado raso com as props atuais. */
  atualizarElemento(id: string, patch: PatchElemento): void;
  removerElementos(ids: string[]): void;
  /** pendente → confirmado. */
  confirmarElementos(ids: string[]): void;
  /** Confirma todos os pendentes (opcionalmente só de uma disciplina). */
  confirmarPendentes(disciplina?: Disciplina): void;
  /** Remove todos os pendentes (opcionalmente só de uma disciplina). */
  descartarPendentes(disciplina?: Disciplina): void;
  /**
   * Troca as sugestões automáticas: remove os elementos da disciplina com origem 'sugerido-auto'
   * e status 'pendente' (somente da página, se informada) e adiciona `novos`.
   */
  substituirSugestoes(disciplina: Disciplina, novos: Elemento[], pagina?: number): void;
  desfazer(): void;
  refazer(): void;

  // --- cadastros e parâmetros
  salvarEsquadria(tipo: TipoEsquadria): void;
  removerEsquadria(id: string): void;
  /** Mescla profunda (deep merge) nos parâmetros. */
  atualizarParametros(patch: PatchParametros): void;
  definirComposicoes(composicoes: Composicao[] | null): void;
}

export type PatchElemento = Partial<Omit<Elemento, 'id' | 'tipo' | 'props'>> & {
  props?: Record<string, unknown>;
};

export type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
export type PatchParametros = DeepPartial<Parametros>;

// ---------------------------------------------------------------- disciplinas (S4–S7)

export interface ModuloDisciplina {
  disciplina: Disciplina;
  /** Função PURA: quantitativos derivados do projeto. Elementos pendentes geram linhas 'pendente'. */
  calcular(projeto: Projeto): ResultadoDisciplina;
  /**
   * Função PURA: sugestões automáticas para a página (todas com origem 'sugerido-auto' e status
   * 'pendente'). O painel aplica com store.substituirSugestoes.
   */
  sugerir?(projeto: Projeto, pagina: number): Elemento[];
  /** Painel da etapa "3. O que medir" (coluna esquerda). Usa useLevantamento. */
  Painel: ComponentType;
}

// ---------------------------------------------------------------- S8: materiais e exportação

export interface MateriaisApi {
  COMPOSICOES_PADRAO: Composicao[];
  /** Converte linhas de serviço (via composições) + materiais diretos em lista consolidada. */
  calcularMateriais(linhas: LinhaQuantitativo[], composicoes: Composicao[]): LinhaMaterial[];
}

export interface ExportApi {
  /** Bytes do .xlsx com as abas Resumo, Ambientes, Esquadrias, Paredes, Acabamentos, Estrutura, Elétrica, Hidráulica, Materiais. */
  exportarExcel(projeto: Projeto, levantamento: Levantamento): Uint8Array;
  /** JSON completo e reimportável do projeto. */
  exportarJSON(projeto: Projeto): string;
  /** Abre a impressão/“Salvar como PDF” da planta com as camadas (imagem vinda do viewer). */
  exportarPDF(imagemDataUrl: string, titulo: string): void;
}

// ---------------------------------------------------------------- S1: viewer

export interface ViewerApi {
  /** Coluna central: PDF + camadas + barra de ferramentas + páginas/zoom. */
  Visualizador: ComponentType;
  /** Etapa "1. Escala" (coluna esquerda). */
  PainelEscala: ComponentType;
  /** PNG (data URL) da página atual com as camadas visíveis; null se não houver planta. */
  capturarPlantaComCamadas(): Promise<string | null>;
}

// ---------------------------------------------------------------- S9: importação

export interface ResultadoImportacao {
  /** Elementos candidatos — todos com origem 'importado' e status 'pendente'. */
  elementos: Elemento[];
  /** O que falta preencher / avisos. */
  pendencias: string[];
}

/** "Recortes IA" — apenas stub; NENHUMA chamada de API. */
export interface AIAnalyzer {
  disponivel: boolean;
  analisarRecorte(imagem: Blob, pagina: number): Promise<ResultadoImportacao>;
}
