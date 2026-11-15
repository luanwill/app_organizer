/**
 * Grafo dos eixos das paredes (base para sugerir pilares e dividir vigas baldrame em trechos).
 *
 * Passos:
 *  1. cada parede (polilinha de eixo) é quebrada em segmentos;
 *  2. vértices mais próximos que a tolerância viram o mesmo nó (posição = 1º vértice do grupo);
 *  3. encontro em T: nó que cai no meio de um segmento (dentro da tolerância) divide o segmento;
 *     o nó é ajustado para a projeção sobre o 1º segmento hospedeiro, mantendo-o reto;
 *  4. cruzamento em X: interseção própria de dois segmentos cria um nó e divide os dois;
 *  5. trechos colineares sobrepostos geram uma única aresta (fica com a 1ª parede informada);
 *  6. nós classificados pelo grau.
 */
import type { ArestaGrafo, GrafoParedes, NoGrafo, Ponto, TipoNo } from '@/core/model';
import { EPSILON_GEOMETRICO, PREFIXO_ID_ARESTA, PREFIXO_ID_NO } from './config';
import { distancia, intersecaoSegmentos, projetarNoSegmento } from './geometria';
import { mesmaDirecao } from './rotas';

interface SegmentoInterno {
  paredeId: string;
  noA: number;
  noB: number;
  /** Nós intermediários (encontros e cruzamentos) sobre o segmento. */
  intermediarios: Set<number>;
}

interface ArestaInterna {
  noA: number;
  noB: number;
  paredeId: string;
}

/** Agrupa pontos mais próximos que a tolerância (fecho transitivo). Devolve o índice do grupo de cada ponto. */
function agruparPontos(pontos: Ponto[], tolerancia: number): number[] {
  const pai = pontos.map((_, i) => i);
  const raiz = (i: number): number => {
    let r = i;
    while (pai[r]! !== r) r = pai[r]!;
    while (pai[i]! !== r) {
      const proximo = pai[i]!;
      pai[i] = r;
      i = proximo;
    }
    return r;
  };
  for (let i = 0; i < pontos.length; i++) {
    for (let j = i + 1; j < pontos.length; j++) {
      if (distancia(pontos[i]!, pontos[j]!) <= tolerancia) {
        const ri = raiz(i);
        const rj = raiz(j);
        // a raiz é sempre o menor índice → posição do nó = 1º vértice do grupo (determinístico)
        if (ri < rj) pai[rj] = ri;
        else if (rj < ri) pai[ri] = rj;
      }
    }
  }
  return pontos.map((_, i) => raiz(i));
}

/** Classificação de um nó a partir do seu ponto e dos pontos vizinhos (um por aresta incidente). */
export function classificarNo(ponto: Ponto, vizinhos: Ponto[]): TipoNo {
  const grau = vizinhos.length;
  if (grau <= 1) return 'extremidade';
  if (grau === 2) {
    const [u, v] = vizinhos as [Ponto, Ponto];
    const colinear = mesmaDirecao(ponto.x - u.x, ponto.y - u.y, v.x - ponto.x, v.y - ponto.y);
    return colinear ? 'passagem' : 'L';
  }
  return grau === 3 ? 'T' : 'X';
}

