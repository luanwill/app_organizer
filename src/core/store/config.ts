/** Constantes da store e da persistência (sem números mágicos espalhados). */

/** Nome do banco IndexedDB. */
export const NOME_BANCO = 'bim-leve-quantitativos';
export const VERSAO_BANCO = 1;
/** Tabela do projeto (registro único) e tabela dos arquivos (bytes do PDF). */
export const TABELA_PROJETOS = 'projetos';
export const TABELA_ARQUIVOS = 'arquivos';
/** Chave do registro único (projeto atual / PDF atual). */
export const CHAVE_ATUAL = 'atual';

/** Espera (ms) entre a última alteração e o salvamento automático. */
export const DEBOUNCE_SALVAMENTO_MS = 400;
/** Máximo de passos guardados para desfazer. */
export const LIMITE_HISTORICO = 100;

export const PAGINA_INICIAL = 1;
