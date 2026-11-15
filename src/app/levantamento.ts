/** Integração (orquestrador): consolida os resultados das disciplinas e os materiais. */
import { useMemo } from 'react';
import type { Levantamento, LinhaQuantitativo, Projeto, ResultadoDisciplina } from '@/core/model';
import { useLevantamento } from '@/core/store';
import { MODULOS, materiaisApi } from './modulos';

const VAZIO: ResultadoDisciplina = { linhas: [], alertas: [] };

export function calcularLevantamento(projeto: Projeto): Levantamento {
  const r = (d: keyof typeof MODULOS): ResultadoDisciplina => MODULOS[d]?.calcular(projeto) ?? VAZIO;
  const arquitetura = r('arquitetura');
  const estrutura = r('estrutura');
  const eletrica = r('eletrica');
  const hidraulica = r('hidraulica');
  const linhas: LinhaQuantitativo[] = [
    ...arquitetura.linhas,
    ...estrutura.linhas,
    ...eletrica.linhas,
    ...hidraulica.linhas,
  ];
  const materiais = materiaisApi
    ? materiaisApi.calcularMateriais(linhas, projeto.composicoes ?? materiaisApi.COMPOSICOES_PADRAO)
    : [];
  return { arquitetura, estrutura, eletrica, hidraulica, materiais };
}

/** Levantamento recalculado ao vivo a cada mudança do projeto. */
export function useLevantamentoCalculado(): Levantamento {
  const projeto = useLevantamento((s) => s.projeto);
  return useMemo(() => calcularLevantamento(projeto), [projeto]);
}
