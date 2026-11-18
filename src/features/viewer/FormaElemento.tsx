/** Desenho (react-konva) de um elemento, de uma etiqueta e de uma rota derivada. */
import { memo, useMemo } from 'react';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Circle, Group, Label, Line, Rect, RegularPolygon, Shape, Tag, Text } from 'react-konva';
import { COR_DISCIPLINA, COR_PENDENTE, type Elemento, type GeometriaDerivada, type Ponto } from '@/core/model';
import {
  comAlfa,
  COR_FUNDO_ETIQUETA,
  COR_SELECAO,
  COR_TEXTO_ETIQUETA,
  COR_TEXTO_SIMBOLO,
  ESPESSURA_MIN_PAREDE_PX,
  ESTILO_TIPO,
  LARGURA_DERIVADO_PX,
  LARGURA_EXTRA_SELECAO_PX,
  LARGURA_CUMEEIRA_PX,
  LARGURA_TOQUE_PX,
  OPACIDADE_FUNDO_ETIQUETA,
  OPACIDADE_HACHURA,
  OPACIDADE_PAREDE,
  PADDING_ETIQUETA_PX,
  PASSO_HACHURA_PX,
  FONTE_MIN_LETRA_PX,
  TAMANHO_FONTE_PX,
  TIPOS_HACHURADOS,
  TRACEJADO_CUMEEIRA,
  TRACEJADO_DERIVADO,
  TRACEJADO_PENDENTE,
  TRACEJADO_RUFO,
  type EstiloTipo,
} from './config';
import { linhasCumeeira, linhasHachura, tracejadoCalha, type Segmento } from './cobertura';
import { larguraParedeUnidades } from './elementos';
import { ancoraEtiqueta, fonteEtiqueta } from './etiquetas';

function achatar(pontos: Ponto[]): number[] {
  return pontos.flatMap((p) => [p.x, p.y]);
}

