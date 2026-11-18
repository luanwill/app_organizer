/**
 * Reconhecimento de paredes e ambientes a partir de traços vetoriais (PDF exportado de CAD). Função PURA,
 * sem pdfjs: recebe segmentos e textos em unidades da página e devolve candidatos 'importado' + 'pendente'.
 *
 * Dois jeitos de achar paredes, comparados a cada página (vence o que fecha mais cômodos com nome):
 *  - traço duplo: pares de linhas paralelas na distância de parede (AutoCAD, plantas técnicas);
 *  - poché: áreas preenchidas com a cara de parede, uma cor por vez (plantas humanizadas, SketchUp/Layout,
 *    Revit, ArchiCAD) — ver poche.ts.
 * Depois: trechos colineares são unidos (vãos de porta; janelas só com caixilho desenhado) → eixos são
 * estendidos até os encontros → as faces fechadas do grafo de paredes viram ambientes, recuados para a face
 * interna das paredes → só ficam os conjuntos de paredes que têm um cômodo com nome reconhecido (a mesma
 * folha costuma trazer cortes, elevações e carimbo).
 */
import type { Elemento, ElementoDe, Ponto, ResultadoImportacao } from '@/core/model';
import {
  areaComSinal,
  areaPoligono,
  construirGrafoParedes,
  distancia,
  escalaValida,
  formatarNumero,
  lerNumero,
  pontoEmPoligono,
} from '@/core/calc';
import { novoId } from '@/core/store';
import { classificarAmbiente, naoEhNomeDeAmbiente, type Classificacao, type TextoPosicionado } from './ambientes';
import { RECONHECIMENTO_PDF } from './config';
import { detectarParedes } from './dxf';
import { indiceDeVaos, SEM_EVIDENCIA, SEM_EVIDENCIAS, type EvidenciasDeVao, type TemEvidencia } from './esquadrias';
import { paredesDosPreenchimentos } from './poche';

export interface EntradaVetores {
  /** Traços retos, em unidades da página. */
  segmentos: [Ponto, Ponto][];
  textos: TextoPosicionado[];
  /** Largura do traço de cada segmento (opcional): traços mais grossos têm prioridade para formar paredes. */
  larguras?: number[];
  /** Áreas preenchidas (opcional), em unidades da página: base do método do poché. */
  preenchimentos?: { contornos: Ponto[][]; cor: string | null; parImpar: boolean }[];
  /** Cordas de arcos (opcional), em unidades da página: giro das portas, evidência de vão de porta. */
  arcos?: [Ponto, Ponto][];
}

export interface OpcoesReconhecimento {
  pagina: number;
  /** Metros por unidade da página; null = não calibrada (o reconhecimento não roda). */
  escala: number | null;
  /** Polígono (unidades da página) que limita a região analisada. */
  regiao?: Ponto[];
}

export type SituacaoReconhecimento = 'ok' | 'sem-escala' | 'nao-vetorial' | 'excesso' | 'nada';

export type ResultadoReconhecimento = ResultadoImportacao & {
  situacao: SituacaoReconhecimento;
  /** Mensagem principal quando a situação não é 'ok'. */
  mensagem?: string;
};

export const MENSAGEM_SEM_ESCALA = 'Calibre a escala antes de reconhecer';
export const MENSAGEM_NAO_VETORIAL =
  'Este PDF não é vetorial (parece uma imagem ou planta escaneada): não há traços para reconhecer automaticamente. Desenhe as paredes e os ambientes sobre a planta.';

/** O elemento foi gerado por este reconhecimento? (usado para trocar o resultado anterior ao rodar de novo) */
export function ehDoReconhecimentoPdf(elemento: Pick<Elemento, 'id' | 'origem'>): boolean {
  return elemento.origem === 'importado' && elemento.id.startsWith(RECONHECIMENTO_PDF.prefixoId);
}

// ---------------------------------------------------------------- paredes (em metros)

interface Parede {
  a: Ponto;
  b: Ponto;
  espessura: number;
  /** Largura do traço das faces (prioridade quando dois candidatos ocupam o mesmo lugar). */
  peso: number;
}

const C = RECONHECIMENTO_PDF;
const SENO_PARALELO = Math.sin((C.parede.toleranciaAngularGraus * Math.PI) / 180);

function direcao(p: Parede): { ux: number; uy: number; comprimento: number } {
  const comprimento = distancia(p.a, p.b);
  return { ux: (p.b.x - p.a.x) / comprimento, uy: (p.b.y - p.a.y) / comprimento, comprimento };
}

/**
 * Une trechos colineares de mesma espessura que se tocam, se sobrepõem (traços duplicados) ou estão
 * separados por um vão de até `vaoMaximoM` — ou maior, até `esquadria.vaoMaximoM`, quando há caixilho
 * desenhado no vão (janela, porta de correr). Devolve também quantos vãos de verdade foram fechados.
 */
