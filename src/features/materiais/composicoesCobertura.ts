/**
 * Composições de REFERÊNCIA da cobertura (telhado, calhas, rufos e condutores) — DADOS.
 * Editáveis na aba Materiais; confira com a sua composição (SINAPI/TCPO). Sem preços.
 *
 * Filtro por detalhe = tipo de telha (TipoTelha: 'ceramica', 'concreto', 'fibrocimento', 'metalica',
 * 'sanduiche'), que a estrutura emite nas linhas de telhamento e madeiramento.
 *  - Telhamento e madeiramento NÃO têm composição genérica: sem tipo de telha informado não se
 *    assume telha nenhuma (a linha não gera material; a estrutura já mostra o "dado faltante").
 *  - Cumeeira tem genérica neutra (comprimento de peças) e específicas por telha, se vierem com detalhe.
 *
 * Calha e rufo (serviço em m): a chapa é medida em m² pelo DESENVOLVIMENTO (largura da chapa antes
 * de dobrar). Coeficiente = desenvolvimento (m) × 1 m de calha: calha padrão 50 cm → 0,50 m²/m;
 * rufo padrão 33 cm → 0,33 m²/m. Para outro desenvolvimento, edite o coeficiente (ex.: 60 cm → 0,60).
 *
 * Condutor (serviço em m): tubo PVC 100 mm em barras de 6 m → 1/6 barra por metro (a quantidade
 * consolidada é fracionária; arredonde a barra inteira na compra). Conexões e abraçadeiras por metro
 * a partir de um condutor típico de ~3 m (2 curvas/luvas e 1 abraçadeira a cada 2 m).
 */
import type { CodigoServico, Composicao, InsumoComposicao, TipoTelha } from '@/core/model';

const insumo = (material: string, unidade: string, coeficiente: number, perdaPct = 0): InsumoComposicao => ({
  material,
  unidade,
  coeficiente,
  perdaPct,
});

function composicao(servico: CodigoServico, insumos: InsumoComposicao[], detalhe?: string): Composicao {
  const id = `padrao-${servico}${detalhe ? `-${detalhe}` : ''}`;
  return detalhe ? { id, servico, detalhe, insumos } : { id, servico, insumos };
}

const PERDA_TELHA_PCT = 5;
const PERDA_MADEIRA_PCT = 10;
const PERDA_CHAPA_PCT = 10;
const PERDA_PVC_PCT = 5;

/** Desenvolvimentos padrão (m) — iguais aos parâmetros padrão da cobertura (50 cm e 33 cm). */
export const DESENVOLVIMENTO_CALHA_M = 0.5;
export const DESENVOLVIMENTO_RUFO_M = 0.33;
export const COMPRIMENTO_BARRA_PVC_M = 6;

/** Telhas e fixação por m² de telhado (área inclinada). Chapas: m² de chapa com recobrimento. */
const TELHAMENTO: Record<TipoTelha, InsumoComposicao[]> = {
  ceramica: [insumo('Telha cerâmica', 'un', 16, PERDA_TELHA_PCT), insumo('Arame galvanizado para amarração', 'kg', 0.01)],
  concreto: [insumo('Telha de concreto', 'un', 10.5, PERDA_TELHA_PCT), insumo('Prego galvanizado para telha', 'kg', 0.02)],
  fibrocimento: [
    insumo('Telha de fibrocimento (m² de chapa, com recobrimento)', 'm²', 1.18, PERDA_TELHA_PCT),
    insumo('Parafuso/gancho de fixação com vedação', 'un', 1.5),
  ],
  metalica: [
    insumo('Telha metálica (m² de chapa, com recobrimento)', 'm²', 1.1, PERDA_TELHA_PCT),
    insumo('Parafuso autobrocante com vedação', 'un', 3),
  ],
  sanduiche: [
    insumo('Telha sanduíche (m² de painel, com recobrimento)', 'm²', 1.08, PERDA_TELHA_PCT),
    insumo('Parafuso autobrocante com vedação', 'un', 3),
  ],
};

