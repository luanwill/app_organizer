/** Desenho (react-konva) de um elemento, de uma etiqueta e de uma rota derivada. */
import { memo } from 'react';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Circle, Group, Label, Line, Rect, RegularPolygon, Tag, Text } from 'react-konva';
import { COR_DISCIPLINA, COR_PENDENTE, type Elemento, type GeometriaDerivada, type Ponto } from '@/core/model';
import { centroidePoligono } from '@/core/calc';
import {
  comAlfa,
  COR_FUNDO_ETIQUETA,
  COR_SELECAO,
  COR_TEXTO_ETIQUETA,
  COR_TEXTO_SIMBOLO,
  DESLOCAMENTO_ETIQUETA_PX,
  ESPESSURA_MIN_PAREDE_PX,
  ESTILO_TIPO,
  LARGURA_DERIVADO_PX,
  LARGURA_EXTRA_SELECAO_PX,
  LARGURA_TOQUE_PX,
  MARGEM_ROTULO_AMBIENTE_PX,
  OPACIDADE_FUNDO_ETIQUETA,
  OPACIDADE_PAREDE,
  PADDING_ETIQUETA_PX,
  TAMANHO_FONTE_PEQUENA_PX,
  TAMANHO_FONTE_PX,
  TIPOS_PONTO_COM_ROTULO_FIXO,
  TRACEJADO_DERIVADO,
  TRACEJADO_PENDENTE,
  type EstiloTipo,
} from './config';
import { larguraParedeUnidades } from './elementos';
import { ancoraRotuloAmbiente, rotuloVisivel } from './rotulos';

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
      <Text text={texto} fontSize={TAMANHO_FONTE_PX} padding={PADDING_ETIQUETA_PX} fill={COR_TEXTO_ETIQUETA} />
    </Label>
  );
}

function Simbolo({ estilo, cor, tracejado }: { estilo: EstiloTipo; cor: string; tracejado?: number[] }) {
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
  /** Etiqueta do elemento. */
  texto: string | null;
  /** Pontos provisórios enquanto um vértice é arrastado. */
  pontosProvisorios?: Ponto[];
  aoPressionar(id: string, adicionar: boolean): void;
  aoMoverPonto(id: string, ponto: Ponto, no: Konva.Node): void;
  /** Mouse entrou (true) ou saiu (false) do elemento. */
  aoPassar(id: string, dentro: boolean): void;
}

export const FormaElemento = memo(function FormaElemento(props: FormaElementoProps) {
  const { elemento: el, zoom, escala, selecionado, sobre, interativo, simbolo, pontosProvisorios } = props;
  const texto = props.texto && rotuloVisivel(el, selecionado || sobre) ? props.texto : null;
  const entrar = () => props.aoPassar(el.id, true);
  const sair = () => props.aoPassar(el.id, false);
  const estilo = ESTILO_TIPO[el.tipo];
  const pendente = el.status === 'pendente';
  const cor = pendente ? COR_PENDENTE : COR_DISCIPLINA[el.disciplina];
  const tracejado = pendente ? TRACEJADO_PENDENTE : estilo.tracejado;
  const pressionar = (e: KonvaEventObject<MouseEvent>) => {
    if (e.evt.button === 0) props.aoPressionar(el.id, e.evt.shiftKey);
  };

  if (el.geometria.tipo === 'ponto') {
    const p = el.geometria.ponto;
    const t = estilo.tamanhoPx;
    // rótulo fixo (pilar, esquadria) em fonte pequena; ao destacar, fonte normal
    const fonte = TIPOS_PONTO_COM_ROTULO_FIXO.includes(el.tipo) && !selecionado && !sobre ? TAMANHO_FONTE_PEQUENA_PX : TAMANHO_FONTE_PX;
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
          <Circle radius={t / 2 + LARGURA_EXTRA_SELECAO_PX} stroke={COR_SELECAO} strokeWidth={2} listening={false} />
        )}
        <Simbolo estilo={estilo} cor={cor} tracejado={tracejado} />
        {simbolo !== '' && (
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
        {texto && (
          <Label x={t / 2 + DESLOCAMENTO_ETIQUETA_PX} y={-fonte / 2 - PADDING_ETIQUETA_PX} listening={false}>
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
  // nome do ambiente: no canto superior esquerdo interno (o centro costuma ter o ponto de luz)
  const noCanto = el.tipo === 'ambiente' && fechado;
  const centro = noCanto
    ? ancoraRotuloAmbiente(pontos, MARGEM_ROTULO_AMBIENTE_PX / zoom)
    : fechado
      ? centroidePoligono(pontos)
      : pontoMedio(pontos);
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
      <Line
        points={coords}
        closed={fechado}
        stroke={cor}
        opacity={ehParede ? OPACIDADE_PAREDE : 1}
        strokeWidth={largura}
        strokeScaleEnabled={ehParede}
        dash={ehParede && tracejado ? tracejado.map((d) => d / zoom) : tracejado}
        fill={fechado && estilo.preenchimento > 0 ? comAlfa(cor, estilo.preenchimento) : undefined}
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