export function unirColineares(entrada: Parede[], temEsquadria: TemEvidencia = SEM_EVIDENCIA): { paredes: Parede[]; vaos: number } {
  const paredes = entrada.map((p) => ({ ...p }));
  let vaos = 0;
  // cada união refaz a varredura só para a parede i (que cresceu), não a lista inteira
  for (let i = 0; i < paredes.length; i++) {
    let j = i + 1;
    while (j < paredes.length) {
      const pi = paredes[i]!;
      const pj = paredes[j]!;
      const di = direcao(pi);
      const dj = direcao(pj);
      const lateral = (q: Ponto): number => Math.abs(-(q.x - pi.a.x) * di.uy + (q.y - pi.a.y) * di.ux);
      const ao_longo = (q: Ponto): number => (q.x - pi.a.x) * di.ux + (q.y - pi.a.y) * di.uy;
      const t0 = Math.min(ao_longo(pj.a), ao_longo(pj.b));
      const t1 = Math.max(ao_longo(pj.a), ao_longo(pj.b));
      const vao = Math.max(t0 - di.comprimento, -t1);
      const alinhadas =
        Math.abs(pi.espessura - pj.espessura) <= C.toleranciaEspessuraM &&
        Math.abs(di.ux * dj.uy - di.uy * dj.ux) <= SENO_PARALELO &&
        lateral(pj.a) <= C.toleranciaColinearM &&
        lateral(pj.b) <= C.toleranciaColinearM;
      const pontoEm = (t: number): Ponto => ({ x: pi.a.x + di.ux * t, y: pi.a.y + di.uy * t });
      const une =
        alinhadas &&
        (vao <= C.vaoMaximoM ||
          (vao <= C.esquadria.vaoMaximoM &&
            (t0 > di.comprimento
              ? temEsquadria(pontoEm(di.comprimento), pontoEm(t0), pi.espessura)
              : temEsquadria(pontoEm(t1), pontoEm(0), pi.espessura))));
      if (!une) {
        j++;
        continue;
      }
      if (vao > C.parede.distanciaMaxM + C.folgaJuncaoM) vaos++; // maior que um encontro de paredes = vão
      const ini = Math.min(0, t0);
      const fim = Math.max(di.comprimento, t1);
      paredes[i] = {
        a: { x: pi.a.x + di.ux * ini, y: pi.a.y + di.uy * ini },
        b: { x: pi.a.x + di.ux * fim, y: pi.a.y + di.uy * fim },
        espessura: pi.espessura,
        peso: Math.max(pi.peso, pj.peso),
      };
      paredes.splice(j, 1);
      j = i + 1;
    }
  }
  return { paredes, vaos };
}

/**
 * Leva cada extremidade de eixo até o encontro com o eixo de outra parede não paralela, quando o encontro
 * está a no máximo meia espessura de cada uma (+ folga): fecha cantos em L e encontros em T.
 */
export function estenderAosEncontros(paredes: Parede[]): Parede[] {
  const dirs = paredes.map(direcao);
  const novaExtremidade = (i: number, ponta: Ponto): Ponto => {
    const pi = paredes[i]!;
    const di = dirs[i]!;
    let melhor: Ponto | null = null;
    let melhorDistancia = Infinity;
    paredes.forEach((pj, j) => {
      if (j === i) return;
      const dj = dirs[j]!;
      const cruz = di.ux * dj.uy - di.uy * dj.ux;
      if (Math.abs(cruz) <= SENO_PARALELO) return;
      // interseção das retas: pi.a + t·di = pj.a + s·dj
      const qx = pj.a.x - pi.a.x;
      const qy = pj.a.y - pi.a.y;
      const t = (qx * dj.uy - qy * dj.ux) / cruz;
      const s = (qx * di.uy - qy * di.ux) / cruz;
      const alcance = (pi.espessura + pj.espessura) / 2 + C.folgaJuncaoM;
      if (s < -alcance || s > dj.comprimento + alcance) return;
      const x: Ponto = { x: pi.a.x + t * di.ux, y: pi.a.y + t * di.uy };
      const d = distancia(ponta, x);
      if (d <= alcance && d < melhorDistancia) {
        melhor = x;
        melhorDistancia = d;
      }
    });
    return melhor ?? ponta;
  };
  return paredes
    .map((p, i) => ({ ...p, a: novaExtremidade(i, p.a), b: novaExtremidade(i, p.b) }))
    .filter((p) => distancia(p.a, p.b) > C.toleranciaNoM);
}

/** Traços repetidos (mesmas extremidades, em qualquer ordem): fica um só, com a maior largura. */
function semRepetidos(segmentos: [Ponto, Ponto][], larguras: number[]): { segmentos: [Ponto, Ponto][]; larguras: number[] } {
  const casas = (v: number): number => Math.round(v / C.toleranciaRepetidoM);
  const vistos = new Map<string, number>();
  const saida: [Ponto, Ponto][] = [];
  const pesos: number[] = [];
  segmentos.forEach(([a, b], i) => {
    const ka = `${casas(a.x)},${casas(a.y)}`;
    const kb = `${casas(b.x)},${casas(b.y)}`;
    const chave = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    const existente = vistos.get(chave);
    if (existente === undefined) {
      vistos.set(chave, saida.length);
      saida.push([a, b]);
      pesos.push(larguras[i] ?? 0);
    } else {
      pesos[existente] = Math.max(pesos[existente]!, larguras[i] ?? 0);
    }
  });
  return { segmentos: saida, larguras: pesos };
}

/**
 * Duas paredes não ocupam o mesmo lugar: entre candidatas paralelas cujos corpos se sobrepõem (um traço de
 * bancada ou de mobiliário junto à face de uma parede), fica a de traço mais pesado e, em empate, a mais longa.
 * Uma candidata em outra direção que corre quase toda DENTRO do corpo de outra parede (hachura de linhas
 * dentro da parede, sobra de triangulação do poché) também sai.
 */
