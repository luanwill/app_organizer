/** Construção e edição de elementos a partir das ferramentas. Lógica pura. */
import {
  DISCIPLINA_DO_TIPO,
  type Elemento,
  type ElementoDe,
  type Ferramenta,
  type Geometria,
  type ModoMedicao,
  type PatchElemento,
  type Ponto,
  type Vinculos,
} from '@/core/model';
import { paraUnidades, pontoEmPoligono, projetarNaPolilinha, retanguloParaPoligono } from '@/core/calc';
import { DICA_SEM_PAREDE, tipoGeometriaDoModo } from './desenho';

/** Geometria produzida por um modo a partir dos pontos clicados (null se insuficientes). */
export function geometriaDoModo(modo: Ferramenta['modo'], pontos: Ponto[]): Geometria | null {
  const tipo = tipoGeometriaDoModo(modo);
  if (tipo === 'ponto') {
    return pontos.length >= 1 ? { tipo: 'ponto', ponto: { ...pontos[0] } } : null;
  }
  if (tipo === 'polilinha') {
    return pontos.length >= 2 ? { tipo: 'polilinha', pontos: pontos.map((p) => ({ ...p })) } : null;
  }
  if (tipo === 'poligono') {
    if (modo === 'retangulo') {
      return pontos.length >= 2 ? { tipo: 'poligono', pontos: retanguloParaPoligono(pontos[0], pontos[1]) } : null;
    }
    return pontos.length >= 3 ? { tipo: 'poligono', pontos: pontos.map((p) => ({ ...p })) } : null;
  }
  return null;
}

export interface DadosNovoElemento {
  ferramenta: Ferramenta;
  /** Pontos clicados (unidades do PDF). */
  pontos: Ponto[];
  pagina: number;
  id: string;
  /** projeto.parametros.gerais.espessuraParede (pode ser null — não se inventa valor). */
  espessuraParede: number | null;
}

/**
 * Cria o Elemento de um desenho concluído (origem 'desenhado', status 'confirmado', vínculos vazios).
 * Com alvo: tipo/props/rótulo do alvo. Sem alvo: 'parede' no modo parede; 'medicao' nos demais.
 * null se o modo não desenha ou os pontos são insuficientes.
 */
export function construirElemento(dados: DadosNovoElemento): Elemento | null {
  const { ferramenta, pontos, pagina, id, espessuraParede } = dados;
  const geometria = geometriaDoModo(ferramenta.modo, pontos);
  if (!geometria) return null;
  const base = { id, pagina, geometria, vinculos: {}, origem: 'desenhado', status: 'confirmado' } as const;
  const alvo = ferramenta.alvo;
  if (alvo) {
    const el = { ...base, disciplina: DISCIPLINA_DO_TIPO[alvo.tipo], tipo: alvo.tipo, props: { ...alvo.props } } as Elemento;
    if (alvo.rotulo !== undefined) el.rotulo = alvo.rotulo;
    return el;
  }
  if (ferramenta.modo === 'parede') {
    return { ...base, disciplina: DISCIPLINA_DO_TIPO.parede, tipo: 'parede', props: { espessura: espessuraParede } };
  }
  return {
    ...base,
    disciplina: DISCIPLINA_DO_TIPO.medicao,
    tipo: 'medicao',
    props: { modo: ferramenta.modo as ModoMedicao, descricao: '' },
  };
}

export interface ParedeProxima {
  parede: ElementoDe<'parede'>;
  /** Ponto projetado no eixo da parede. */
  ponto: Ponto;
  distancia: number;
}

/** Parede da página cujo eixo está mais perto do ponto. */
export function paredeMaisProxima(p: Ponto, elementos: Elemento[], pagina: number): ParedeProxima | null {
  let melhor: ParedeProxima | null = null;
  for (const el of elementos) {
    if (el.tipo !== 'parede' || el.pagina !== pagina || el.geometria.tipo !== 'polilinha') continue;
    if (el.geometria.pontos.length < 2) continue;
    const proj = projetarNaPolilinha(p, el.geometria.pontos);
    if (!melhor || proj.distancia < melhor.distancia) {
      melhor = { parede: el, ponto: proj.ponto, distancia: proj.distancia };
    }
  }
  return melhor;
}

/** Id do ambiente da página que contém o ponto (undefined se nenhum). */
export function ambienteDoPonto(p: Ponto, elementos: Elemento[], pagina: number): string | undefined {
  for (const el of elementos) {
    if (el.tipo !== 'ambiente' || el.pagina !== pagina || el.geometria.tipo !== 'poligono') continue;
    if (pontoEmPoligono(p, el.geometria.pontos)) return el.id;
  }
  return undefined;
}

