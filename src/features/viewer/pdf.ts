/** Acesso ao pdfjs-dist (worker empacotado pelo Vite). */
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export type DocumentoPdf = PDFDocumentProxy;

/** Abre o PDF. Passa sempre uma CÓPIA dos bytes: o pdfjs transfere ("detacha") o buffer recebido. */
export function abrirPdf(dados: Uint8Array): Promise<DocumentoPdf> {
  return getDocument({ data: dados.slice() }).promise;
}

export interface RenderizacaoPagina {
  /** Canvas pronto (fora da tela) com a página renderizada. */
  promessa: Promise<HTMLCanvasElement>;
  cancelar(): void;
}

/** Renderiza a página (1-based) num canvas fora da tela, em `escala` px por unidade do PDF. */
export function renderizarPagina(doc: DocumentoPdf, pagina: number, escala: number): RenderizacaoPagina {
  let cancelado = false;
  let cancelarTarefa: (() => void) | null = null;
  const promessa = (async () => {
    const page = await doc.getPage(pagina);
    const viewport = page.getViewport({ scale: escala });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const contexto = canvas.getContext('2d');
    if (!contexto) throw new Error('Canvas 2D indisponível');
    if (cancelado) throw new Error('cancelado');
    const tarefa = page.render({ canvasContext: contexto, viewport });
    cancelarTarefa = () => tarefa.cancel();
    await tarefa.promise;
    return canvas;
  })();
  return {
    promessa,
    cancelar() {
      cancelado = true;
      cancelarTarefa?.();
    },
  };
}

/** Dimensões da página (1-based) em escala 1 (unidades do PDF). */
export async function dimensoesPagina(doc: DocumentoPdf, pagina: number): Promise<{ largura: number; altura: number }> {
  const page = await doc.getPage(pagina);
  const viewport = page.getViewport({ scale: 1 });
  return { largura: viewport.width, altura: viewport.height };
}