export function semSobrepostas(paredes: Parede[]): Parede[] {
  const ordenadas = [...paredes].sort((p, q) => q.peso - p.peso || distancia(q.a, q.b) - distancia(p.a, p.b));
  const aceitas: Parede[] = [];
  const amostras = C.amostrasCorpo;
  for (const p of ordenadas) {
    const dp = direcao(p);
    const sobreposta = aceitas.some((q) => {
      const dq = direcao(q);
      if (Math.abs(dp.ux * dq.uy - dp.uy * dq.ux) > SENO_PARALELO) {
        let dentro = 0;
        for (let k = 0; k < amostras; k++) {
          const t = (k + 0.5) / amostras;
          const r = { x: p.a.x + (p.b.x - p.a.x) * t, y: p.a.y + (p.b.y - p.a.y) * t };
          const lateral = Math.abs(-(r.x - q.a.x) * dq.uy + (r.y - q.a.y) * dq.ux);
          const ao_longo = (r.x - q.a.x) * dq.ux + (r.y - q.a.y) * dq.uy;
          if (lateral <= q.espessura / 2 && ao_longo >= 0 && ao_longo <= dq.comprimento) dentro++;
        }
        return dentro / amostras > C.fracaoSobreposicaoCorpo;
      }
      const meio = { x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 };
      const lateral = Math.abs(-(meio.x - q.a.x) * dq.uy + (meio.y - q.a.y) * dq.ux);
      if (lateral >= (p.espessura + q.espessura) / 2 - C.toleranciaColinearM) return false;
      const ao_longo = (r: Ponto): number => (r.x - q.a.x) * dq.ux + (r.y - q.a.y) * dq.uy;
      const t0 = Math.max(0, Math.min(ao_longo(p.a), ao_longo(p.b)));
      const t1 = Math.min(dq.comprimento, Math.max(ao_longo(p.a), ao_longo(p.b)));
      return t1 - t0 > dp.comprimento * C.fracaoSobreposicaoCorpo;
    });
    if (!sobreposta) aceitas.push(p);
  }
  return aceitas;
}

/**
 * Vãos junto a um encontro (porta encostada na parede perpendicular): a ponta de uma parede — solta ou em
 * canto — segue em linha reta e, se alcançar o eixo de outra parede com vão livre de até `vaoMaximoNaPontaM`
 * COM porta desenhada (folha ou giro), ou até `esquadria.vaoMaximoM` com caixilho desenhado no vão, o trecho
 * é fechado. Sem desenho de abertura, fica aberto: um corredor que se abre para um cômodo não vira porta. Pontas que morrem no meio de outra parede (encontro em T) não avançam.
 * O limite é menor que o dos vãos no meio da parede para não atravessar recuos e corredores.
 * Devolve quantos vãos fechou.
 */
export function fecharVaosNasPontas(paredes: Parede[], evidencias: EvidenciasDeVao = SEM_EVIDENCIAS): { paredes: Parede[]; vaos: number } {
  const dirs = paredes.map(direcao);
  let vaos = 0;
  /** A ponta cai no MEIO do eixo de outra parede (não nas extremidades dela)? */
  const emT = (q: Ponto, i: number): boolean =>
    paredes.some((pj, j) => {
      if (j === i) return false;
      const dj = dirs[j]!;
      const t = (q.x - pj.a.x) * dj.ux + (q.y - pj.a.y) * dj.uy;
      if (t <= pj.espessura || t >= dj.comprimento - pj.espessura) return false;
      return distancia(q, { x: pj.a.x + dj.ux * t, y: pj.a.y + dj.uy * t }) <= C.toleranciaNoM;
    });
  const novaPonta = (i: number, ponta: Ponto, sentido: 1 | -1): Ponto => {
    if (emT(ponta, i)) return ponta;
    const di = dirs[i]!;
    let melhor: Ponto | null = null;
    let melhorAvanco = Infinity;
    paredes.forEach((pj, j) => {
      if (j === i) return;
      const dj = dirs[j]!;
      const cruz = di.ux * dj.uy - di.uy * dj.ux;
      if (Math.abs(cruz) <= SENO_PARALELO) return;
      const qx = pj.a.x - ponta.x;
      const qy = pj.a.y - ponta.y;
      const avanco = ((qx * dj.uy - qy * dj.ux) / cruz) * sentido;
      const s = (qx * di.uy - qy * di.ux) / cruz;
      const folga = (paredes[i]!.espessura + pj.espessura) / 2;
      if (avanco <= C.toleranciaNoM || avanco > C.esquadria.vaoMaximoM + folga || avanco >= melhorAvanco) return;
      if (s < -pj.espessura / 2 || s > dj.comprimento + pj.espessura / 2) return;
      const alvo = { x: ponta.x + di.ux * avanco * sentido, y: ponta.y + di.uy * avanco * sentido };
      const e = paredes[i]!.espessura;
      const aberturaDesenhada =
        avanco <= C.vaoMaximoNaPontaM + folga
          ? evidencias.porta(ponta, alvo, e) || evidencias.esquadria(ponta, alvo, e)
          : evidencias.esquadria(ponta, alvo, e);
      if (!aberturaDesenhada) return;
      melhorAvanco = avanco;
      melhor = alvo;
    });
    if (melhor !== null) vaos++;
    return melhor ?? ponta;
  };
  const saida = paredes.map((p, i) => ({ ...p, a: novaPonta(i, p.a, -1), b: novaPonta(i, p.b, 1) }));
  return { paredes: saida, vaos };
}

