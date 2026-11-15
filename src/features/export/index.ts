/** Exportação (S8): Excel, JSON e PDF + painel. */
export { exportApi, exportarExcel, exportarJSON, exportarPDF, montarHtmlImpressao, nomeArquivo, orientacaoDaImagem } from './exportar';
export type { EnvelopeJSON, Orientacao } from './exportar';
export { agregarLinhas, agregarMateriais, formatarData, montarPlanilhas, rotuloDaArvore } from './planilhas';
export type { Celula, LinhaAgregada, MaterialAgregado, Planilha } from './planilhas';
export { PainelExportacao } from './PainelExportacao';
