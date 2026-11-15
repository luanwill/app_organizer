/** Exportação: Excel (.xlsx via SheetJS), JSON reimportável e PDF (impressão do navegador). */
import * as XLSX from 'xlsx';
import type { ExportApi, Levantamento, Projeto } from '@/core/model';
import {
  ALTURA_CABECALHO_MM,
  FORMATO_JSON,
  FORMATO_QUANTIDADE,
  INDENTACAO_JSON,
  MARGEM_PAGINA_MM,
  NOME_ARQUIVO_PADRAO,
  VERSAO_JSON,
} from './config';
import { montarPlanilhas, type Celula, type Planilha } from './planilhas';

// ---------------------------------------------------------------- Excel

function celulaXlsx(celula: Celula): XLSX.CellObject | null {
  if (celula === null || celula === '') return null;
  if (typeof celula === 'string') return { t: 's', v: celula };
  if (typeof celula === 'number') return { t: 'n', v: celula, z: FORMATO_QUANTIDADE };
  return { t: 'n', v: celula.valor, z: celula.formato };
}

function folha(planilha: Planilha): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  let ultimaColuna = 0;
  planilha.linhas.forEach((linha, r) => {
    linha.forEach((celula, c) => {
      const cx = celulaXlsx(celula);
      if (!cx) return;
      ws[XLSX.utils.encode_cell({ r, c })] = cx;
      ultimaColuna = Math.max(ultimaColuna, c);
    });
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, planilha.linhas.length - 1), c: ultimaColuna } });
  ws['!cols'] = planilha.larguras.map((wch) => ({ wch }));
  return ws;
}

/** Bytes do .xlsx (abas: Resumo, Ambientes, Esquadrias, Paredes, Acabamentos, Estrutura, Elétrica, Hidráulica, Materiais). */
export function exportarExcel(projeto: Projeto, levantamento: Levantamento): Uint8Array {
  const livro = XLSX.utils.book_new();
  for (const planilha of montarPlanilhas(projeto, levantamento)) {
    XLSX.utils.book_append_sheet(livro, folha(planilha), planilha.nome);
  }
  return new Uint8Array(XLSX.write(livro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

// ---------------------------------------------------------------- JSON

/** Envelope lido pela importação (S9). */
export interface EnvelopeJSON {
  formato: typeof FORMATO_JSON;
  versao: typeof VERSAO_JSON;
  exportadoEm: string;
  projeto: Projeto;
}

/** JSON completo e reimportável: { formato, versao, exportadoEm, projeto }. */
export function exportarJSON(projeto: Projeto): string {
  const envelope: EnvelopeJSON = { formato: FORMATO_JSON, versao: VERSAO_JSON, exportadoEm: new Date().toISOString(), projeto };
  return JSON.stringify(envelope, null, INDENTACAO_JSON);
}

// ---------------------------------------------------------------- PDF (impressão)

export type Orientacao = 'landscape' | 'portrait';

/** Paisagem quando a imagem é mais larga que alta. */
export function orientacaoDaImagem(largura: number, altura: number): Orientacao {
  return largura > altura ? 'landscape' : 'portrait';
}

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Documento de impressão: título no cabeçalho e a planta ocupando a página A4. */
export function montarHtmlImpressao(imagemDataUrl: string, titulo: string, orientacao: Orientacao): string {
  const t = escaparHtml(titulo);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${t}</title>
<style>
@page { size: A4 ${orientacao}; margin: ${MARGEM_PAGINA_MM}mm; }
html, body { margin: 0; padding: 0; height: 100%; background: #fff; color: #000; font: 12pt system-ui, 'Segoe UI', Roboto, sans-serif; }
body { display: flex; flex-direction: column; height: 100vh; }
header { flex: none; height: ${ALTURA_CABECALHO_MM}mm; font-weight: 600; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
main { flex: 1; min-height: 0; }
img { display: block; width: 100%; height: 100%; object-fit: contain; object-position: top center; }
</style>
</head>
<body>
<header>${t}</header>
<main><img src="${escaparHtml(imagemDataUrl)}" alt="${t}"></main>
</body>
</html>`;
}

/**
 * Abre a impressão do navegador (o usuário escolhe "Salvar como PDF") com a planta e as camadas.
 * Usa um iframe oculto — sem biblioteca de PDF e sem bloqueio de pop-up.
 */
export function exportarPDF(imagemDataUrl: string, titulo: string): void {
  const imagem = new Image();
  imagem.onload = () => {
    const quadro = document.createElement('iframe');
    quadro.setAttribute('aria-hidden', 'true');
    quadro.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    quadro.onload = () => {
      const janela = quadro.contentWindow;
      if (!janela) return;
      const remover = () => quadro.remove();
      janela.addEventListener('afterprint', remover);
      const imprimir = () => {
        janela.focus();
        janela.print();
      };
      const img = janela.document.querySelector('img');
      if (img && !img.complete) img.addEventListener('load', imprimir, { once: true });
      else imprimir();
    };
    quadro.srcdoc = montarHtmlImpressao(imagemDataUrl, titulo, orientacaoDaImagem(imagem.naturalWidth, imagem.naturalHeight));
    document.body.appendChild(quadro);
  };
  imagem.src = imagemDataUrl;
}

// ---------------------------------------------------------------- nome de arquivo

/** "Casa João — térreo" + "xlsx" → "casa-joao-terreo.xlsx". */
export function nomeArquivo(nomeLevantamento: string, extensao: string): string {
  const base = nomeLevantamento
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || NOME_ARQUIVO_PADRAO}.${extensao}`;
}

/** Verificação de tipo: o módulo satisfaz o contrato ExportApi. */
export const exportApi = { exportarExcel, exportarJSON, exportarPDF } satisfies ExportApi;