// ---------------------------------------------------------------- faces do grafo de paredes

interface Face {
  /** Contorno pelos eixos (m), orientado com área com sinal positiva. */
  contorno: Ponto[];
  /** Índice da parede de cada aresta do contorno (aresta i: contorno[i] → contorno[i+1]). */
  paredes: number[];
}

interface Grafo {
  faces: Face[];
  /** Conjunto conexo de cada parede (-1 = fora do grafo). */
  conjuntoDaParede: number[];
  /** Conjunto conexo de cada face. */
  conjuntoDaFace: number[];
}

/** Faces internas (fechadas) do grafo planar dos eixos e os conjuntos conexos de paredes. */
export function facesDoGrafo(paredes: Parede[]): Grafo {
  const grafo = construirGrafoParedes(
    paredes.map((p, i) => ({ id: String(i), pontos: [p.a, p.b] })),
    C.toleranciaNoM,
  );
  const indiceDoNo = new Map(grafo.nos.map((n, i) => [n.id, i]));
  const pontos = grafo.nos.map((n) => n.ponto);

  // conjuntos conexos (união-busca sobre os nós)
  const pai = pontos.map((_, i) => i);
  const raiz = (i: number): number => {
    while (pai[i]! !== i) i = pai[i] = pai[pai[i]!]!;
    return i;
  };
  const arestas = grafo.arestas.map((a) => ({ u: indiceDoNo.get(a.noA)!, v: indiceDoNo.get(a.noB)!, parede: Number(a.paredeId) }));
  for (const a of arestas) pai[raiz(a.u)] = raiz(a.v);
  const conjuntoDaParede = paredes.map(() => -1);
  for (const a of arestas) conjuntoDaParede[a.parede] = raiz(a.u);

  // remove pontas soltas (nós de grau 1), que não delimitam faces
  const vivas = new Set(arestas.map((_, i) => i));
  const incidentes: number[][] = pontos.map(() => []);
  arestas.forEach((a, i) => {
    incidentes[a.u]!.push(i);
    incidentes[a.v]!.push(i);
  });
  const grau = incidentes.map((l) => l.length);
  const fila = grau.flatMap((g, i) => (g === 1 ? [i] : []));
  while (fila.length > 0) {
    const no = fila.pop()!;
    const aresta = incidentes[no]!.find((i) => vivas.has(i));
    if (aresta === undefined || grau[no] !== 1) continue;
    vivas.delete(aresta);
    const a = arestas[aresta]!;
    for (const extremo of [a.u, a.v]) {
      grau[extremo]!--;
      if (grau[extremo] === 1) fila.push(extremo);
    }
  }

  // meias-arestas saindo de cada nó, em ordem de ângulo
  interface Meia {
    de: number;
    para: number;
    parede: number;
    angulo: number;
    usada: boolean;
  }
  const saidas: Meia[][] = pontos.map(() => []);
  for (const i of vivas) {
    const a = arestas[i]!;
    for (const [de, para] of [
      [a.u, a.v],
      [a.v, a.u],
    ] as const) {
      const angulo = Math.atan2(pontos[para]!.y - pontos[de]!.y, pontos[para]!.x - pontos[de]!.x);
      saidas[de]!.push({ de, para, parede: a.parede, angulo, usada: false });
    }
  }
  for (const lista of saidas) lista.sort((p, q) => p.angulo - q.angulo);

  const faces: Face[] = [];
  const conjuntoDaFace: number[] = [];
  for (const lista of saidas) {
    for (const inicio of lista) {
      if (inicio.usada) continue;
      const contorno: Ponto[] = [];
      const paredesDaFace: number[] = [];
      let atual = inicio;
      while (!atual.usada) {
        atual.usada = true;
        contorno.push(pontos[atual.de]!);
        paredesDaFace.push(atual.parede);
        // no nó de chegada: a saída imediatamente anterior (em ângulo) à meia-aresta de volta
        const noNo = saidas[atual.para]!;
        const volta = noNo.findIndex((m) => m.para === atual.de);
        atual = noNo[(volta - 1 + noNo.length) % noNo.length]!;
      }
      // faces internas têm área com sinal positiva; a face externa de cada conjunto sai negativa
      if (contorno.length >= 3 && areaComSinal(contorno) > 0) {
        faces.push({ contorno, paredes: paredesDaFace });
        conjuntoDaFace.push(raiz(inicio.de));
      }
    }
  }
  return { faces, conjuntoDaParede, conjuntoDaFace };
}

/**
 * Recua o contorno (pelos eixos) para a face interna das paredes: cada aresta entra meia espessura da sua
 * parede. Devolve null se o resultado não for um polígono válido menor que o original.
 */
