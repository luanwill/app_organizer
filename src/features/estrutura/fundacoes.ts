/** Fundações: quantitativos de sapata, bloco + estaca(s) e radier. Funções puras (metros). */
import type { ParametrosEstrutura } from '@/core/model';

export interface QuantitativosFundacao {
  escavacao: number; // m³
  lastro: number; // m³
  forma: number; // m²
  concreto: number; // m³
  aco: number; // kg
}

export interface QuantitativosBloco extends QuantitativosFundacao {
  estacas: number; // un
  concretoEstacas: number; // m³
  perfuracao: number; // m
}

export function quantitativosSapata(estrutura: ParametrosEstrutura): QuantitativosFundacao {
  const { ladoA, ladoB, altura, profundidade } = estrutura.fundacao.sapata;
  const concreto = ladoA * ladoB * altura;
  return {
    escavacao: ladoA * ladoB * profundidade,
    lastro: ladoA * ladoB * estrutura.fundacao.espessuraLastro,
    forma: 2 * (ladoA + ladoB) * altura,
    concreto,
    aco: concreto * estrutura.aco.taxaFundacao,
  };
}

/** Bloco como a sapata (escavação com a altura do bloco) + estacas. O aço considera só o bloco. */
export function quantitativosBloco(estrutura: ParametrosEstrutura): QuantitativosBloco {
  const { ladoA, ladoB, altura, estacasPorBloco, diametroEstaca, comprimentoEstaca } = estrutura.fundacao.bloco;
  const concreto = ladoA * ladoB * altura;
  return {
    escavacao: ladoA * ladoB * altura,
    lastro: ladoA * ladoB * estrutura.fundacao.espessuraLastro,
    forma: 2 * (ladoA + ladoB) * altura,
    concreto,
    aco: concreto * estrutura.aco.taxaFundacao,
    estacas: estacasPorBloco,
    concretoEstacas: ((estacasPorBloco * Math.PI * diametroEstaca * diametroEstaca) / 4) * comprimentoEstaca,
    perfuracao: estacasPorBloco * comprimentoEstaca,
  };
}

/** Radier de área `area` (m²) e perímetro `perimetro` (m). Escavação = área × (radier + lastro). */
export function quantitativosRadier(area: number, perimetro: number, estrutura: ParametrosEstrutura): QuantitativosFundacao {
  const { espessura } = estrutura.fundacao.radier;
  const { espessuraLastro } = estrutura.fundacao;
  const concreto = area * espessura;
  return {
    escavacao: area * (espessura + espessuraLastro),
    lastro: area * espessuraLastro,
    forma: perimetro * espessura,
    concreto,
    aco: concreto * estrutura.aco.taxaFundacao,
  };
}
