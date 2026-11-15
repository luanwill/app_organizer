/**
 * Conversão de serviços em materiais (S8) — função PURA.
 *  - linha com `ehMaterial` → vai direto ao consolidado (descrição + detalhe), mesmo que tenha serviço;
 *  - linha com `servico` → composição do serviço (a de `detalhe` igual tem precedência sobre a genérica):
 *    material = quantidade × coeficiente × (1 + perda/100);
 *  - consolida por material + unidade + status (confirmado e pendente nunca se misturam).
 */
import type { Composicao, InsumoComposicao, LinhaMaterial, LinhaQuantitativo } from '@/core/model';
import { ROTULO_DISCIPLINA, SERVICOS } from '@/core/model';
import { MARCADOR_DETALHE, PREFIXO_ID_MATERIAL, SEPARADOR_ORIGENS } from './config';

const limpo = (texto: string | undefined): string => (texto ?? '').trim();

/** Composição aplicável à linha: a específica do detalhe, senão a genérica, senão nenhuma. */
export function composicaoDaLinha(
  linha: Pick<LinhaQuantitativo, 'servico' | 'detalhe'>,
  composicoes: Composicao[],
): Composicao | undefined {
  if (!linha.servico) return undefined;
  const doServico = composicoes.filter((c) => c.servico === linha.servico);
  const detalhe = limpo(linha.detalhe);
  return (
    (detalhe ? doServico.find((c) => limpo(c.detalhe) === detalhe) : undefined) ??
    doServico.find((c) => limpo(c.detalhe) === '')
  );
}

/** Quantidade de material de um insumo para a quantidade de serviço informada. */
export function quantidadeDoInsumo(quantidadeServico: number, insumo: InsumoComposicao): number {
  return quantidadeServico * insumo.coeficiente * (1 + insumo.perdaPct / 100);
}

/** Nome do material do insumo, com o marcador de detalhe resolvido ("Aço {detalhe}" → "Aço Ø10 mm"). */
export function nomeDoMaterial(insumo: InsumoComposicao, detalheDaLinha: string | undefined): string {
  return insumo.material.split(MARCADOR_DETALHE).join(limpo(detalheDaLinha)).replace(/\s+/g, ' ').trim();
}

interface Acumulado {
  linha: LinhaMaterial;
  origens: string[];
}

export function calcularMateriais(linhas: LinhaQuantitativo[], composicoes: Composicao[]): LinhaMaterial[] {
  const consolidado = new Map<string, Acumulado>();

  const somar = (material: string, unidade: string, quantidade: number, l: LinhaQuantitativo, origem: string): void => {
    if (!Number.isFinite(quantidade) || quantidade === 0) return;
    const id = `${PREFIXO_ID_MATERIAL}:${material}|${unidade}|${l.status}`;
    let acc = consolidado.get(id);
    if (!acc) {
      acc = { linha: { id, material, unidade, quantidade: 0, status: l.status, origem: '' }, origens: [] };
      consolidado.set(id, acc);
    }
    acc.linha.quantidade += quantidade;
    if (!acc.origens.includes(origem)) acc.origens.push(origem);
  };

  for (const l of linhas) {
    if (l.ehMaterial) {
      const detalhe = limpo(l.detalhe);
      somar(detalhe ? `${l.descricao} ${detalhe}` : l.descricao, l.unidade, l.quantidade, l, ROTULO_DISCIPLINA[l.disciplina]);
      continue;
    }
    const composicao = composicaoDaLinha(l, composicoes);
    if (!composicao || !l.servico) continue; // serviço sem composição não gera material
    const origem = SERVICOS[l.servico].descricao;
    for (const insumo of composicao.insumos) {
      somar(nomeDoMaterial(insumo, l.detalhe), insumo.unidade, quantidadeDoInsumo(l.quantidade, insumo), l, origem);
    }
  }

  return [...consolidado.values()].map(({ linha, origens }) => ({ ...linha, origem: origens.join(SEPARADOR_ORIGENS) }));
}