export function recuarParaFaceInterna(contorno: Ponto[], recuos: number[]): Ponto[] | null {
  const n = contorno.length;
  // reta deslocada de cada aresta: ponto + direção (normal para dentro = (−dy, dx) com área positiva)
  const retas = contorno.map((p, i) => {
    const q = contorno[(i + 1) % n]!;
    const comprimento = distancia(p, q);
    const ux = (q.x - p.x) / comprimento;
    const uy = (q.y - p.y) / comprimento;
    const r = recuos[i]!;
    return { x: p.x - uy * r, y: p.y + ux * r, ux, uy };
  });
  const resultado: Ponto[] = [];
  for (let i = 0; i < n; i++) {
    const anterior = retas[(i - 1 + n) % n]!;
    const atual = retas[i]!;
    const vertice = contorno[i]!;
    const cruz = anterior.ux * atual.uy - anterior.uy * atual.ux;
    if (Math.abs(cruz) <= SENO_PARALELO) {
      // arestas colineares: mesmo recuo → o vértice some; recuos diferentes → degrau
      const rAnterior = recuos[(i - 1 + n) % n]!;
      const rAtual = recuos[i]!;
      if (Math.abs(rAnterior - rAtual) <= C.toleranciaEspessuraM / 2) continue;
      resultado.push({ x: vertice.x - anterior.uy * rAnterior, y: vertice.y + anterior.ux * rAnterior });
      resultado.push({ x: vertice.x - atual.uy * rAtual, y: vertice.y + atual.ux * rAtual });
      continue;
    }
    const t = ((atual.x - anterior.x) * atual.uy - (atual.y - anterior.y) * atual.ux) / cruz;
    resultado.push({ x: anterior.x + t * anterior.ux, y: anterior.y + t * anterior.uy });
  }
  const area = areaComSinal(resultado);
  const valido =
    resultado.length >= 3 &&
    resultado.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) &&
    area > 0 &&
    area < areaComSinal(contorno);
  return valido ? resultado : null;
}

// ---------------------------------------------------------------- textos dos ambientes

const RE_AREA = /^(\d+(?:[.,]\d+)?)\s*m\s*[²2]$/i;
const RE_INTEIRO_CURTO = /^\d{1,3}$/;

interface Leitura {
  nome: string | undefined;
  /** Área escrita na planta (m²), se houver. */
  areaEscrita: number | null;
}

/** Junta os textos de um ambiente (ordem de leitura): palavras + número do cômodo; separa a área escrita. */
function lerTextosDoAmbiente(textos: TextoPosicionado[]): Leitura {
  const ordenados = [...textos].sort((p, q) => p.ponto.y - q.ponto.y || p.ponto.x - q.ponto.x);
  let areaEscrita: number | null = null;
  const partes: string[] = [];
  let temPalavra = false;
  for (const t of ordenados) {
    const area = RE_AREA.exec(t.texto);
    if (area) {
      areaEscrita ??= lerNumero(area[1]!);
      continue;
    }
    if (naoEhNomeDeAmbiente(t.texto)) continue;
    if (/\p{L}/u.test(t.texto)) {
      partes.push(t.texto);
      temPalavra = true;
    } else if (RE_INTEIRO_CURTO.test(t.texto)) {
      partes.push(t.texto); // "01" de "QUARTO 01" (cotas têm casas decimais e ficam de fora)
    }
  }
  return { nome: temPalavra ? partes.join(' ') : undefined, areaEscrita };
}

// ---------------------------------------------------------------- reconhecimento

const plural = (n: number, singular: string, pluralTexto: string): string => `${n} ${n === 1 ? singular : pluralTexto}`;

interface Candidato {
  poligono: Ponto[];
  area: number;
  conjunto: number;
  /** O recuo para a face interna falhou: o polígono ficou pelo eixo. */
  peloEixo: boolean;
  /** Paredes (índices) e comprimento de cada aresta do contorno. */
  arestas: { parede: number; comprimento: number }[];
  leitura: Leitura;
  classe: Classificacao | null;
}

interface Analise {
  paredes: Parede[];
  vaos: number;
  candidatos: Candidato[];
  soltos: TextoPosicionado[];
  conjuntoDaParede: number[];
  /** Conjuntos conexos de paredes que têm ao menos um cômodo de nome reconhecido. */
  conjuntosComComodo: Set<number>;
}

const comodos = (a: Analise): number => a.candidatos.filter((c) => c.classe !== null).length;

