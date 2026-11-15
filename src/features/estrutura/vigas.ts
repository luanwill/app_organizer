/**
 * Vigas (baldrame e superior): divisão do eixo das paredes em trechos entre pilares e
 * quantitativos por trecho. Funções puras.
 */
import type { ParametrosEstrutura, Ponto } from '@/core/model';
import { projetarNoSegmento } from '@/core/calc';
import { acumulados, estacaNaCadeia, paredeNaEstaca, trechoDaCadeia, type Cadeia } from './cadeias';
import { DETALHE_ACO_TAXA, DIVISOR_PESO_LINEAR_ACO, GANCHOS_ESTRIBO_M } from './config';

export interface TrechoViga {
  pontos: [Ponto, Ponto];
  paredeId: string;
}

/**
 * Divide cada cadeia em trechos entre pilares consecutivos (unidades do PDF). Os extremos da
 * cadeia sempre fecham trecho, de modo que a soma dos trechos cobre 100% das paredes.
 * Um trecho que passa por um vértice fora do alinhamento (além da tolerância) é quebrado nele.
 */
export function dividirEmTrechos(cadeias: Cadeia[], pilares: Ponto[], tolerancia: number): TrechoViga[] {
  const trechos: TrechoViga[] = [];
  for (const cadeia of cadeias) {
    const acum = acumulados(cadeia.pontos);
    const total = acum[acum.length - 1]!;
    const internas = pilares
      .map((p) => estacaNaCadeia(p, cadeia.pontos, acum, tolerancia))
      .filter((e): e is number => e !== null && e > tolerancia && e < total - tolerancia)
      .sort((a, b) => a - b);
    const estacas = [0];
    for (const e of internas) {
      if (e - estacas[estacas.length - 1]! > tolerancia) estacas.push(e);
    }
    estacas.push(total);

    for (let i = 0; i + 1 < estacas.length; i++) {
      const de = estacas[i]!;
      const ate = estacas[i + 1]!;
      const pontos = trechoDaCadeia(cadeia.pontos, acum, de, ate);
      const primeiro = pontos[0]!;
      const ultimo = pontos[pontos.length - 1]!;
      const reto = pontos.every((p) => projetarNoSegmento(p, primeiro, ultimo).distancia <= tolerancia);
      if (reto) {
        trechos.push({ pontos: [primeiro, ultimo], paredeId: paredeNaEstaca(cadeia, acum, (de + ate) / 2) });
        continue;
      }
      let estaca = de;
      for (let k = 0; k + 1 < pontos.length; k++) {
        const a = pontos[k]!;
        const b = pontos[k + 1]!;
        const comprimento = Math.hypot(b.x - a.x, b.y - a.y);
        trechos.push({ pontos: [a, b], paredeId: paredeNaEstaca(cadeia, acum, estaca + comprimento / 2) });
        estaca += comprimento;
      }
    }
  }
  return trechos;
}

// ---------------------------------------------------------------- aço

/** Peso linear (kg/m) de uma barra: d² / 162, d em mm. */
export function pesoLinearAco(bitolaMm: number): number {
  return (bitolaMm * bitolaMm) / DIVISOR_PESO_LINEAR_ACO;
}

/** Comprimento de um estribo (m): 2 × ((b − 2c) + (h − 2c)) + ganchos. */
export function comprimentoEstribo(secaoB: number, secaoH: number, cobrimento: number): number {
  return 2 * (secaoB - 2 * cobrimento + (secaoH - 2 * cobrimento)) + GANCHOS_ESTRIBO_M;
}

export interface ParcelaAco {
  /** Sufixo estável para o id da linha. */
  chave: string;
  kg: number;
  detalhe: string;
}

/**
 * Aço de uma peça linear (viga ou pilar) de comprimento/altura `comprimento` (m).
 * modo 'taxa' → volume × taxa (kg/m³); modo 'detalhado' → longitudinais + estribos.
 * Espaçamento de estribo inválido (≤ 0) → null (o chamador gera o alerta).
 */
export function acoPecaLinear(
  comprimento: number,
  secaoB: number,
  secaoH: number,
  taxa: number,
  estrutura: ParametrosEstrutura,
): ParcelaAco[] | null {
  if (estrutura.aco.modo === 'taxa') {
    return [{ chave: 'aco', kg: secaoB * secaoH * comprimento * taxa, detalhe: DETALHE_ACO_TAXA }];
  }
  const d = estrutura.aco.detalhado;
  if (!(d.espacamentoEstribo > 0)) return null;
  const estribos = Math.ceil(comprimento / d.espacamentoEstribo) + 1;
  return [
    {
      chave: 'aco-longitudinal',
      kg: d.barrasLongitudinais * comprimento * pesoLinearAco(d.bitolaLongitudinalMm),
      detalhe: `Ø${d.bitolaLongitudinalMm} mm`,
    },
    {
      chave: 'aco-estribo',
      kg: estribos * comprimentoEstribo(secaoB, secaoH, estrutura.cobrimento) * pesoLinearAco(d.bitolaEstriboMm),
      detalhe: `Ø${d.bitolaEstriboMm} mm`,
    },
  ];
}

// ---------------------------------------------------------------- quantitativos

export interface QuantitativosViga {
  forma: number; // m² (laterais)
  concreto: number; // m³
  aco: ParcelaAco[] | null;
  /** m² (topo + laterais). */
  impermeabilizacao: number;
}

export function quantitativosViga(
  comprimento: number,
  secaoB: number,
  secaoH: number,
  estrutura: ParametrosEstrutura,
): QuantitativosViga {
  return {
    forma: 2 * secaoH * comprimento,
    concreto: secaoB * secaoH * comprimento,
    aco: acoPecaLinear(comprimento, secaoB, secaoH, estrutura.aco.taxaViga, estrutura),
    impermeabilizacao: (secaoB + 2 * secaoH) * comprimento,
  };
}

export interface QuantitativosPilar {
  forma: number; // m² (4 faces)
  concreto: number; // m³
  aco: ParcelaAco[] | null;
}

export function quantitativosPilar(
  altura: number,
  secaoB: number,
  secaoH: number,
  estrutura: ParametrosEstrutura,
): QuantitativosPilar {
  return {
    forma: 2 * (secaoB + secaoH) * altura,
    concreto: secaoB * secaoH * altura,
    aco: acoPecaLinear(altura, secaoB, secaoH, estrutura.aco.taxaPilar, estrutura),
  };
}
