/** Área da planta: canvas do PDF + camada Konva (elementos, pré-visualização, alças) + interações. */
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Circle, Layer, Line, Rect, Stage } from 'react-konva';
import { COR_DISCIPLINA, DISCIPLINA_DO_TIPO, type Elemento, type GeometriaDerivada, type Ponto } from '@/core/model';
import { useLevantamento } from '@/core/store';
import {
  comAlfa,
  COR_CALIBRACAO,
  COR_SELECAO,
  COR_SNAP,
  DESLOCAMENTO_ETIQUETA_PX,
  FATOR_ZOOM_RODA,
  LARGURA_PREVIA_PX,
  MAX_PIXELS_CANVAS,
  OPACIDADE_PREVIA,
  PIXEL_RATIO_CAPTURA,
  RAIO_ALCA_PX,
  RAIO_VERTICE_PREVIA_PX,
  TAMANHO_INDICADOR_SNAP_PX,
  TOLERANCIA_MESMO_PONTO_PX,
  TOLERANCIA_PAREDE_PX,
  TOLERANCIA_SNAP_PX,
  TRACEJADO_PREVIA,
} from './config';
import {
  animacaoEmCurso,
  derivadoOculto,
  estadoRevelacao,
  indexarRevelacao,
  naCamadaPrincipal,
  progressoGeral,
  quantosRevelados,
  ROTULO_FASE_ANIMACAO,
  type AnimacaoPlanta,
} from './animacao';
import { CamadaAnimacao, useReduzirMovimento, type ItemAnimado } from './CamadaAnimacao';
import { escalaRenderizacao, telaParaPdf, zoomNoPonto, type Vista } from './coordenadas';
import {
  cliquesParaConcluir,
  escalaDaCalibracao,
  mesmoPonto,
  minimoVertices,
  modoAberto,
  motivoBloqueio,
  pontosDaPrevia,
  resolverPonto,
  tipoGeometriaDoModo,
} from './desenho';
import {
  construirElemento,
  moverPonto,
  moverVertice,
  ordenarParaDesenho,
  pontosDaGeometria,
  verticesDeSnap,
  vincularElemento,
} from './elementos';
import { Etiqueta, FormaDerivada, FormaElemento } from './FormaElemento';
import { renderizarPagina, type DocumentoPdf } from './pdf';
import { registrarCapturador } from './registro';
import { numerosContagem, rotuloDerivadoVisivel, rotuloDoElemento, rotuloMedida } from './rotulos';
import type { DimensoesPagina } from './usePdf';

// arrastar elementos só com o botão esquerdo (o do meio move a vista)
Konva.dragButtons = [0];

const INSTRUCAO_MODO: Partial<Record<string, string>> = {
  calibrar: 'Clique nos 2 pontos de uma cota conhecida.',
  distancia: 'Clique em 2 pontos para medir.',
  polilinha: 'Clique para adicionar vértices. Duplo clique ou Enter conclui; Esc cancela.',
  poligono: 'Clique para adicionar vértices. Duplo clique, Enter ou clique no 1º vértice fecha; Esc cancela.',
  retangulo: 'Clique em 2 cantos opostos.',
  contagem: 'Cada clique conta um item. Esc encerra.',
  parede: 'Clique ao longo do eixo da parede. Duplo clique ou Enter conclui; Esc cancela.',
  ponto: 'Clique para posicionar. Esc encerra.',
};

function focoEmCampo(): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

function achatar(pontos: Ponto[]): number[] {
  return pontos.flatMap((p) => [p.x, p.y]);
}

export interface AreaPlantaProps {
  doc: DocumentoPdf;
  dim: DimensoesPagina;
  canvasRef: RefObject<HTMLCanvasElement>;
  vista: Vista;
  definirVista: Dispatch<SetStateAction<Vista>>;
  /** Tamanho do contêiner (px). */
  largura: number;
  altura: number;
  derivados?: GeometriaDerivada[];
  /** Apresentação "analisando a planta" (o app controla fase e progresso). */
  animacao?: AnimacaoPlanta;
}

