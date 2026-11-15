/**
 * Configuração do núcleo de cálculo: tolerâncias e casas decimais padrão.
 * Tudo aqui é constante — nenhum número mágico deve ficar espalhado nos outros arquivos.
 */

/** Casas decimais padrão de arredondamento/formatação (ex.: "12,10 m"). */
export const CASAS_PADRAO = 2;

/** Dígitos significativos confiáveis de um double; usado para limpar ruído binário antes de arredondar. */
export const DIGITOS_SIGNIFICATIVOS = 15;

/** Tolerância geométrica mínima (unidades do PDF) para comparações "exatas" (ponto sobre aresta, alinhamento). */
export const EPSILON_GEOMETRICO = 1e-9;

/** Abaixo deste seno do ângulo entre dois segmentos eles são tratados como paralelos (cálculo de interseção). */
export const EPSILON_PARALELISMO = 1e-9;

/**
 * Desvio angular máximo (graus) para dois trechos ainda contarem como "mesma direção":
 * nó de grau 2 dentro desse desvio é 'passagem' (não 'L'), e a polilinha não conta mudança de direção.
 */
export const TOLERANCIA_ANGULAR_GRAUS = 5;

/** Separadores pt-BR. */
export const SEPARADOR_DECIMAL = ',';
export const SEPARADOR_MILHAR = '.';

/** Texto exibido para valores não numéricos (NaN/infinito). */
export const TEXTO_VALOR_INVALIDO = '—';

/** Prefixos dos ids determinísticos do grafo de paredes (n1.., a1..). */
export const PREFIXO_ID_NO = 'n';
export const PREFIXO_ID_ARESTA = 'a';
