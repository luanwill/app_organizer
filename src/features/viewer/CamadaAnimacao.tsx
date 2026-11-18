/** Camada Konva da apresentação "analisando a planta" (scanner, grade, elementos surgindo). */
import { memo, useEffect, useMemo, useState } from 'react';
import type Konva from 'konva';
import { Circle, Group, Layer, Line, Rect, Shape, Text } from 'react-konva';
import { COR_DISCIPLINA, type Elemento, type Ponto } from '@/core/model';
import { areaPoligono, centroidePoligono, formatarQuantidade, paraM2 } from '@/core/calc';
import {
  BRILHO_SCANNER_PX,
  CASAS_MEDIDA,
  comAlfa,
  COR_DESTAQUE,
  COR_TEXTO_SIMBOLO,
  ESPESSURA_MIN_PAREDE_PX,
  ESTILO_TIPO,
  BRILHO_TRACO_PX,
  FRACAO_BRILHO_FINAL,
  FRACAO_POP,
  GRADE_PRINCIPAL_A_CADA,
  HALO_SCANNER_PX,
  LARGURA_SCANNER_PX,
  OPACIDADE_BRILHO_FINAL,
  OPACIDADE_BRILHO_TRACO,
  OPACIDADE_ESCURECIMENTO,
  OPACIDADE_GRADE,
  OPACIDADE_GRADE_FUNDO,
  PASSO_GRADE_PX,
  RAIO_CABECA_TRACO_PX,
  RAIO_PULSO_PX,
  TAMANHO_FONTE_PX,
} from './config';
import { linhasGrade, polilinhaParcial, suavizarPop, suavizarSaida, type FaseAnimacao } from './animacao';
import { Etiqueta, Simbolo } from './FormaElemento';
import { rotuloDoElemento, type ContextoRotulo } from './rotulos';
import { larguraParedeUnidades } from './elementos';

/** prefers-reduced-motion (acompanha mudanças do sistema). */
export function useReduzirMovimento(): boolean {
  const consulta = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const [reduzir, setReduzir] = useState(() => consulta?.matches ?? false);
  useEffect(() => {
    if (!consulta) return;
    const aoMudar = () => setReduzir(consulta.matches);
    consulta.addEventListener('change', aoMudar);
    return () => consulta.removeEventListener('change', aoMudar);
  }, [consulta?.media]); // eslint-disable-line react-hooks/exhaustive-deps
  return reduzir;
}

export interface ItemAnimado {
  el: Elemento;
  /** 0..1 da animação própria do elemento. */
  t: number;
  fase: FaseAnimacao;
}

export interface CamadaAnimacaoProps {
  fase: FaseAnimacao;
  progresso: number;
  /** Dimensões da página (unidades do PDF). */
  largura: number;
  altura: number;
  zoom: number;
  escala: number | null;
  /** Elementos da fase atual que já começaram a aparecer (t = 1: já apareceram). */
  itens: ItemAnimado[];
  contextoRotulo: ContextoRotulo;
}

const achatar = (pontos: Ponto[]) => pontos.flatMap((p) => [p.x, p.y]);

/** Grade técnica num único nó (Shape), para não criar centenas de linhas. */
const Grade = memo(function Grade(props: { largura: number; altura: number; zoom: number; opacidade: number }) {
  const { largura, altura, zoom, opacidade } = props;
  const passo = PASSO_GRADE_PX / zoom;
  const { xs, ys } = useMemo(() => linhasGrade(largura, altura, passo), [largura, altura, passo]);
  const desenhar = (principal: boolean) => (ctx: Konva.Context, shape: Konva.Shape) => {
    ctx.beginPath();
    xs.forEach((x, i) => {
      if ((i % GRADE_PRINCIPAL_A_CADA === 0) !== principal) return;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, altura);
    });
    ys.forEach((y, i) => {
      if ((i % GRADE_PRINCIPAL_A_CADA === 0) !== principal) return;
      ctx.moveTo(0, y);
      ctx.lineTo(largura, y);
    });
    ctx.strokeShape(shape);
  };
  return (
    <Group opacity={opacidade} listening={false}>
      <Shape sceneFunc={desenhar(false)} stroke={COR_DESTAQUE} strokeWidth={0.5} strokeScaleEnabled={false} opacity={0.6} />
      <Shape sceneFunc={desenhar(true)} stroke={COR_DESTAQUE} strokeWidth={1} strokeScaleEnabled={false} />
    </Group>
  );
});