const SEM_FASES: AnimacaoPlanta['porFase'] = {};

export function AreaPlanta(props: AreaPlantaProps) {
  const { doc, dim, canvasRef, vista, definirVista, largura, altura, derivados, animacao } = props;
  const projeto = useLevantamento((s) => s.projeto);
  const pagina = useLevantamento((s) => s.paginaAtual);
  const ferramenta = useLevantamento((s) => s.ferramenta);
  const selecaoIds = useLevantamento((s) => s.selecaoIds);

  const modo = ferramenta.modo;
  const zoom = vista.zoom;
  const escala = projeto.paginas[pagina]?.escala ?? null;
  const bloqueio = motivoBloqueio(modo, true, escala);
  const selecionando = modo === 'selecionar';

  // ---------------------------------------------------------------- apresentação "analisando"
  const reduzirMovimento = useReduzirMovimento();
  /** Enquanto a análise acontece, o desenho/seleção fica bloqueado (pan e zoom continuam). */
  const analisando = animacaoEmCurso(animacao);
  const faixaAnalise = analisando && animacao.pagina === pagina;
  /** Efeitos e ocultação: só na página analisada e sem prefers-reduced-motion. */
  const animando = faixaAnalise && !reduzirMovimento;
  const porFase = animacao?.porFase ?? SEM_FASES;
  const indiceRevelacao = useMemo(() => indexarRevelacao(porFase), [porFase]);
  const faseAnim = animacao?.fase ?? 'concluida';
  const progressoAnim = animacao?.progresso ?? 1;

  const desenhando = !analisando && !selecionando && modo !== 'pan' && bloqueio === null;

  const elementosPagina = useMemo(() => projeto.elementos.filter((e) => e.pagina === pagina), [projeto.elementos, pagina]);
  const visiveis = useMemo(
    () => ordenarParaDesenho(elementosPagina.filter((e) => projeto.camadas[e.disciplina])),
    [elementosPagina, projeto.camadas],
  );
  const derivadosVisiveis = useMemo(
    () => (derivados ?? []).filter((d) => d.pagina === pagina && projeto.camadas[d.disciplina]),
    [derivados, pagina, projeto.camadas],
  );
  // Camada principal: elementos fora da análise e de fases passadas — só muda na troca de fase.
  const visiveisAgora = useMemo(
    () => (animando ? visiveis.filter((el) => naCamadaPrincipal(el.id, indiceRevelacao, faseAnim)) : visiveis),
    [animando, visiveis, indiceRevelacao, faseAnim],
  );
  const derivadosAgora = useMemo(
    () => (animando ? derivadosVisiveis.filter((d) => !derivadoOculto(d, indiceRevelacao, faseAnim)) : derivadosVisiveis),
    [animando, derivadosVisiveis, indiceRevelacao, faseAnim],
  );
  // Camada de animação: elementos da fase atual (ocultos até a sua vez; depois animam até t = 1).
  const daFase = useMemo(
    () =>
      animando
        ? visiveis.filter((el) => indiceRevelacao.get(el.id)?.fase === faseAnim)
        : [],
    [animando, visiveis, indiceRevelacao, faseAnim],
  );
  const itensAnimados: ItemAnimado[] = [];
  for (const el of daFase) {
    const r = estadoRevelacao(el.id, indiceRevelacao, faseAnim, progressoAnim);
    if (r.tipo === 'oculto') continue;
    itensAnimados.push({ el, t: r.tipo === 'animando' ? r.t : 1, fase: faseAnim });
  }
  const candidatosSnap = useMemo(() => verticesDeSnap(visiveis), [visiveis]);
  const contextoRotulo = useMemo(
    () => ({ escala, esquadrias: projeto.esquadrias, contagens: numerosContagem(elementosPagina) }),
    [escala, projeto.esquadrias, elementosPagina],
  );

  /** Vértices já clicados do desenho em andamento (unidades do PDF). */
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [cursor, setCursor] = useState<{ ponto: Ponto; snap: boolean } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<{ id: string; indice: number; ponto: Ponto } | null>(null);
  /** Id do elemento/rota sob o mouse (mostra o rótulo). */
  const [sobreId, setSobreId] = useState<string | null>(null);
  const [espaco, setEspaco] = useState(false);
  const [arrastandoVista, setArrastandoVista] = useState(false);
  const [medidaTexto, setMedidaTexto] = useState('');

  const camadaRef = useRef<Konva.Layer | null>(null);
  const vistaRef = useRef(vista);
  vistaRef.current = vista;

  // troca de ferramenta ou de página descarta o desenho em andamento
  useEffect(() => {
    setPontos([]);
    setCursor(null);
    setAviso(null);
    setMedidaTexto('');
  }, [ferramenta, pagina]);

  // captura (PDF em resolução própria + camada de elementos)
  useEffect(
    () =>
      registrarCapturador(async () => {
        const camada = camadaRef.current;
        if (!camada) return null;
        const esc = escalaRenderizacao(PIXEL_RATIO_CAPTURA, 1, dim.largura, dim.altura, MAX_PIXELS_CANVAS);
        const canvas = await renderizarPagina(doc, dim.pagina, esc).promessa;
        const v = vistaRef.current;
        const larguraTela = dim.largura * v.zoom;
        const desenho = camada.toCanvas({
          x: v.x,
          y: v.y,
          width: larguraTela,
          height: dim.altura * v.zoom,
          pixelRatio: canvas.width / larguraTela,
        });
        canvas.getContext('2d')?.drawImage(desenho, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
      }),
    [doc, dim],
  );

  const cancelarDesenho = () => {
    setPontos([]);
    setMedidaTexto('');
    setAviso(null);
  };

  const concluir = (pts: Ponto[]) => {
    const st = useLevantamento.getState();
    const el = construirElemento({
      ferramenta,
      pontos: pts,
      pagina,
      id: crypto.randomUUID(),
      espessuraParede: st.projeto.parametros.gerais.espessuraParede,
    });
    setPontos([]);
    if (!el) return;
    const doPagina = st.projeto.elementos.filter((e) => e.pagina === pagina);
    const r = vincularElemento(el, doPagina, TOLERANCIA_PAREDE_PX / zoom);
    if ('erro' in r) {
      setAviso(r.erro);
      return;
    }
    setAviso(null);
    st.adicionarElementos([r.elemento]);
  };

  const aplicarCalibracao = () => {
    if (pontos.length < 2) return;
    const nova = escalaDaCalibracao(pontos[0], pontos[1], medidaTexto);
    if (nova === null) {
      setAviso('Informe a medida real em metros (ex.: 3,07).');
      return;
    }
    const st = useLevantamento.getState();
    st.calibrarPagina(pagina, nova);
    st.definirFerramenta({ modo: 'selecionar' });
  };

  // ---------------------------------------------------------------- teclado
  const teclado = useRef({ pontos, modo, concluir, analisando });
  teclado.current = { pontos, modo, concluir, analisando };
  useEffect(() => {
    const aoPressionarTecla = (e: KeyboardEvent) => {
      if (focoEmCampo()) return;
      const st = useLevantamento.getState();
      const { pontos: pts, modo: m, concluir: fim, analisando: bloqueado } = teclado.current;
      // durante a análise só a barra de espaço (pan) funciona
      if (bloqueado && e.code !== 'Space') return;
      const ctrl = e.ctrlKey || e.metaKey;
      const tecla = e.key.toLowerCase();
      if (ctrl && tecla === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (st.podeRefazer) st.refazer();
        } else if (st.podeDesfazer) st.desfazer();
      } else if (ctrl && tecla === 'y') {
        e.preventDefault();
        if (st.podeRefazer) st.refazer();
      } else if (e.code === 'Space') {
        e.preventDefault();
        setEspaco(true);
      } else if (e.key === 'Escape') {
        if (pts.length > 0) setPontos([]);
        else if (m !== 'selecionar') st.definirFerramenta({ modo: 'selecionar' });
        else if (st.selecaoIds.length > 0) st.selecionar([]);
        setAviso(null);
      } else if (e.key === 'Enter') {
        if (modoAberto(m) && pts.length >= minimoVertices(m)) {
          e.preventDefault();
          fim(pts);
        }
      } else if (e.key === 'Backspace') {
        if (pts.length > 0 && m !== 'calibrar') {
          e.preventDefault();
          setPontos(pts.slice(0, -1));
        }
      } else if (e.key === 'Delete') {
        if (pts.length === 0 && st.selecaoIds.length > 0) {
          e.preventDefault();
          st.removerElementos(st.selecaoIds);
        }
      }
    };
    const aoSoltarTecla = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (!focoEmCampo()) e.preventDefault();
      setEspaco(false);
    };
    window.addEventListener('keydown', aoPressionarTecla);
    window.addEventListener('keyup', aoSoltarTecla);
    return () => {
      window.removeEventListener('keydown', aoPressionarTecla);
      window.removeEventListener('keyup', aoSoltarTecla);
    };
  }, []);

  // ---------------------------------------------------------------- mouse
  const resolver = (e: KonvaEventObject<MouseEvent>) => {
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return null;
    return resolverPonto(telaParaPdf(vista, pos), {
      candidatos: [...candidatosSnap, ...pontos],
      tolerancia: TOLERANCIA_SNAP_PX / zoom,
      ortogonal: e.evt.shiftKey,
      anterior: pontos.length > 0 ? pontos[pontos.length - 1] : null,
    });
  };

  const iniciarPan = (evt: MouseEvent) => {
    evt.preventDefault();
    const inicio = { cx: evt.clientX, cy: evt.clientY, x: vista.x, y: vista.y };
    setArrastandoVista(true);
    const mover = (m: MouseEvent) =>
      definirVista((v) => ({ ...v, x: inicio.x + m.clientX - inicio.cx, y: inicio.y + m.clientY - inicio.cy }));
    const soltar = () => {
      setArrastandoVista(false);
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', soltar);
    };
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
  };

  const aoPressionarMouse = (e: KonvaEventObject<MouseEvent>) => {
    const evt = e.evt;
    if (evt.button === 1 || (evt.button === 0 && (modo === 'pan' || espaco))) {
      iniciarPan(evt);
      return;
    }
    if (evt.button !== 0 || analisando) return;
    if (selecionando) {
      if (e.target === e.target.getStage()) useLevantamento.getState().selecionar([]);
      return;
    }
    if (bloqueio) {
      setAviso(bloqueio);
      return;
    }
    // Duplo clique (detectado pelo navegador, que exige os 2 cliques no mesmo lugar): o 1º clique já
    // adicionou o vértice; o 2º conclui. Não se usa o onDblClick do Konva, que só olha o tempo.
    if (evt.detail > 1) {
      if (modoAberto(modo) && pontos.length >= minimoVertices(modo)) concluir(pontos);
      return;
    }
    if (modo === 'calibrar' && pontos.length >= 2) return; // aguardando a medida real
    const r = resolver(e);
    if (!r) return;
    const tol = TOLERANCIA_MESMO_PONTO_PX / zoom;
    if (modo === 'poligono' && pontos.length >= minimoVertices(modo) && mesmoPonto(r.ponto, pontos[0], tol)) {
      concluir(pontos);
      return;
    }
    if (pontos.length > 0 && mesmoPonto(r.ponto, pontos[pontos.length - 1], tol)) return;
    const novos = [...pontos, r.ponto];
    setAviso(null);
    if (modo !== 'calibrar' && cliquesParaConcluir(modo) === novos.length) concluir(novos);
    else setPontos(novos);
  };

  const aoMoverMouse = (e: KonvaEventObject<MouseEvent>) => {
    if (!desenhando || arrastandoVista) return;
    setCursor(resolver(e));
  };

  const aoRolar = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;
    const fator = e.evt.deltaY < 0 ? FATOR_ZOOM_RODA : 1 / FATOR_ZOOM_RODA;
    definirVista((v) => zoomNoPonto(v, pos, v.zoom * fator));
  };

  // ---------------------------------------------------------------- seleção / edição
  const aoPressionarElemento = useCallback((id: string, adicionar: boolean) => {
    const st = useLevantamento.getState();
    if (st.ferramenta.modo !== 'selecionar') return;
    if (adicionar) {
      st.selecionar(st.selecaoIds.includes(id) ? st.selecaoIds.filter((s) => s !== id) : [...st.selecaoIds, id]);
    } else if (!st.selecaoIds.includes(id)) {
      st.selecionar([id]);
    }
  }, []);

  const aoPassar = useCallback((id: string, dentro: boolean) => {
    setSobreId((atual) => (dentro ? id : atual === id ? null : atual));
  }, []);

  const aoMoverPonto = useCallback((id: string, ponto: Ponto, no: Konva.Node) => {
    const st = useLevantamento.getState();
    const el = st.projeto.elementos.find((e) => e.id === id);
    if (!el || el.geometria.tipo !== 'ponto') return;
    const patch = moverPonto(el, ponto, st.projeto.elementos);
    const destino = patch?.geometria?.tipo === 'ponto' ? patch.geometria.ponto : el.geometria.ponto;
    no.position(destino); // a esquadria "gruda" na parede mesmo que a geometria não mude
    if (patch) st.atualizarElemento(id, patch);
  }, []);

  // ---------------------------------------------------------------- pré-visualização
  const geomPrevia = modo === 'calibrar' ? 'polilinha' : tipoGeometriaDoModo(modo);
  const previa = pontosDaPrevia(modo, pontos, cursor?.ponto ?? null);
  const corPrevia =
    modo === 'calibrar' ? COR_CALIBRACAO : COR_DISCIPLINA[DISCIPLINA_DO_TIPO[ferramenta.alvo?.tipo ?? 'medicao']];
  const medidaAoVivo = modo === 'calibrar' ? null : rotuloMedida(geomPrevia, previa, escala);
  const pedindoMedida = modo === 'calibrar' && pontos.length >= 2;
  const selecionados = selecionando && !analisando ? visiveisAgora.filter((e) => selecaoIds.includes(e.id) && e.geometria.tipo !== 'ponto') : [];

  const classeCursor = arrastandoVista ? 'vz-arrastando' : modo === 'pan' || espaco ? 'vz-pan' : desenhando ? 'vz-mira' : '';
  const mensagem = analisando ? null : (aviso ?? bloqueio ?? INSTRUCAO_MODO[modo] ?? null);

  // só pontos sobem ao passar o mouse (reordenar polígonos sobrepostos trocaria quem recebe o mouse)
  const emOrdem = useMemo(() => {
    const sobrePonto = visiveisAgora.find((e) => e.id === sobreId && e.geometria.tipo === 'ponto');
    return sobrePonto ? [...visiveisAgora.filter((e) => e !== sobrePonto), sobrePonto] : visiveisAgora;
  }, [visiveisAgora, sobreId]);

  // Conteúdo da camada principal memoizado: durante a análise o componente re-renderiza a cada
  // quadro, mas estes nós só mudam com a fase, a seleção, o hover ou a vista.
  const conteudoPrincipal = useMemo(() => {
    const desenharElemento = (el: Elemento) => {
      const r = rotuloDoElemento(el, contextoRotulo);
      const provisorio =
        edicao && edicao.id === el.id ? pontosDaGeometria(moverVertice(el.geometria, edicao.indice, edicao.ponto)) : undefined;
      return (
        <FormaElemento
          key={el.id}
          elemento={el}
          zoom={zoom}
          escala={escala}
          selecionado={selecaoIds.includes(el.id)}
          sobre={sobreId === el.id}
          interativo={selecionando}
          simbolo={r.simbolo}
          texto={r.texto}
          pontosProvisorios={provisorio}
          aoPressionar={aoPressionarElemento}
          aoMoverPonto={aoMoverPonto}
          aoPassar={aoPassar}
        />
      );
    };
    return (
      <>
        {/* polígonos embaixo; rotas derivadas sobre eles (para receberem o mouse); linhas e pontos por cima;
            o elemento sob o mouse vai por último, para o rótulo não ficar atrás do símbolo vizinho */}
        {emOrdem.filter((el) => el.geometria.tipo === 'poligono').map(desenharElemento)}
        {derivadosAgora.map((d) => (
          <FormaDerivada
            key={d.id}
            derivado={d}
            zoom={zoom}
            interativo={selecionando}
            mostrarRotulo={rotuloDerivadoVisivel(d, sobreId, selecaoIds)}
            aoPressionar={aoPressionarElemento}
            aoPassar={aoPassar}
          />
        ))}
        {/* linhas, depois pontos; fundação embaixo do pilar, para o pilar receber o clique */}
        {emOrdem.filter((el) => el.geometria.tipo === 'polilinha').map(desenharElemento)}
        {emOrdem.filter((el) => el.geometria.tipo === 'ponto' && el.tipo === 'fundacao').map(desenharElemento)}
        {emOrdem.filter((el) => el.geometria.tipo === 'ponto' && el.tipo !== 'fundacao').map(desenharElemento)}
      </>
    );
  }, [emOrdem, derivadosAgora, contextoRotulo, edicao, zoom, escala, selecaoIds, sobreId, selecionando, aoPressionarElemento, aoMoverPonto, aoPassar]);

  return (
    <div className={`vz-planta ${classeCursor}`}>
      <canvas
        ref={canvasRef}
        className="vz-pdf"
        style={{
          width: dim.largura * zoom,
          height: dim.altura * zoom,
          transform: `translate(${vista.x}px, ${vista.y}px)`,
        }}
      />
      <Stage
        className="vz-stage"
        width={largura}
        height={altura}
        x={vista.x}
        y={vista.y}
        scaleX={zoom}
        scaleY={zoom}
        onMouseDown={aoPressionarMouse}
        onMouseMove={aoMoverMouse}
        onMouseLeave={() => {
          setCursor(null);
          setSobreId(null);
        }}
        onWheel={aoRolar}
      >
        {/* escuta o mouse também fora do modo selecionar, para os rótulos de hover */}
        <Layer ref={camadaRef} listening={modo !== 'pan' && !espaco && !arrastandoVista && !analisando}>
          {conteudoPrincipal}
        </Layer>
        {animando && (
          <CamadaAnimacao
            fase={faseAnim}
            progresso={progressoAnim}
            largura={dim.largura}
            altura={dim.altura}
            zoom={zoom}
            escala={escala}
            itens={itensAnimados}
            contextoRotulo={contextoRotulo}
          />
        )}
        <Layer listening={selecionando && !espaco && !analisando}>
          {selecionados.flatMap((el) =>
            pontosDaGeometria(el.geometria).map((p, i) => (
              <Circle
                key={`${el.id}:${i}`}
                x={p.x}
                y={p.y}
                radius={RAIO_ALCA_PX / zoom}
                fill="#ffffff"
                stroke={COR_SELECAO}
                strokeWidth={2}
                strokeScaleEnabled={false}
                draggable
                onDragMove={(e) => {
                  const r = resolverPonto(
                    { x: e.target.x(), y: e.target.y() },
                    {
                      candidatos: verticesDeSnap(visiveis, { id: el.id, indice: i }),
                      tolerancia: TOLERANCIA_SNAP_PX / zoom,
                      ortogonal: false,
                      anterior: null,
                    },
                  );
                  e.target.position(r.ponto);
                  setEdicao({ id: el.id, indice: i, ponto: r.ponto });
                }}
                onDragEnd={(e) => {
                  const ponto = { x: e.target.x(), y: e.target.y() };
                  setEdicao(null);
                  useLevantamento.getState().atualizarElemento(el.id, { geometria: moverVertice(el.geometria, i, ponto) });
                }}
              />
            )),
          )}
          {previa.length >= 2 && (
            <Line
              points={achatar(previa)}
              closed={geomPrevia === 'poligono'}
              stroke={corPrevia}
              strokeWidth={LARGURA_PREVIA_PX}
              strokeScaleEnabled={false}
              dash={TRACEJADO_PREVIA}
              fill={geomPrevia === 'poligono' ? comAlfa(corPrevia, OPACIDADE_PREVIA) : undefined}
              listening={false}
            />
          )}
          {pontos.map((p, i) => (
            <Circle key={i} x={p.x} y={p.y} radius={RAIO_VERTICE_PREVIA_PX / zoom} fill={corPrevia} listening={false} />
          ))}
          {desenhando && cursor?.snap && (
            <Rect
              x={cursor.ponto.x - TAMANHO_INDICADOR_SNAP_PX / 2 / zoom}
              y={cursor.ponto.y - TAMANHO_INDICADOR_SNAP_PX / 2 / zoom}
              width={TAMANHO_INDICADOR_SNAP_PX / zoom}
              height={TAMANHO_INDICADOR_SNAP_PX / zoom}
              stroke={COR_SNAP}
              strokeWidth={2}
              strokeScaleEnabled={false}
              listening={false}
            />
          )}
          {desenhando && cursor && medidaAoVivo && pontos.length > 0 && (
            <Etiqueta
              x={cursor.ponto.x}
              y={cursor.ponto.y}
              zoom={zoom}
              texto={medidaAoVivo}
              deslocamentoPx={DESLOCAMENTO_ETIQUETA_PX * 2}
            />
          )}
        </Layer>
      </Stage>
      {pedindoMedida && (
        <form
          className="vz-calibracao"
          onSubmit={(e) => {
            e.preventDefault();
            aplicarCalibracao();
          }}
        >
          <label className="linha">
            <span>Medida real (m)</span>
            <input
              autoFocus
              inputMode="decimal"
              placeholder="ex.: 3,07"
              value={medidaTexto}
              onChange={(e) => setMedidaTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelarDesenho();
              }}
            />
          </label>
          <button type="submit" className="primario">
            Aplicar
          </button>
          <button type="button" onClick={cancelarDesenho}>
            Cancelar
          </button>
        </form>
      )}
      {faixaAnalise && (
        <div className="vz-analise" role="status" aria-live="polite">
          <div className="vz-analise-texto">
            <span className="vz-analise-sinal" />
            <span>{ROTULO_FASE_ANIMACAO[faseAnim]}</span>
            {(porFase[faseAnim]?.length ?? 0) > 0 && (
              <span className="vz-analise-contador">
                {quantosRevelados(porFase[faseAnim]?.length ?? 0, progressoAnim)} de {porFase[faseAnim]?.length}
              </span>
            )}
          </div>
          <div className="vz-analise-barra">
            <div style={{ width: `${(progressoGeral(animacao) * 100).toFixed(1)}%` }} />
          </div>
        </div>
      )}
      {mensagem && <div className={`vz-dica ${aviso || bloqueio ? 'vz-dica-alerta' : ''}`}>{mensagem}</div>}
    </div>
  );
}