/** Madeiramento por m² de telhado. Cerâmica/concreto: estrutura completa; chapas: só terças. */
const MADEIRAMENTO: Record<TipoTelha, InsumoComposicao[]> = {
  ceramica: [
    insumo('Madeira serrada (tesouras, terças e caibros)', 'm³', 0.022, PERDA_MADEIRA_PCT),
    insumo('Ripa de madeira', 'm', 3.2, PERDA_MADEIRA_PCT),
    insumo('Prego para madeiramento', 'kg', 0.08),
  ],
  concreto: [
    insumo('Madeira serrada (tesouras, terças e caibros)', 'm³', 0.024, PERDA_MADEIRA_PCT),
    insumo('Ripa de madeira', 'm', 3, PERDA_MADEIRA_PCT),
    insumo('Prego para madeiramento', 'kg', 0.08),
  ],
  fibrocimento: [insumo('Madeira serrada (terças)', 'm³', 0.012, PERDA_MADEIRA_PCT), insumo('Prego para madeiramento', 'kg', 0.03)],
  metalica: [insumo('Madeira serrada (terças)', 'm³', 0.01, PERDA_MADEIRA_PCT), insumo('Prego para madeiramento', 'kg', 0.03)],
  sanduiche: [insumo('Madeira serrada (terças)', 'm³', 0.01, PERDA_MADEIRA_PCT), insumo('Prego para madeiramento', 'kg', 0.03)],
};

/** Cumeeira por m. Cerâmica/concreto: peças emboçadas (~3 un/m) com argamassa; chapas: peça por m. */
const CUMEEIRA: Record<TipoTelha, InsumoComposicao[]> = {
  ceramica: [insumo('Cumeeira cerâmica', 'un', 3, PERDA_TELHA_PCT), insumo('Argamassa para cumeeira', 'm³', 0.003)],
  concreto: [insumo('Cumeeira de concreto', 'un', 3, PERDA_TELHA_PCT), insumo('Argamassa para cumeeira', 'm³', 0.003)],
  fibrocimento: [insumo('Cumeeira de fibrocimento', 'm', 1, PERDA_TELHA_PCT), insumo('Parafuso/gancho de fixação com vedação', 'un', 2)],
  metalica: [insumo('Cumeeira metálica', 'm', 1, PERDA_TELHA_PCT), insumo('Parafuso autobrocante com vedação', 'un', 4)],
  sanduiche: [insumo('Cumeeira para telha sanduíche', 'm', 1, PERDA_TELHA_PCT), insumo('Parafuso autobrocante com vedação', 'un', 4)],
};

const tipos = Object.keys(TELHAMENTO) as TipoTelha[];

export const COMPOSICOES_COBERTURA: Composicao[] = [
  ...tipos.map((t) => composicao('telhamento', TELHAMENTO[t], t)),
  ...tipos.map((t) => composicao('madeiramento', MADEIRAMENTO[t], t)),
  ...tipos.map((t) => composicao('cumeeira', CUMEEIRA[t], t)),
  composicao('cumeeira', [insumo('Cumeeira (comprimento de peças)', 'm', 1, PERDA_TELHA_PCT)]),
  composicao('calha', [
    insumo('Chapa galvanizada para calha (desenvolvimento 50 cm)', 'm²', DESENVOLVIMENTO_CALHA_M, PERDA_CHAPA_PCT),
    insumo('Suporte/escápula de calha', 'un', 1.5),
    insumo('Selante PU (tubo)', 'un', 0.1),
  ]),
  composicao('rufo', [
    insumo('Chapa galvanizada para rufo (desenvolvimento 33 cm)', 'm²', DESENVOLVIMENTO_RUFO_M, PERDA_CHAPA_PCT),
    insumo('Selante PU (tubo)', 'un', 0.1),
    insumo('Parafuso com bucha', 'un', 2),
  ]),
  composicao('condutor', [
    insumo('Tubo PVC 100 mm (barra 6 m)', 'un', 1 / COMPRIMENTO_BARRA_PVC_M, PERDA_PVC_PCT),
    insumo('Conexões PVC 100 mm (curvas/luvas)', 'un', 0.67),
    insumo('Abraçadeira para tubo 100 mm', 'un', 0.5),
  ]),
];