/** Dos pares de paralelas até os ambientes candidatos com seus textos. */
function analisar(pares: Parede[], textos: TextoPosicionado[], evidencias: EvidenciasDeVao): Analise {
  const unidas = unirColineares(semSobrepostas(pares), evidencias.esquadria);
  const fechadas = fecharVaosNasPontas(estenderAosEncontros(semSobrepostas(unidas.paredes)), evidencias);
  const paredes = fechadas.paredes;
  const grafo = paredes.length > 0 ? facesDoGrafo(paredes) : { faces: [], conjuntoDaParede: [], conjuntoDaFace: [] };

  const candidatos: Candidato[] = [];
  grafo.faces.forEach((face, i) => {
    const interno = recuarParaFaceInterna(
      face.contorno,
      face.paredes.map((p) => paredes[p]!.espessura / 2),
    );
    const poligono = interno ?? face.contorno;
    const area = areaPoligono(poligono);
    if (area < C.areaMinAmbienteM2) return;
    const n = face.contorno.length;
    candidatos.push({
      poligono,
      area,
      conjunto: grafo.conjuntoDaFace[i]!,
      peloEixo: interno === null,
      arestas: face.paredes.map((parede, k) => ({ parede, comprimento: distancia(face.contorno[k]!, face.contorno[(k + 1) % n]!) })),
      leitura: { nome: undefined, areaEscrita: null },
      classe: null,
    });
  });

  // cada texto vai para o menor candidato que o contém
  const textosDoCandidato: TextoPosicionado[][] = candidatos.map(() => []);
  const soltos: TextoPosicionado[] = [];
  for (const t of textos) {
    let alvo = -1;
    candidatos.forEach((c, i) => {
      if (pontoEmPoligono(t.ponto, c.poligono) && (alvo === -1 || c.area < candidatos[alvo]!.area)) alvo = i;
    });
    if (alvo === -1) soltos.push(t);
    else textosDoCandidato[alvo]!.push(t);
  }
  const conjuntosComComodo = new Set<number>();
  candidatos.forEach((c, i) => {
    c.leitura = lerTextosDoAmbiente(textosDoCandidato[i]!);
    c.classe = c.leitura.nome === undefined ? null : classificarAmbiente(c.leitura.nome);
    if (c.classe !== null) conjuntosComComodo.add(c.conjunto);
  });
  return { paredes, vaos: unidas.vaos + fechadas.vaos, candidatos, soltos, conjuntoDaParede: grafo.conjuntoDaParede, conjuntosComComodo };
}

/**
 * "Cara" das paredes que delimitam os cômodos com nome: a largura de traço predominante e as espessuras
 * que respondem por uma parte relevante do contorno. Serve para descartar bancadas, louças e mobiliário.
 */
