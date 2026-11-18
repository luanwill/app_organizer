/** S9 — importação: DXF, JSON e o stub de "Recortes IA". */
export type { AIAnalyzer, ResultadoImportacao } from '@/core/model';
export { importarDXF, detectarParedes } from './dxf';
export type { OpcoesDXF, ResultadoDXF } from './dxf';
export { importarJSON } from './json';
export type { ContextoJSON, ResultadoJSON } from './json';
export { gerarPdfEmBranco } from './pdfEmBranco';
export { aiAnalyzer } from './ia';
export { PainelImportacao } from './PainelImportacao';
export { extrairVetores, paraEntradaDoReconhecimento } from './pdfVetores';
export type { PaginaPdf, PreenchimentoVetorial, TracoVetorial, VetoresDaPagina } from './pdfVetores';
export { reconhecerVetores, ehDoReconhecimentoPdf } from './reconhecimento';
export type { EntradaVetores, OpcoesReconhecimento, ResultadoReconhecimento } from './reconhecimento';
export { classificarAmbiente } from './ambientes';
export type { Classificacao } from './ambientes';
