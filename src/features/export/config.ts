/** Exportação (S8) — nomes, rótulos e formatos (sem números mágicos no código). */
import type { GrupoArquitetura } from '@/core/model';

export const FORMATO_JSON = 'bim-leve';
export const VERSAO_JSON = 1;
export const INDENTACAO_JSON = 2;

/** Abas do Excel, nesta ordem. */
export const ABAS = {
  resumo: 'Resumo',
  ambientes: 'Ambientes',
  esquadrias: 'Esquadrias',
  paredes: 'Paredes',
  acabamentos: 'Acabamentos',
  estrutura: 'Estrutura',
  eletrica: 'Elétrica',
  hidraulica: 'Hidráulica',
  materiais: 'Materiais',
} as const;

/** Abas de arquitetura = grupos de mesmo nome. O grupo 'Medições' aparece somente no Resumo. */
export const GRUPOS_ARQUITETURA_COM_ABA: GrupoArquitetura[] = ['Ambientes', 'Esquadrias', 'Paredes', 'Acabamentos'];

export const COLUNAS_DETALHE = ['Grupo', 'Descrição', 'Detalhe', 'Unidade', 'Quantidade confirmada', 'Quantidade pendente', 'Valor manual'];
export const COLUNAS_RESUMO = ['Disciplina', 'Grupo', 'Descrição', 'Detalhe', 'Unidade', 'Confirmado', 'Pendente'];
export const COLUNAS_MATERIAIS = ['Material', 'Unidade', 'Quantidade confirmada', 'Quantidade pendente', 'Origem'];

/** Larguras das colunas (em caracteres). */
export const LARGURAS_DETALHE = [22, 44, 22, 10, 22, 20, 13];
export const LARGURAS_RESUMO = [20, 24, 44, 22, 10, 16, 16];
export const LARGURAS_MATERIAIS = [44, 10, 22, 20, 48];

export const FORMATO_QUANTIDADE = '#,##0.00';
export const FORMATO_INTEIRO = '0';

export const TEXTO_SIM = 'Sim';
export const TEXTO_NAO_INFORMADO = 'não informado';
export const TEXTO_SEM_PLANTA = 'nenhuma planta carregada';
export const TITULO_TOTAIS = 'Totais por disciplina (confirmados e pendentes em separado)';

export const NOME_ARQUIVO_PADRAO = 'levantamento';

/** Impressão / PDF. */
export const MARGEM_PAGINA_MM = 10;
export const ALTURA_CABECALHO_MM = 9;
