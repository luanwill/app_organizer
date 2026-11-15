/** Hooks do PDF: documento aberto a partir da store e renderização da página atual. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLevantamento } from '@/core/store';
import { ATRASO_RENDER_MS, MAX_PIXELS_CANVAS } from './config';
import { escalaRenderizacao } from './coordenadas';
import { abrirPdf, dimensoesPagina, renderizarPagina, type DocumentoPdf } from './pdf';

const ERRO_ABRIR = 'Não foi possível abrir o PDF.';

/** Documento pdfjs dos bytes guardados na store (reabre após reload) + abertura de arquivo novo. */
export function useDocumentoPdf() {
  const pdfDados = useLevantamento((s) => s.pdfDados);
  const [doc, setDoc] = useState<DocumentoPdf | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /** Documento já aberto por `abrirArquivo`, reaproveitado quando a store devolve os mesmos bytes. */
  const preAberto = useRef<{ dados: Uint8Array; doc: DocumentoPdf } | null>(null);

  useEffect(() => {
    if (!pdfDados) {
      setDoc(null);
      return;
    }
    let cancelado = false;
    let aberto: DocumentoPdf | null = null;
    const pre = preAberto.current;
    preAberto.current = null;
    let promessa: Promise<DocumentoPdf>;
    if (pre && pre.dados === pdfDados) {
      promessa = Promise.resolve(pre.doc);
    } else {
      if (pre) void pre.doc.destroy();
      promessa = abrirPdf(pdfDados);
    }
    promessa
      .then((d) => {
        if (cancelado) {
          void d.destroy();
          return;
        }
        aberto = d;
        setErro(null);
        setDoc(d);
      })
      .catch(() => {
        if (cancelado) return;
        setDoc(null);
        setErro(ERRO_ABRIR);
      });
    return () => {
      cancelado = true;
      if (aberto) void aberto.destroy();
    };
  }, [pdfDados]);

  const abrirArquivo = useCallback(async (arquivo: File) => {
    try {
      const dados = new Uint8Array(await arquivo.arrayBuffer());
      const d = await abrirPdf(dados);
      preAberto.current = { dados, doc: d };
      setErro(null);
      useLevantamento.getState().definirPdf(arquivo.name, dados, d.numPages);
    } catch {
      setErro(ERRO_ABRIR);
    }
  }, []);

  return { doc, erro, abrirArquivo };
}

export interface DimensoesPagina {
  doc: DocumentoPdf;
  pagina: number;
  largura: number;
  altura: number;
}

/**
 * Renderiza a página atual no canvas devolvido, em resolução adequada ao zoom (com debounce),
 * e informa à store as dimensões da página em escala 1.
 */
export function usePaginaPdf(doc: DocumentoPdf | null, pagina: number, zoom: number) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dim, setDim] = useState<DimensoesPagina | null>(null);
  const [zoomRender, setZoomRender] = useState(zoom);

  useEffect(() => {
    const t = window.setTimeout(() => setZoomRender(zoom), ATRASO_RENDER_MS);
    return () => window.clearTimeout(t);
  }, [zoom]);

  // dimensões da página (escala 1)
  useEffect(() => {
    if (!doc || pagina < 1 || pagina > doc.numPages) return;
    let cancelado = false;
    dimensoesPagina(doc, pagina)
      .then(({ largura, altura }) => {
        if (cancelado) return;
        setDim({ doc, pagina, largura, altura });
        const st = useLevantamento.getState();
        const info = st.projeto.paginas[pagina];
        if (!info || info.largura !== largura || info.altura !== altura) {
          st.definirDimensoesPagina(pagina, largura, altura);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [doc, pagina]);

  const dimAtual = dim && dim.doc === doc && dim.pagina === pagina ? dim : null;

  // renderização
  useEffect(() => {
    if (!doc || !dimAtual) return;
    const escala = escalaRenderizacao(
      zoomRender,
      window.devicePixelRatio || 1,
      dimAtual.largura,
      dimAtual.altura,
      MAX_PIXELS_CANVAS,
    );
    let cancelado = false;
    const render = renderizarPagina(doc, dimAtual.pagina, escala);
    render.promessa
      .then((pronto) => {
        const canvas = canvasRef.current;
        if (cancelado || !canvas) return;
        canvas.width = pronto.width;
        canvas.height = pronto.height;
        canvas.getContext('2d')?.drawImage(pronto, 0, 0);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
      render.cancelar();
    };
  }, [doc, dimAtual, zoomRender]);

  return { canvasRef, dim: dimAtual };
}