function pontoMedio(pontos: Ponto[]): Ponto {
  const i = Math.max(0, Math.floor((pontos.length - 1) / 2));
  const a = pontos[i];
  const b = pontos[Math.min(pontos.length - 1, i + 1)];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

interface EtiquetaProps {
  x: number;
  y: number;
  zoom: number;
  texto: string;
  /** Centraliza a etiqueta no ponto (senão fica à direita dele). */
  centralizada?: boolean;
  /** O ponto é o canto superior esquerdo da etiqueta. */
  cantoSuperiorEsquerdo?: boolean;
  deslocamentoPx?: number;
}

/** Texto com fundo escuro, em tamanho de tela constante. */
export function Etiqueta({ x, y, zoom, texto, centralizada, cantoSuperiorEsquerdo, deslocamentoPx = 0 }: EtiquetaProps) {
  return (
    <Label
      x={x}
      y={y}
      scaleX={1 / zoom}
      scaleY={1 / zoom}
      listening={false}
      ref={(no: Konva.Label | null) => {
        if (!no) return;
        if (cantoSuperiorEsquerdo) {
          no.offsetX(0);
          no.offsetY(0);
          return;
        }
        no.offsetX(centralizada ? no.width() / 2 : -deslocamentoPx);
        no.offsetY(no.height() / 2);
      }}
    >
      <Tag fill={COR_FUNDO_ETIQUETA} opacity={OPACIDADE_FUNDO_ETIQUETA} cornerRadius={3} />
      <Text
        text={texto}
        fontSize={TAMANHO_FONTE_PX}
        padding={PADDING_ETIQUETA_PX}
        fill={COR_TEXTO_ETIQUETA}
        align={centralizada ? 'center' : 'left'}
      />
    </Label>
  );
}

/** Recorta o desenho pelo polígono. */
function recortarPoligono(pontos: Ponto[]) {
  return (ctx: Konva.Context) => {
    ctx.beginPath();
    pontos.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
  };
}

/** Segmentos desenhados num único nó (Shape). */
function desenharSegmentos(segmentos: Segmento[]) {
  return (ctx: Konva.Context, shape: Konva.Shape) => {
    ctx.beginPath();
    for (const { a, b } of segmentos) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.strokeShape(shape);
  };
}

/** Hachura diagonal discreta recortada pelo polígono (laje, telhado). Não recebe o mouse. */
export const Hachura = memo(function Hachura(props: { pontos: Ponto[]; zoom: number; cor: string; opacidade?: number }) {
  const { pontos, zoom, cor, opacidade = OPACIDADE_HACHURA } = props;
  const segmentos = useMemo(() => linhasHachura(pontos, PASSO_HACHURA_PX / zoom), [pontos, zoom]);
  return (
    <Group clipFunc={recortarPoligono(pontos)} listening={false} opacity={opacidade}>
      <Shape sceneFunc={desenharSegmentos(segmentos)} stroke={cor} strokeWidth={1} strokeScaleEnabled={false} />
    </Group>
  );
});

/** Cumeeira/espigões (ou o trecho `fracao` deles, na animação), recortados pelo polígono. */
export function Cumeeira(props: { pontos: Ponto[]; segmentos: Segmento[]; cor: string; fracao?: number }) {
  const { pontos, segmentos, cor, fracao = 1 } = props;
  const parciais = fracao >= 1 ? segmentos : segmentos.map(({ a, b }) => ({ a, b: { x: a.x + (b.x - a.x) * fracao, y: a.y + (b.y - a.y) * fracao } }));
  return (
    <Group clipFunc={recortarPoligono(pontos)} listening={false}>
      <Shape
        sceneFunc={desenharSegmentos(parciais)}
        stroke={cor}
        strokeWidth={LARGURA_CUMEEIRA_PX}
        strokeScaleEnabled={false}
        dash={TRACEJADO_CUMEEIRA}
      />
    </Group>
  );
}

export function Simbolo({ estilo, cor, tracejado }: { estilo: EstiloTipo; cor: string; tracejado?: number[] }) {
  const t = estilo.tamanhoPx;
  const comum = {
    fill: estilo.simboloCheio ? cor : comAlfa(cor, 0.15),
    stroke: cor,
    strokeWidth: estilo.larguraPx,
    dash: tracejado,
  };
  if (estilo.simbolo === 'circulo') return <Circle radius={t / 2} {...comum} />;
  if (estilo.simbolo === 'losango') return <RegularPolygon sides={4} radius={t / 2} {...comum} />;
  return <Rect x={-t / 2} y={-t / 2} width={t} height={t} {...comum} />;
}

export interface FormaElementoProps {
  elemento: Elemento;
  zoom: number;
  /** Escala da página (m por unidade) ou null. */
  escala: number | null;
  selecionado: boolean;
  /** Mouse em cima do elemento. */
  sobre: boolean;
  /** Modo 'selecionar': responde a cliques e permite arrastar pontos. */
  interativo: boolean;
  /** Letra/número dentro do símbolo. */
  simbolo: string;
  /** Etiqueta a exibir (null = oculta; quem decide é o AreaPlanta, pela legibilidade). */
  texto: string | null;
  /** Tamanho relativo (0..1) dos símbolos de ponto: menores quando há muitos. */
  fatorSimbolo: number;
  /** Pontos provisórios enquanto um vértice é arrastado. */
  pontosProvisorios?: Ponto[];
  aoPressionar(id: string, adicionar: boolean): void;
  aoMoverPonto(id: string, ponto: Ponto, no: Konva.Node): void;
  /** Mouse entrou (true) ou saiu (false) do elemento. */
  aoPassar(id: string, dentro: boolean): void;
}

export const FormaElemento = memo(function FormaElemento(props: FormaElementoProps) {
  const { elemento: el, zoom, escala, selecionado, sobre, interativo, simbolo, texto, fatorSimbolo, pontosProvisorios } = props;
  const entrar = () => props.aoPassar(el.id, true);
  const sair = () => props.aoPassar(el.id, false);
  const estilo = ESTILO_TIPO[el.tipo];
  const pendente = el.status === 'pendente';
  const cor = pendente ? COR_PENDENTE : COR_DISCIPLINA[el.disciplina];
  const tracejado = pendente
    ? TRACEJADO_PENDENTE
    : el.tipo === 'calha'
      ? tracejadoCalha(el.props.funcao, TRACEJADO_RUFO)
      : estilo.tracejado;
  const pressionar = (e: KonvaEventObject<MouseEvent>) => {
    if (e.evt.button === 0) props.aoPressionar(el.id, e.evt.shiftKey);
  };

  if (el.geometria.tipo === 'ponto') {
    const p = el.geometria.ponto;
    const t = estilo.tamanhoPx;
    const fonte = fonteEtiqueta(el, selecionado || sobre);
    const deslocamento = ancoraEtiqueta(el, [], zoom, fatorSimbolo).deslocamentoPx;
    const comLetra = simbolo !== '' && TAMANHO_FONTE_PX * fatorSimbolo >= FONTE_MIN_LETRA_PX;
    return (
      <Group
        x={p.x}
        y={p.y}
        scaleX={1 / zoom}
        scaleY={1 / zoom}
        draggable={interativo}
        onMouseDown={pressionar}
        onMouseEnter={entrar}
        onMouseLeave={sair}
        onDragEnd={(e) => props.aoMoverPonto(el.id, { x: e.target.x(), y: e.target.y() }, e.target)}
      >
        {selecionado && (
          <Circle radius={(t / 2) * fatorSimbolo + LARGURA_EXTRA_SELECAO_PX} stroke={COR_SELECAO} strokeWidth={2} listening={false} />
        )}
        <Group scaleX={fatorSimbolo} scaleY={fatorSimbolo}>
        <Simbolo estilo={estilo} cor={cor} tracejado={tracejado} />
        {comLetra && (
          <Text
            text={simbolo}
            x={-t}
            y={-t / 2}
            width={2 * t}
            height={t}
            align="center"
            verticalAlign="middle"
            fontSize={TAMANHO_FONTE_PX}
            fontStyle="bold"
            fill={estilo.simboloCheio ? COR_TEXTO_SIMBOLO : cor}
            listening={false}
          />
        )}
        </Group>
        {texto && (
          <Label x={deslocamento} y={-fonte / 2 - PADDING_ETIQUETA_PX} listening={false}>
            <Tag fill={COR_FUNDO_ETIQUETA} opacity={OPACIDADE_FUNDO_ETIQUETA} cornerRadius={3} />
            <Text text={texto} fontSize={fonte} padding={PADDING_ETIQUETA_PX} fill={COR_TEXTO_ETIQUETA} />
          </Label>
        )}
      </Group>
    );
  }

  const pontos = pontosProvisorios ?? el.geometria.pontos;
  if (pontos.length < 2) return null;
  const fechado = el.geometria.tipo === 'poligono';
  const coords = achatar(pontos);
  // parede: espessura real (unidades do PDF, acompanha o zoom); demais: traço em px de tela
  const ehParede = el.tipo === 'parede';
  const largura = ehParede
    ? larguraParedeUnidades(el.props.espessura, escala, zoom, ESPESSURA_MIN_PAREDE_PX)
    : estilo.larguraPx;
  const hachurado = fechado && TIPOS_HACHURADOS.includes(el.tipo);
  // telhado: fica por baixo e só recebe o clique pelo contorno (não cobre ambientes/pilares/paredes)
  const soContorno = el.tipo === 'telhado';
  const preenchimento = fechado && estilo.preenchimento > 0 ? comAlfa(cor, estilo.preenchimento) : undefined;
  const cumeeira = el.tipo === 'telhado' ? linhasCumeeira(pontos, el.props.aguas, el.props.direcao) : [];
  const ancora = ancoraEtiqueta(el, pontos, zoom);
  const noCanto = ancora.modo === 'canto';
  const centro = ancora.ponto;
  return (
    <Group onMouseDown={pressionar} onMouseEnter={entrar} onMouseLeave={sair}>
      {selecionado && (
        <Line
          points={coords}
          closed={fechado}
          stroke={COR_SELECAO}
          opacity={0.6}
          strokeWidth={ehParede ? largura + LARGURA_EXTRA_SELECAO_PX / zoom : largura + LARGURA_EXTRA_SELECAO_PX}
          strokeScaleEnabled={ehParede}
          lineJoin="round"
          listening={false}
        />
      )}
      {soContorno && preenchimento && <Line points={coords} closed fill={preenchimento} listening={false} />}
      {hachurado && <Hachura pontos={pontos} zoom={zoom} cor={cor} />}
      {cumeeira.length > 0 && <Cumeeira pontos={pontos} segmentos={cumeeira} cor={cor} />}
      <Line
        points={coords}
        closed={fechado}
        stroke={cor}
        opacity={ehParede ? OPACIDADE_PAREDE : 1}
        strokeWidth={largura}
        strokeScaleEnabled={ehParede}
        dash={ehParede && tracejado ? tracejado.map((d) => d / zoom) : tracejado}
        fill={soContorno ? undefined : preenchimento}
        // sem isso o Konva preenche a área de clique de polígonos mesmo sem cor de preenchimento
        fillEnabled={!soContorno}
        hitStrokeWidth={ehParede ? Math.max(largura, LARGURA_TOQUE_PX / zoom) : LARGURA_TOQUE_PX}
        lineJoin="round"
      />
      {texto && (
        <Etiqueta x={centro.x} y={centro.y} zoom={zoom} texto={texto} centralizada={!noCanto} cantoSuperiorEsquerdo={noCanto} />
      )}
    </Group>
  );
});

export interface FormaDerivadaProps {
  derivado: GeometriaDerivada;
  zoom: number;
  interativo: boolean;
  /** Mostrar o rótulo (rota sob o mouse ou elemento associado destacado). */
  mostrarRotulo: boolean;
  aoPressionar(id: string, adicionar: boolean): void;
  aoPassar(id: string, dentro: boolean): void;
}

/** Rota automática: linha tracejada fina na cor da disciplina (ou de pendente). */
export const FormaDerivada = memo(function FormaDerivada(props: FormaDerivadaProps) {
  const { derivado, zoom, interativo, mostrarRotulo, aoPressionar, aoPassar } = props;
  if (derivado.pontos.length < 2) return null;
  const cor = derivado.status === 'pendente' ? COR_PENDENTE : COR_DISCIPLINA[derivado.disciplina];
  const meio = pontoMedio(derivado.pontos);
  const alvo = derivado.elementoId;
  return (
    <Group>
      <Line
        points={achatar(derivado.pontos)}
        stroke={cor}
        strokeWidth={LARGURA_DERIVADO_PX}
        strokeScaleEnabled={false}
        dash={TRACEJADO_DERIVADO}
        hitStrokeWidth={LARGURA_TOQUE_PX}
        onMouseEnter={() => aoPassar(derivado.id, true)}
        onMouseLeave={() => aoPassar(derivado.id, false)}
        onMouseDown={(e) => {
          if (interativo && alvo !== undefined && e.evt.button === 0) aoPressionar(alvo, e.evt.shiftKey);
        }}
      />
      {mostrarRotulo && derivado.rotulo && <Etiqueta x={meio.x} y={meio.y} zoom={zoom} texto={derivado.rotulo} centralizada />}
    </Group>
  );
});