function Varredura({ progresso, largura, altura, zoom }: { progresso: number; largura: number; altura: number; zoom: number }) {
  const y = altura * Math.min(1, Math.max(0, progresso));
  const halo = HALO_SCANNER_PX / zoom;
  return (
    <Group listening={false}>
      {/* PDF ainda não lido: escurecido */}
      <Rect x={0} y={y} width={largura} height={altura - y} fill="#000" opacity={OPACIDADE_ESCURECIMENTO} />
      {/* grade só na faixa já varrida */}
      <Group clipX={0} clipY={0} clipWidth={largura} clipHeight={y}>
        <Grade largura={largura} altura={altura} zoom={zoom} opacidade={OPACIDADE_GRADE} />
      </Group>
      <Rect
        x={0}
        y={y - halo}
        width={largura}
        height={halo}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }}
        fillLinearGradientEndPoint={{ x: 0, y: halo }}
        fillLinearGradientColorStops={[0, comAlfa(COR_DESTAQUE, 0), 1, comAlfa(COR_DESTAQUE, 0.4)]}
      />
      <Line
        points={[0, y, largura, y]}
        stroke="#ffffff"
        strokeWidth={LARGURA_SCANNER_PX}
        strokeScaleEnabled={false}
        shadowColor={COR_DESTAQUE}
        shadowBlur={BRILHO_SCANNER_PX}
        shadowOpacity={1}
        shadowForStrokeEnabled
      />
    </Group>
  );
}

const TracoAnimado = memo(function TracoAnimado(props: { el: Elemento; t: number; fase: FaseAnimacao; zoom: number; escala: number | null }) {
  const { el, t, fase, zoom, escala } = props;
  if (el.geometria.tipo === 'ponto') return null;
  const fechado = el.geometria.tipo === 'poligono';
  const cor = COR_DISCIPLINA[el.disciplina];
  const brilho = fase === 'paredes' ? COR_DESTAQUE : cor;
  const estilo = ESTILO_TIPO[el.tipo];
  const ehParede = el.tipo === 'parede';
  // parede: espessura real (unidades do PDF); demais: px de tela
  const largura = ehParede ? larguraParedeUnidades(el.props.espessura, escala, zoom, ESPESSURA_MIN_PAREDE_PX) : estilo.larguraPx / zoom;
  const fracTraco = suavizarSaida(fechado ? Math.min(1, t * 1.6) : t);
  const pts = polilinhaParcial(el.geometria.pontos, fracTraco, fechado);
  const cabeca = pts[pts.length - 1];
  const decai = 1 - t;
  return (
    <Group listening={false}>
      {fechado && (
        <Line
          points={achatar(el.geometria.pontos)}
          closed
          fill={comAlfa(cor, Math.max(estilo.preenchimento, 0.12) * 1.6)}
          opacity={suavizarSaida(t)}
        />
      )}
      {pts.length >= 2 && (
        <>
          {decai > 0 && (
          <Line
            points={achatar(pts)}
            stroke={brilho}
            strokeWidth={largura + BRILHO_TRACO_PX / zoom}
            opacity={OPACIDADE_BRILHO_TRACO * decai}
            lineCap="round"
            lineJoin="round"
          />
          )}
          <Line points={achatar(pts)} stroke={cor} strokeWidth={largura} lineCap="round" lineJoin="round" />
        </>
      )}
      {fracTraco < 1 && cabeca && <Circle x={cabeca.x} y={cabeca.y} radius={RAIO_CABECA_TRACO_PX / zoom} fill="#ffffff" />}
    </Group>
  );
});