function comAmbiente(vinculos: Vinculos, ambienteId: string | undefined): Vinculos {
  const { ambienteId: _anterior, ...resto } = vinculos;
  return ambienteId ? { ...resto, ambienteId } : resto;
}

/**
 * Posiciona um elemento de ponto: esquadria é projetada na parede mais próxima (dentro de
 * `distanciaMaxParede`, em unidades do PDF; Infinity = sem limite) e ganha vinculos.paredeId;
 * todo ponto ganha vinculos.ambienteId se cair dentro de um ambiente.
 */
function posicionarPonto(
  el: Elemento,
  ponto: Ponto,
  elementos: Elemento[],
  distanciaMaxParede: number,
): { geometria: Geometria; vinculos: Vinculos } | { erro: string } {
  let destino = ponto;
  let vinculos = el.vinculos;
  if (el.tipo === 'esquadria') {
    const proxima = paredeMaisProxima(ponto, elementos, el.pagina);
    if (!proxima || proxima.distancia > distanciaMaxParede) return { erro: DICA_SEM_PAREDE };
    destino = proxima.ponto;
    vinculos = { ...vinculos, paredeId: proxima.parede.id };
  }
  vinculos = comAmbiente(vinculos, ambienteDoPonto(destino, elementos, el.pagina));
  return { geometria: { tipo: 'ponto', ponto: { x: destino.x, y: destino.y } }, vinculos };
}

/** Preenche os vínculos automáticos de um elemento recém-desenhado. */
export function vincularElemento(
  el: Elemento,
  elementos: Elemento[],
  distanciaMaxParede: number,
): { elemento: Elemento } | { erro: string } {
  if (el.geometria.tipo !== 'ponto') {
    return el.tipo === 'esquadria' ? { erro: DICA_SEM_PAREDE } : { elemento: el };
  }
  const r = posicionarPonto(el, el.geometria.ponto, elementos, distanciaMaxParede);
  if ('erro' in r) return r;
  return { elemento: { ...el, geometria: r.geometria, vinculos: r.vinculos } };
}

/**
 * Patch para mover um elemento de ponto: recalcula vinculos.ambienteId; esquadria continua
 * projetada na parede mais próxima (se não houver parede na página, fica onde está).
 */
export function moverPonto(el: Elemento, novo: Ponto, elementos: Elemento[]): PatchElemento | null {
  if (el.geometria.tipo !== 'ponto') return null;
  const outros = elementos.filter((e) => e.id !== el.id);
  const r = posicionarPonto(el, novo, outros, Infinity);
  if ('erro' in r) return null;
  return { geometria: r.geometria, vinculos: r.vinculos };
}

/** Geometria com um vértice movido. */
export function moverVertice(geometria: Geometria, indice: number, ponto: Ponto): Geometria {
  if (geometria.tipo === 'ponto') return { tipo: 'ponto', ponto: { ...ponto } };
  return { tipo: geometria.tipo, pontos: geometria.pontos.map((p, i) => (i === indice ? { ...ponto } : p)) };
}

export function pontosDaGeometria(geometria: Geometria): Ponto[] {
  return geometria.tipo === 'ponto' ? [geometria.ponto] : geometria.pontos;
}

/** Vértices candidatos ao snap. `ignorar` exclui um vértice (o que está sendo arrastado). */
export function verticesDeSnap(elementos: Elemento[], ignorar?: { id: string; indice: number }): Ponto[] {
  const saida: Ponto[] = [];
  for (const el of elementos) {
    pontosDaGeometria(el.geometria).forEach((p, i) => {
      if (ignorar && ignorar.id === el.id && ignorar.indice === i) return;
      saida.push(p);
    });
  }
  return saida;
}

/** Espessura desenhada da parede em unidades do PDF: a real (se houver espessura e escala) com mínimo visível. */
export function larguraParedeUnidades(
  espessura: number | null,
  escala: number | null,
  zoom: number,
  minimoPx: number,
): number {
  const minima = minimoPx / zoom;
  if (espessura === null || escala === null || !(escala > 0) || !(espessura > 0)) return minima;
  return Math.max(paraUnidades(espessura, escala), minima);
}

/** Ordem de desenho: polígonos embaixo, linhas no meio, pontos por cima. */
export function ordenarParaDesenho(elementos: Elemento[]): Elemento[] {
  const ordem = { poligono: 0, polilinha: 1, ponto: 2 } as const;
  return [...elementos].sort((a, b) => ordem[a.geometria.tipo] - ordem[b.geometria.tipo]);
}