function referenciaDasParedes(analise: Analise): { peso: number; espessuras: number[] } | null {
  const porPeso = new Map<number, number>();
  const porEspessura = new Map<number, number>();
  let total = 0;
  for (const c of analise.candidatos) {
    if (c.classe === null) continue;
    for (const { parede, comprimento } of c.arestas) {
      const p = analise.paredes[parede]!;
      porPeso.set(p.peso, (porPeso.get(p.peso) ?? 0) + comprimento);
      porEspessura.set(p.espessura, (porEspessura.get(p.espessura) ?? 0) + comprimento);
      total += comprimento;
    }
  }
  if (total === 0) return null;
  const peso = [...porPeso.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  const espessuras = [...porEspessura.entries()].filter(([, l]) => l / total >= C.fracaoEspessuraReferencia).map(([e]) => e);
  return { peso, espessuras };
}

/** Método de leitura das paredes e o resultado da análise com ele. */
interface Metodo {
  descricao: string;
  analise: Analise;
  /** Trechos ligados à planta descartados na 2ª passada (traço mais fino / espessura diferente). */
  foraDoPadrao: number;
}

/** 1ª passada com todas as candidatas; 2ª só com as que têm a "cara" das paredes dos cômodos nomeados. */
function analisarMetodo(descricao: string, pares: Parede[], textos: TextoPosicionado[], evidencias: EvidenciasDeVao): Metodo {
  let analise = analisar(pares, textos, evidencias);
  let foraDoPadrao = 0;
  const referencia = referenciaDasParedes(analise);
  if (referencia !== null) {
    const noPadrao = pares.filter(
      (p) => p.peso >= referencia.peso && referencia.espessuras.some((e) => Math.abs(e - p.espessura) <= C.toleranciaEspessuraM),
    );
    const refinada = analisar(noPadrao, textos, evidencias);
    if (comodos(refinada) >= comodos(analise)) {
      const ligadas = (a: Analise): number => a.paredes.filter((_, i) => a.conjuntosComComodo.has(a.conjuntoDaParede[i]!)).length;
      foraDoPadrao = Math.max(0, ligadas(analise) - ligadas(refinada));
      analise = refinada;
    }
  }
  return { descricao, analise, foraDoPadrao };
}

/** Pontuação para escolher o método: cômodos com nome, depois ambientes fechados, depois comprimento de parede. */
function pontuacao(m: Metodo): [number, number, number] {
  const a = m.analise;
  const conjuntos = a.conjuntosComComodo.size > 0 ? a.conjuntosComComodo : null;
  const fechados = a.candidatos.filter((c) => conjuntos === null || conjuntos.has(c.conjunto)).length;
  const comprimento = a.paredes.reduce((s, p, i) => (conjuntos === null || conjuntos.has(a.conjuntoDaParede[i]!) ? s + distancia(p.a, p.b) : s), 0);
  return [comodos(a), fechados, comprimento];
}

const melhor = (p: Metodo, q: Metodo): Metodo => {
  const [a1, a2, a3] = pontuacao(p);
  const [b1, b2, b3] = pontuacao(q);
  return b1 > a1 || (b1 === a1 && (b2 > a2 || (b2 === a2 && b3 > a3))) ? q : p;
};

export function reconhecerVetores(entrada: EntradaVetores, opcoes: OpcoesReconhecimento): ResultadoReconhecimento {
  const vazio = (situacao: SituacaoReconhecimento, mensagem: string): ResultadoReconhecimento => ({
    elementos: [],
    pendencias: [mensagem],
    situacao,
    mensagem,
  });

  if (!escalaValida(opcoes.escala)) return vazio('sem-escala', MENSAGEM_SEM_ESCALA);
  const escala = opcoes.escala;
  const preenchimentosBrutos = entrada.preenchimentos ?? [];
  const ladosPreenchidos = preenchimentosBrutos.reduce((s, f) => s + f.contornos.reduce((t, c) => t + c.length, 0), 0);
  if (entrada.segmentos.length + ladosPreenchidos < C.minSegmentosVetorial) return vazio('nao-vetorial', MENSAGEM_NAO_VETORIAL);

  // --- região e ruído; daqui em diante tudo em METROS
  const regiao = opcoes.regiao && opcoes.regiao.length >= 3 ? opcoes.regiao : null;
  const naRegiao = (p: Ponto): boolean => regiao === null || pontoEmPoligono(p, regiao);
  const emMetros = (p: Ponto): Ponto => ({ x: p.x * escala, y: p.y * escala });
  const brutos: [Ponto, Ponto][] = [];
  const largurasBrutas: number[] = [];
  entrada.segmentos.forEach(([a, b], i) => {
    if (!naRegiao(a) || !naRegiao(b)) return;
    if (distancia(a, b) * escala < C.comprimentoMinSegmentoM) return;
    brutos.push([emMetros(a), emMetros(b)]);
    largurasBrutas.push(entrada.larguras?.[i] ?? 0);
  });
  const { segmentos, larguras } = semRepetidos(brutos, largurasBrutas);
  const textos = entrada.textos.filter((t) => naRegiao(t.ponto)).map((t) => ({ texto: t.texto, ponto: emMetros(t.ponto) }));
  const preenchimentos = preenchimentosBrutos
    .map((f) => ({ ...f, contornos: f.contornos.filter((c) => c.every(naRegiao)).map((c) => c.map(emMetros)) }))
    .filter((f) => f.contornos.length > 0);
  const arcos = (entrada.arcos ?? []).filter(([a, b]) => naRegiao(a) && naRegiao(b)).map(([a, b]): [Ponto, Ponto] => [emMetros(a), emMetros(b)]);
  const evidencias = indiceDeVaos(segmentos, arcos);

  // --- métodos de leitura das paredes
  const metodos: Metodo[] = [];
  const tracoDuploCabe = segmentos.length <= C.maxSegmentos;
  if (tracoDuploCabe) {
    const pares = detectarParedes(segmentos, 1, C.parede, larguras).map(
      (p): Parede => ({ a: p.eixo[0], b: p.eixo[1], espessura: p.espessura, peso: p.peso }),
    );
    if (pares.length > 0) metodos.push(analisarMetodo('pares de linhas paralelas (traço duplo)', pares, textos, evidencias));
  }
  for (const candidato of paredesDosPreenchimentos(preenchimentos)) {
    const pares = candidato.paredes.map((p): Parede => ({ a: p.eixo[0], b: p.eixo[1], espessura: p.espessura, peso: 0 }));
    metodos.push(analisarMetodo(`áreas preenchidas (poché, cor ${candidato.cor})`, pares, textos, evidencias));
  }

  if (metodos.length === 0 && !tracoDuploCabe) {
    return vazio(
      'excesso',
      `A página tem traços demais para o reconhecimento automático (${formatarNumero(segmentos.length, 0)}; o limite é ` +
        `${formatarNumero(C.maxSegmentos, 0)}). Limite a região: desenhe uma medição de área em volta da planta baixa, ` +
        'deixe-a selecionada e reconheça de novo.',
    );
  }
  const escolhido = metodos.reduce<Metodo | null>((m, atual) => (m === null ? atual : melhor(m, atual)), null);
  if (escolhido === null || escolhido.analise.paredes.length === 0) {
    return vazio(
      'nada',
      'Nenhuma parede foi reconhecida: não há pares de linhas paralelas nem áreas preenchidas com espessura de parede ' +
        `(${formatarNumero(C.parede.distanciaMinM)} a ${formatarNumero(C.parede.distanciaMaxM)} m) na escala calibrada. Confira a escala da página.`,
    );
  }
  const { analise, foraDoPadrao } = escolhido;

  // --- conjuntos mantidos: os que têm cômodo de nome reconhecido (descarta cortes, elevações, carimbo...);
  //     sem nenhum nome (textos em curvas), o conjunto com mais ambientes fechados
  const { paredes, candidatos } = analise;
  let mantidosConjuntos = analise.conjuntosComComodo;
  const semNomes = mantidosConjuntos.size === 0;
  if (semNomes) {
    const porConjunto = new Map<number, number>();
    for (const c of candidatos) porConjunto.set(c.conjunto, (porConjunto.get(c.conjunto) ?? 0) + 1);
    const maior = [...porConjunto.entries()].sort((a, b) => b[1] - a[1])[0];
    mantidosConjuntos = new Set(maior ? [maior[0]] : []);
  }
  const filtrar = mantidosConjuntos.size > 0;
  const paredeMantida = paredes.map((_, i) => !filtrar || mantidosConjuntos.has(analise.conjuntoDaParede[i]!));
  const mantidos = candidatos.filter((c) => !filtrar || mantidosConjuntos.has(c.conjunto));

  // --- elementos (de volta às unidades da página)
  const paraPagina = (p: Ponto): Ponto => ({ x: p.x / escala, y: p.y / escala });
  const base = { pagina: opcoes.pagina, vinculos: {}, origem: 'importado', status: 'pendente' } as const;
  const id = (): string => `${C.prefixoId}${novoId()}`;
  const elementos: Elemento[] = [];
  const pendencias: string[] = [
    'O reconhecimento é uma sugestão: confira paredes, espessuras e ambientes na planta antes de aceitar.',
    `Paredes lidas por ${escolhido.descricao}.`,
  ];

  let pelosEixos = 0;
  mantidos.forEach((c, i) => {
    const { nome: nomeLido, areaEscrita } = c.leitura;
    const nome = nomeLido ?? `Ambiente ${i + 1}`;
    const classe = c.classe;
    if (nomeLido === undefined) pendencias.push(`${nome} sem nome (${formatarNumero(c.area)} m²)`);
    else if (classe === null) pendencias.push(`${nome}: tipo de ambiente não reconhecido — escolha o tipo`);
    else if (classe.molhadaPorTermoSecundario) {
      pendencias.push(`${nome}: nome composto — tipo pelo 1º termo, marcado como área molhada por causa de outro termo do nome; confira`);
    }
    if (c.peloEixo) pelosEixos++;
    if (areaEscrita !== null && areaEscrita > 0 && Math.abs(c.area - areaEscrita) / areaEscrita > C.toleranciaAreaEscrita) {
      pendencias.push(
        `${nome}: a área reconhecida (${formatarNumero(c.area)} m²) difere da escrita na planta (${formatarNumero(areaEscrita)} m²) — confira o contorno`,
      );
    }
    const ambiente: ElementoDe<'ambiente'> = {
      ...base,
      id: id(),
      tipo: 'ambiente',
      disciplina: 'arquitetura',
      geometria: { tipo: 'poligono', pontos: c.poligono.map(paraPagina) },
      rotulo: nome,
      props: { nome, tipoAmbiente: classe?.tipo ?? 'outro', areaMolhada: classe?.areaMolhada ?? false, coberto: true },
    };
    elementos.push(ambiente);
  });

  let descartadas = 0;
  const mantidas: Parede[] = [];
  paredes.forEach((p, i) => {
    if (!paredeMantida[i]) {
      descartadas++;
      return;
    }
    mantidas.push(p);
    const parede: ElementoDe<'parede'> = {
      ...base,
      id: id(),
      tipo: 'parede',
      disciplina: 'arquitetura',
      geometria: { tipo: 'polilinha', pontos: [paraPagina(p.a), paraPagina(p.b)] },
      props: { espessura: p.espessura },
    };
    elementos.push(parede);
  });

  // --- o que falta / avisos
  // nome de cômodo que ficou fora de qualquer ambiente, dentro da área da planta: o contorno não fecha
  const xs = mantidas.flatMap((p) => [p.a.x, p.b.x]);
  const ys = mantidas.flatMap((p) => [p.a.y, p.b.y]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const semContorno = new Set<string>();
  for (const t of analise.soltos) {
    if (classificarAmbiente(t.texto) === null) continue;
    if (t.ponto.x < minX || t.ponto.x > maxX || t.ponto.y < minY || t.ponto.y > maxY) continue;
    semContorno.add(t.texto);
  }
  for (const nome of semContorno) {
    pendencias.push(`"${nome}": o nome está na planta, mas as paredes em volta não fecham um contorno (lado aberto?) — desenhe este ambiente à mão`);
  }
  if (mantidos.length === 0) pendencias.push('Nenhum ambiente fechado por paredes foi encontrado: desenhe os ambientes à mão.');
  if (semNomes) {
    pendencias.push(
      'Nenhum nome de cômodo foi reconhecido nos textos (nomes desenhados como curvas?): ficou só o conjunto de paredes com mais ambientes fechados — confira se é a planta baixa e dê nome aos ambientes.',
    );
  }
  if (descartadas > 0) {
    pendencias.push(`${plural(descartadas, 'trecho com cara de parede foi descartado', 'trechos com cara de parede foram descartados')} por não estar ligado à planta com cômodos nomeados (outros desenhos da folha, hachuras, carimbo).`);
  }
  if (foraDoPadrao > 0) {
    pendencias.push(`${plural(foraDoPadrao, 'trecho dentro da planta foi descartado', 'trechos dentro da planta foram descartados')} por ter traço mais fino ou espessura diferente das paredes dos cômodos (bancadas, louças, mobiliário — e também muros ou paredes desenhados com outra pena): desenhe o que faltar.`);
  }
  if (analise.vaos > 0) {
    pendencias.push(`${plural(analise.vaos, 'vão (porta/janela/passagem) foi fechado', 'vãos (portas/janelas/passagens) foram fechados')} em linha reta para a parede ficar contínua: posicione as esquadrias para descontar as aberturas.`);
  }
  if (pelosEixos > 0) {
    pendencias.push(`${plural(pelosEixos, 'ambiente ficou traçado', 'ambientes ficaram traçados')} pelo eixo das paredes (a área inclui meia espessura das paredes): ajuste o contorno.`);
  }
  if (!tracoDuploCabe && (semContorno.size > 0 || mantidos.length === 0)) {
    pendencias.push(`A leitura por traço duplo não rodou: a página tem traços demais (${formatarNumero(segmentos.length, 0)}). Se faltar parede, limite a região com uma medição de área selecionada.`);
  }
  pendencias.push('Paredes curvas não são reconhecidas; os ambientes seguem a face interna das paredes.');

  return { elementos, pendencias, situacao: 'ok' };
}