const PontoAnimado = memo(function PontoAnimado(props: { el: Elemento; t: number; zoom: number; simbolo: string }) {
  const { el, t, zoom, simbolo } = props;
  if (el.geometria.tipo !== 'ponto') return null;
  const p = el.geometria.ponto;
  const estilo = ESTILO_TIPO[el.tipo];
  const cor = COR_DISCIPLINA[el.disciplina];
  const escalaPop = t < FRACAO_POP ? Math.max(0, suavizarPop(t / FRACAO_POP)) : 1;
  const pulso = suavizarSaida(t);
  const tam = estilo.tamanhoPx;
  return (
    <Group x={p.x} y={p.y} scaleX={1 / zoom} scaleY={1 / zoom} listening={false}>
      {t < 1 && <Circle radius={tam / 2 + RAIO_PULSO_PX * pulso} stroke={cor} strokeWidth={2} opacity={1 - t} />}
      <Group scaleX={escalaPop} scaleY={escalaPop}>
        <Simbolo estilo={estilo} cor={cor} />
        {simbolo !== '' && (
          <Text
            text={simbolo}
            x={-tam}
            y={-tam / 2}
            width={2 * tam}
            height={tam}
            align="center"
            verticalAlign="middle"
            fontSize={TAMANHO_FONTE_PX}
            fontStyle="bold"
            fill={estilo.simboloCheio ? COR_TEXTO_SIMBOLO : cor}
          />
        )}
      </Group>
    </Group>
  );
});

const RotuloArea = memo(function RotuloArea(props: { el: Elemento; t: number; zoom: number; escala: number | null }) {
  const r = rotuloArea(props.el, props.t, props.escala);
  return r && <Etiqueta x={r.centro.x} y={r.centro.y} zoom={props.zoom} texto={r.texto} centralizada />;
});

function rotuloArea(el: Elemento, t: number, escala: number | null): { centro: Ponto; texto: string } | null {
  if (el.geometria.tipo !== 'poligono' || el.geometria.pontos.length < 3) return null;
  const nome = el.rotulo ?? (el.tipo === 'ambiente' ? el.props.nome : '') ?? '';
  const linhas = nome ? [nome] : [];
  if (escala !== null && escala > 0) {
    const area = paraM2(areaPoligono(el.geometria.pontos), escala);
    linhas.push(formatarQuantidade(area * suavizarSaida(t), 'm²', CASAS_MEDIDA));
  }
  if (linhas.length === 0) return null;
  return { centro: centroidePoligono(el.geometria.pontos), texto: linhas.join('\n') };
}

export function CamadaAnimacao(props: CamadaAnimacaoProps) {
  const { fase, progresso, largura, altura, zoom, escala, itens, contextoRotulo } = props;
  const fundo = fase !== 'varredura' && fase !== 'materiais' && fase !== 'concluida';
  const brilhoFinal = fase === 'materiais' && progresso < FRACAO_BRILHO_FINAL ? 1 - progresso / FRACAO_BRILHO_FINAL : 0;
  return (
    <Layer listening={false}>
      {fase === 'varredura' && <Varredura progresso={progresso} largura={largura} altura={altura} zoom={zoom} />}
      {fundo && <Grade largura={largura} altura={altura} zoom={zoom} opacidade={OPACIDADE_GRADE_FUNDO} />}
      {/* polígonos embaixo, depois linhas, pontos por cima */}
      {itens
        .filter((i) => i.el.geometria.tipo === 'poligono')
        .map(({ el, t }) => <TracoAnimado key={el.id} el={el} t={t} fase={fase} zoom={zoom} escala={escala} />)}
      {itens
        .filter((i) => i.el.geometria.tipo === 'polilinha')
        .map(({ el, t }) => <TracoAnimado key={el.id} el={el} t={t} fase={fase} zoom={zoom} escala={escala} />)}
      {itens
        .filter((i) => i.el.geometria.tipo === 'ponto')
        .map(({ el, t }) => (
          <PontoAnimado key={el.id} el={el} t={t} zoom={zoom} simbolo={rotuloDoElemento(el, contextoRotulo).simbolo} />
        ))}
      {/* fase 'ambientes': nome + área crescente até o valor */}
      {fase === 'ambientes' &&
        itens
          .filter((i) => i.el.geometria.tipo === 'poligono')
          .map(({ el, t }) => <RotuloArea key={el.id} el={el} t={t} zoom={zoom} escala={escala} />)}
      {brilhoFinal > 0 && (
        <Rect x={0} y={0} width={largura} height={altura} fill={COR_DESTAQUE} opacity={OPACIDADE_BRILHO_FINAL * brilhoFinal} />
      )}
    </Layer>
  );
}
