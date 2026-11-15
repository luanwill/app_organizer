/** Composições de materiais (S8): dados padrão + cálculo puro + painel. */
import type { MateriaisApi } from '@/core/model';
import { calcularMateriais } from './calcular';
import { COMPOSICOES_PADRAO } from './config';

export { calcularMateriais, composicaoDaLinha, nomeDoMaterial, quantidadeDoInsumo } from './calcular';
export * from './config';
export { PainelMateriais } from './PainelMateriais';

/** Verificação de tipo e objeto pronto para o registro em src/app/modulos.ts. */
export const materiaisApi = { COMPOSICOES_PADRAO, calcularMateriais } satisfies MateriaisApi;
