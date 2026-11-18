/**
 * Composições de materiais (S8) — DADOS/CONFIGURAÇÃO.
 * Todos os coeficientes são valores de REFERÊNCIA, editáveis pelo usuário na aba Materiais
 * (confira com a sua composição SINAPI/TCPO). Nenhum coeficiente fica no código de cálculo.
 *
 * Convenções:
 *  - coeficiente = quantidade de material por unidade do serviço (SERVICOS[servico].unidade);
 *  - perdaPct    = perda em %, aplicada sobre o coeficiente;
 *  - `detalhe` na composição = filtro pelo `detalhe` da linha (ex.: 'fck 25'); sem detalhe = genérica;
 *  - o marcador MARCADOR_DETALHE no nome do material é trocado pelo `detalhe` da linha de serviço
 *    (ex.: "Aço {detalhe}" → "Aço Ø10 mm"), para o material sair separado por bitola/categoria.
 */
import type { CodigoServico, Composicao, InsumoComposicao } from '@/core/model';
import { COMPOSICOES_COBERTURA } from './composicoesCobertura';

/** Marcador, no nome do material, substituído pelo `detalhe` da linha de serviço. */
export const MARCADOR_DETALHE = '{detalhe}';

/** Separador das origens quando o mesmo material vem de vários serviços/disciplinas. */
export const SEPARADOR_ORIGENS = ' + ';

/** Prefixo dos ids das linhas de material consolidadas. */
export const PREFIXO_ID_MATERIAL = 'mat';

/** Casas decimais máximas ao exibir coeficientes e perdas no painel. */
export const CASAS_COEFICIENTE = 4;

/** Insumo em branco criado pelo botão "+ insumo". */
export const INSUMO_NOVO: InsumoComposicao = { material: 'Novo material', unidade: 'un', coeficiente: 1, perdaPct: 0 };

// ---------------------------------------------------------------- bases de referência

/** Pintura: consumo de tinta por demão e nº de demãos de referência. */
export const TINTA_L_POR_M2_POR_DEMAO = 0.17;
export const DEMAOS_REFERENCIA = 2;
export const DETALHE_DEMAOS_REFERENCIA = `${DEMAOS_REFERENCIA} demãos`;
const TINTA_L_POR_M2 = TINTA_L_POR_M2_POR_DEMAO * DEMAOS_REFERENCIA;

const PERDA_PECAS_PCT = 10; // piso, revestimento, rodapé (recortes)
const PERDA_ACO_PCT = 10;
const PERDA_FORMA_PCT = 15;
const PERDA_CONCRETO_PCT = 5;

/** Traços de referência por m³ de concreto: cimento (kg), areia (m³) e brita (m³). */
interface Traco {
  cimentoKg: number;
  areiaM3: number;
  britaM3: number;
}
const TRACOS_CONCRETO: Record<'fck 20' | 'fck 25' | 'fck 30', Traco> = {
  'fck 20': { cimentoKg: 310, areiaM3: 0.62, britaM3: 0.83 },
  'fck 25': { cimentoKg: 350, areiaM3: 0.6, britaM3: 0.82 },
  'fck 30': { cimentoKg: 400, areiaM3: 0.57, britaM3: 0.8 },
};
/** fck usado pela composição genérica de concreto (linha sem fck ou com fck fora da lista). */
const FCK_GENERICO = 'fck 25' as const;
/** Lastro: traço magro. */
const TRACO_MAGRO: Traco = { cimentoKg: 220, areiaM3: 0.68, britaM3: 0.85 };

// ---------------------------------------------------------------- montagem

const insumo = (material: string, unidade: string, coeficiente: number, perdaPct = 0): InsumoComposicao => ({
  material,
  unidade,
  coeficiente,
  perdaPct,
});

function composicao(servico: CodigoServico, insumos: InsumoComposicao[], detalhe?: string): Composicao {
  const id = `padrao-${servico}${detalhe ? `-${detalhe.replace(/\s+/g, '-')}` : ''}`;
  return detalhe ? { id, servico, detalhe, insumos } : { id, servico, insumos };
}

const insumosConcreto = (t: Traco): InsumoComposicao[] => [
  insumo('Cimento', 'kg', t.cimentoKg, PERDA_CONCRETO_PCT),
  insumo('Areia', 'm³', t.areiaM3, PERDA_CONCRETO_PCT),
  insumo('Brita', 'm³', t.britaM3, PERDA_CONCRETO_PCT),
];

const insumosPintura = (): InsumoComposicao[] => [
  insumo('Tinta acrílica', 'L', TINTA_L_POR_M2),
  insumo('Massa corrida', 'kg', 0.5),
  insumo('Selador', 'L', 0.1),
];

const insumosAssentamentoCeramico = (peca: string): InsumoComposicao[] => [
  insumo(peca, 'm²', 1, PERDA_PECAS_PCT),
  insumo('Argamassa colante', 'kg', 5),
  insumo('Rejunte', 'kg', 0.5),
];

/** Composições padrão (usadas quando projeto.composicoes === null). */
export const COMPOSICOES_PADRAO: Composicao[] = [
  composicao('alvenaria', [
    insumo('Bloco cerâmico 14×19×29', 'un', 17.5),
    insumo('Argamassa de assentamento', 'm³', 0.012),
  ]),
  composicao('chapisco', [insumo('Argamassa de chapisco', 'm³', 0.005)]),
  composicao('emboco', [insumo('Argamassa de emboço', 'm³', 0.02)]),
  composicao('reboco', [insumo('Argamassa de reboco', 'm³', 0.005)]),
  composicao('contrapiso', [insumo('Argamassa de contrapiso', 'm³', 0.04)]),
  composicao('piso', insumosAssentamentoCeramico('Piso cerâmico')),
  composicao('rodape', [insumo('Rodapé', 'm', 1, PERDA_PECAS_PCT)]),
  composicao('revestimento-parede', insumosAssentamentoCeramico('Revestimento cerâmico de parede')),
  composicao('pintura-parede', insumosPintura(), DETALHE_DEMAOS_REFERENCIA),
  composicao('pintura-parede', insumosPintura()),
  composicao('pintura-teto', insumosPintura(), DETALHE_DEMAOS_REFERENCIA),
  composicao('pintura-teto', insumosPintura()),
  composicao('impermeabilizacao', [insumo('Impermeabilizante', 'kg', 1.5)]),
  ...(Object.keys(TRACOS_CONCRETO) as (keyof typeof TRACOS_CONCRETO)[]).map((fck) =>
    composicao('concreto', insumosConcreto(TRACOS_CONCRETO[fck]), fck),
  ),
  composicao('concreto', insumosConcreto(TRACOS_CONCRETO[FCK_GENERICO])),
  composicao('forma', [insumo('Madeira para forma (chapa/tábua)', 'm²', 1, PERDA_FORMA_PCT)]),
  composicao('aco', [insumo(`Aço ${MARCADOR_DETALHE}`, 'kg', 1, PERDA_ACO_PCT)]),
  composicao('lastro', insumosConcreto(TRACO_MAGRO)),
  ...COMPOSICOES_COBERTURA,
];
