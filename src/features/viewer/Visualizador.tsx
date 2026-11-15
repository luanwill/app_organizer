/** Coluna central: PDF + camadas + barra de ferramentas + páginas/zoom. */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  COR_DISCIPLINA,
  DISCIPLINA_DO_TIPO,
  DISCIPLINAS,
  ROTULO_DISCIPLINA,
  type Disciplina,
  type GeometriaDerivada,
} from '@/core/model';
import { useLevantamento } from '@/core/store';
import { AreaPlanta } from './AreaPlanta';
import { BarraFerramentas } from './BarraFerramentas';
import { FATOR_ZOOM_BOTAO, MARGEM_AJUSTE_PX } from './config';
import { ajustarATela, VISTA_INICIAL, zoomNoPonto, type Vista } from './coordenadas';
import { useDocumentoPdf, usePaginaPdf } from './usePdf';
import './viewer.css';

/** Disciplinas que têm elementos desenháveis na planta. */
const DISCIPLINAS_DA_PLANTA: Disciplina[] = DISCIPLINAS.filter((d) => Object.values(DISCIPLINA_DO_TIPO).includes(d));

export interface VisualizadorProps {
  /** Geometria derivada (rotas automáticas etc.) calculada pelo orquestrador. */
  derivados?: GeometriaDerivada[];
}

export function Visualizador({ derivados }: VisualizadorProps) {
  const pagina = useLevantamento((s) => s.paginaAtual);
  const camadas = useLevantamento((s) => s.projeto.camadas);
  const ferramenta = useLevantamento((s) => s.ferramenta);

  const { doc, erro, abrirArquivo } = useDocumentoPdf();
  const [vista, setVista] = useState<Vista>(VISTA_INICIAL);
  const { canvasRef, dim } = usePaginaPdf(doc, pagina, vista.zoom);

  // tamanho do contêiner
  const areaRef = useRef<HTMLDivElement>(null);
  const [tamanho, setTamanho] = useState({ largura: 0, altura: 0 });
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const medir = () => setTamanho({ largura: area.clientWidth, altura: area.clientHeight });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(area);
    return () => observador.disconnect();
  }, []);

  const ajustar = useCallback(() => {
    if (!dim || tamanho.largura <= 0 || tamanho.altura <= 0) return;
    setVista(ajustarATela(dim.largura, dim.altura, tamanho.largura, tamanho.altura, MARGEM_AJUSTE_PX));
  }, [dim, tamanho]);

  // ao abrir um PDF ou trocar de página, enquadra a página inteira (uma vez)
  const paginaAjustada = useRef<object | null>(null);
  useEffect(() => {
    if (!dim || tamanho.largura <= 0 || paginaAjustada.current === dim) return;
    paginaAjustada.current = dim;
    ajustar();
  }, [dim, tamanho, ajustar]);

  const zoomBotao = (fator: number) =>
    setVista((v) => zoomNoPonto(v, { x: tamanho.largura / 2, y: tamanho.altura / 2 }, v.zoom * fator));

  const total = doc?.numPages ?? 0;
  const irPara = (n: number) => useLevantamento.getState().definirPagina(n);

  return (
    <div className="vz">
      <BarraFerramentas temPlanta={doc !== null} aoAbrirArquivo={abrirArquivo} />
      <div className="vz-camadas">
        <span className="suave">Camadas:</span>
        {DISCIPLINAS_DA_PLANTA.map((d) => (
          <button
            key={d}
            type="button"
            className={`vz-camada ${camadas[d] ? 'ativo' : 'vz-camada-oculta'}`}
            aria-pressed={camadas[d]}
            title={camadas[d] ? 'Ocultar camada' : 'Mostrar camada'}
            onClick={() => useLevantamento.getState().definirCamada(d, !camadas[d])}
          >
            <span className="vz-bolinha" style={{ background: COR_DISCIPLINA[d] }} />
            {ROTULO_DISCIPLINA[d]}
          </button>
        ))}
        {ferramenta.alvo && (
          <span className="selo vz-alvo">Desenhando: {ferramenta.alvo.rotulo ?? ferramenta.alvo.tipo}</span>
        )}
      </div>
      <div className="vz-area" ref={areaRef}>
        {doc && dim && tamanho.largura > 0 && tamanho.altura > 0 ? (
          <AreaPlanta
            doc={doc}
            dim={dim}
            canvasRef={canvasRef}
            vista={vista}
            definirVista={setVista}
            largura={tamanho.largura}
            altura={tamanho.altura}
            derivados={derivados}
          />
        ) : (
          <div className="carregando">
            {erro ? (
              <span className="alerta-faltante">{erro}</span>
            ) : doc ? (
              'Carregando a página…'
            ) : (
              <div className="vz-vazio">
                <strong>Nenhuma planta aberta</strong>
                <span>Clique em “Abrir planta (PDF)” para começar. Depois, calibre a escala da página para medir.</span>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="vz-rodape">
        <button type="button" disabled={!doc || pagina <= 1} title="Página anterior" onClick={() => irPara(pagina - 1)}>
          ◀
        </button>
        <span>{doc ? `Página ${pagina} de ${total}` : 'Sem planta'}</span>
        <button type="button" disabled={!doc || pagina >= total} title="Próxima página" onClick={() => irPara(pagina + 1)}>
          ▶
        </button>
        <span className="vz-separador" />
        <button type="button" disabled={!dim} title="Diminuir zoom" onClick={() => zoomBotao(1 / FATOR_ZOOM_BOTAO)}>
          −
        </button>
        <span className="vz-zoom">{dim ? `${Math.round(vista.zoom * 100)}%` : '—'}</span>
        <button type="button" disabled={!dim} title="Aumentar zoom" onClick={() => zoomBotao(FATOR_ZOOM_BOTAO)}>
          +
        </button>
        <button type="button" disabled={!dim} onClick={ajustar}>
          Ajustar à tela
        </button>
      </div>
    </div>
  );
}