export function construirGrafoParedes(
  paredes: { id: string; pontos: Ponto[] }[],
  tolerancia: number,
): GrafoParedes {
  const tol = Math.max(Number.isFinite(tolerancia) ? tolerancia : 0, EPSILON_GEOMETRICO);

  // 1–2. vértices → nós
  const vertices: Ponto[] = [];
  const paredesVertices: { id: string; indices: number[] }[] = [];
  for (const parede of paredes) {
    const indices: number[] = [];
    for (const p of parede.pontos) {
      indices.push(vertices.length);
      vertices.push({ x: p.x, y: p.y });
    }
    paredesVertices.push({ id: parede.id, indices });
  }
  const grupo = agruparPontos(vertices, tol);
  const noDoGrupo = new Map<number, number>();
  const posicoes: Ponto[] = [];
  const noDoVertice = grupo.map((g) => {
    let no = noDoGrupo.get(g);
    if (no === undefined) {
      no = posicoes.length;
      posicoes.push({ ...vertices[g]! });
      noDoGrupo.set(g, no);
    }
    return no;
  });

  const segmentos: SegmentoInterno[] = [];
  for (const parede of paredesVertices) {
    for (let i = 0; i + 1 < parede.indices.length; i++) {
      const noA = noDoVertice[parede.indices[i]!]!;
      const noB = noDoVertice[parede.indices[i + 1]!]!;
      if (noA !== noB) segmentos.push({ paredeId: parede.id, noA, noB, intermediarios: new Set() });
    }
  }

  // 3. encontros em T (e extremidades de trechos colineares sobrepostos)
  const ajustado = posicoes.map(() => false);
  for (let no = 0; no < posicoes.length; no++) {
    for (const s of segmentos) {
      if (no === s.noA || no === s.noB) continue;
      const a = posicoes[s.noA]!;
      const b = posicoes[s.noB]!;
      const p = posicoes[no]!;
      const proj = projetarNoSegmento(p, a, b);
      if (proj.distancia > tol || distancia(p, a) <= tol || distancia(p, b) <= tol) continue;
      if (!ajustado[no]) {
        posicoes[no] = proj.ponto;
        ajustado[no] = true;
      }
      s.intermediarios.add(no);
    }
  }

  // 4. cruzamentos em X
  const noProximo = (p: Ponto): number => {
    let melhor = -1;
    let melhorDistancia = Infinity;
    for (let no = 0; no < posicoes.length; no++) {
      const d = distancia(p, posicoes[no]!);
      if (d <= tol && d < melhorDistancia) {
        melhor = no;
        melhorDistancia = d;
      }
    }
    return melhor;
  };
  for (let i = 0; i < segmentos.length; i++) {
    for (let j = i + 1; j < segmentos.length; j++) {
      const si = segmentos[i]!;
      const sj = segmentos[j]!;
      const p = intersecaoSegmentos(posicoes[si.noA]!, posicoes[si.noB]!, posicoes[sj.noA]!, posicoes[sj.noB]!);
      if (p === null) continue;
      let no = noProximo(p);
      if (no === -1) {
        no = posicoes.length;
        posicoes.push(p);
      }
      for (const s of [si, sj]) {
        if (no !== s.noA && no !== s.noB) s.intermediarios.add(no);
      }
    }
  }

  // 5. arestas (sem duplicatas)
  const arestasInternas: ArestaInterna[] = [];
  const chaves = new Set<string>();
  for (const s of segmentos) {
    const a = posicoes[s.noA]!;
    const b = posicoes[s.noB]!;
    const meio = [...s.intermediarios]
      .map((no) => ({ no, t: projetarNoSegmento(posicoes[no]!, a, b).t }))
      .sort((m, n) => m.t - n.t || m.no - n.no)
      .map((m) => m.no);
    const cadeia = [s.noA, ...meio, s.noB];
    for (let k = 0; k + 1 < cadeia.length; k++) {
      const noA = cadeia[k]!;
      const noB = cadeia[k + 1]!;
      if (noA === noB) continue;
      const chave = noA < noB ? `${noA}|${noB}` : `${noB}|${noA}`;
      if (chaves.has(chave)) continue;
      chaves.add(chave);
      arestasInternas.push({ noA, noB, paredeId: s.paredeId });
    }
  }

  // 6. nós: grau, classificação, ordenação (y crescente, depois x crescente) e ids
  const vizinhos = new Map<number, number[]>();
  const ligar = (de: number, para: number): void => {
    const lista = vizinhos.get(de);
    if (lista) lista.push(para);
    else vizinhos.set(de, [para]);
  };
  for (const aresta of arestasInternas) {
    ligar(aresta.noA, aresta.noB);
    ligar(aresta.noB, aresta.noA);
  }
  const ordenados = [...vizinhos.keys()].sort((m, n) => {
    const p = posicoes[m]!;
    const q = posicoes[n]!;
    return p.y - q.y || p.x - q.x || m - n;
  });
  const idDoNo = new Map<number, string>();
  const nos: NoGrafo[] = ordenados.map((no, i) => {
    const id = `${PREFIXO_ID_NO}${i + 1}`;
    idDoNo.set(no, id);
    const ponto = posicoes[no]!;
    const adjacentes = vizinhos.get(no)!;
    return {
      id,
      ponto: { x: ponto.x, y: ponto.y },
      tipo: classificarNo(ponto, adjacentes.map((v) => posicoes[v]!)),
      grau: adjacentes.length,
    };
  });
  const arestas: ArestaGrafo[] = arestasInternas.map((aresta, i) => ({
    id: `${PREFIXO_ID_ARESTA}${i + 1}`,
    noA: idDoNo.get(aresta.noA)!,
    noB: idDoNo.get(aresta.noB)!,
    paredeId: aresta.paredeId,
    comprimento: distancia(posicoes[aresta.noA]!, posicoes[aresta.noB]!),
  }));

  return { nos, arestas };
}
