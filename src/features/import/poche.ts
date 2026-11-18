/**
 * Paredes PREENCHIDAS (poché): plantas humanizadas e exportações de SketchUp/Layout, Revit e ArchiCAD
 * desenham a parede como uma área cheia, não como duas linhas. Funções PURAS, em metros.
 *
 * Para cada cor de preenchimento: as bordas de todas as áreas daquela cor são reunidas, as bordas internas
 * (lado comum de dois triângulos ou de duas faixas empilhadas) se cancelam, e os pares de bordas paralelas
 * cuja faixa entre elas está DENTRO do preenchimento viram paredes no eixo, com a espessura medida.
 */
import type { Ponto } from '@/core/model';
import { caixaEnvolvente, distancia, pontoEmPoligono } from '@/core/calc';
import { RECONHECIMENTO_PDF } from './config';
import { detectarParedes, type ParedeDetectada } from './dxf';

export interface PreenchimentoMetros {
  /** Contornos fechados (implicitamente), em metros. */
  contornos: Ponto[][];
  cor: string | null;
  parImpar: boolean;
}

export interface CandidatoPoche {
  cor: string;
  /** Pares de bordas que viraram paredes (eixo + espessura). */
  paredes: ParedeDetectada[];
  /** Soma dos comprimentos das paredes (m): usada para escolher quais cores analisar primeiro. */
  comprimento: number;
}

const C = RECONHECIMENTO_PDF;
const P = RECONHECIMENTO_PDF.poche;

/** Componentes RGB (0–255) de "#rrggbb". */
function rgb(cor: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(cor);
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : null;
}

/** Cor com cara de poché: não é clara demais (fundo, piso) — a escolha final é pelo que fecha cômodos. */
export function corPodeSerParede(cor: string | null): cor is string {
  if (cor === null) return false;
  const c = rgb(cor);
  if (c === null) return false;
  const luminancia = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
  return luminancia <= P.luminanciaMaxima;
}

/** Bordas da união dos contornos: lados que aparecem um número par de vezes são internos e saem. */
export function bordasDaUniao(contornos: Ponto[][]): [Ponto, Ponto][] {
  const chavePonto = (p: Ponto): string => `${Math.round(p.x / C.toleranciaRepetidoM)},${Math.round(p.y / C.toleranciaRepetidoM)}`;
  const contagem = new Map<string, { n: number; lado: [Ponto, Ponto] }>();
  for (const contorno of contornos) {
    const n = contorno.length;
    for (let i = 0; i < n; i++) {
      const a = contorno[i]!;
      const b = contorno[(i + 1) % n]!;
      const ka = chavePonto(a);
      const kb = chavePonto(b);
      if (ka === kb) continue;
      const chave = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const atual = contagem.get(chave);
      if (atual) atual.n++;
      else contagem.set(chave, { n: 1, lado: [a, b] });
    }
  }
  return [...contagem.values()].filter((v) => v.n % 2 === 1).map((v) => v.lado);
}

/** Índice simples para "o ponto está dentro de algum preenchimento desta cor?". */
function indiceDeDentro(preenchimentos: PreenchimentoMetros[]): (p: Ponto) => boolean {
  const itens = preenchimentos.map((f) => ({
    f,
    caixas: f.contornos.map((c) => caixaEnvolvente(c)),
  }));
  return (p) =>
    itens.some(({ f, caixas }) => {
      let dentro = 0;
      f.contornos.forEach((c, i) => {
        const b = caixas[i]!;
        if (p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY) return;
        if (pontoEmPoligono(p, c)) dentro++;
      });
      return f.parImpar ? dentro % 2 === 1 : dentro > 0;
    });
}

/**
 * Paredes candidatas de cada cor de preenchimento escura, da que mais rende parede para a que menos rende
 * (no máximo `P.maxCores`). Cores sem nenhuma faixa de parede não aparecem.
 */
export function paredesDosPreenchimentos(preenchimentos: PreenchimentoMetros[]): CandidatoPoche[] {
  const porCor = new Map<string, PreenchimentoMetros[]>();
  for (const f of preenchimentos) {
    if (!corPodeSerParede(f.cor)) continue;
    const lista = porCor.get(f.cor) ?? [];
    lista.push(f);
    porCor.set(f.cor, lista);
  }

  const candidatos: CandidatoPoche[] = [];
  for (const [cor, lista] of porCor) {
    const bordas = bordasDaUniao(lista.flatMap((f) => f.contornos)).filter(([a, b]) => distancia(a, b) >= C.comprimentoMinSegmentoM);
    if (bordas.length < 2 || bordas.length > C.maxSegmentos) continue;
    const dentro = indiceDeDentro(lista);
    const paredes = detectarParedes(bordas, 1, C.parede).filter((p) =>
      P.amostrasDentro.every((t) =>
        dentro({ x: p.eixo[0].x + (p.eixo[1].x - p.eixo[0].x) * t, y: p.eixo[0].y + (p.eixo[1].y - p.eixo[0].y) * t }),
      ),
    );
    if (paredes.length === 0) continue;
    const comprimento = paredes.reduce((s, p) => s + distancia(p.eixo[0], p.eixo[1]), 0);
    candidatos.push({ cor, paredes, comprimento });
  }
  return candidatos.sort((a, b) => b.comprimento - a.comprimento).slice(0, P.maxCores);
}
