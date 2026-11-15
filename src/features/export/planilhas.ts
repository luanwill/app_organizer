/**
 * Montagem das abas do Excel — função PURA (sem XLSX, sem DOM).
 *
 * Agregação: a MESMA chave da árvore do painel (src/app/ArvoreLevantamento.tsx):
 * disciplina → grupo → `descricao (+ " (detalhe)")|unidade`, somando confirmados e pendentes em
 * colunas separadas (confirmado nunca inclui pendente). Materiais: `material|unidade`.
 *
 * Decisão documentada: o grupo 'Medições' (arquitetura) aparece SOMENTE no Resumo.
 */
import type { Disciplina, Levantamento, LinhaMaterial, LinhaQuantitativo, Projeto } from '@/core/model';
import { AVISO_COMPOSICOES, ROTULO_DISCIPLINA } from '@/core/model';
import {
  ABAS,
  COLUNAS_DETALHE,
  COLUNAS_MATERIAIS,
  COLUNAS_RESUMO,
  FORMATO_INTEIRO,
  GRUPOS_ARQUITETURA_COM_ABA,
  LARGURAS_DETALHE,
  LARGURAS_MATERIAIS,
  LARGURAS_RESUMO,
  TEXTO_NAO_INFORMADO,
  TEXTO_SEM_PLANTA,
  TEXTO_SIM,
  TITULO_TOTAIS,
} from './config';

/** Célula: texto, número (formato de 2 casas), número com formato próprio ou vazia. */
export type Celula = string | number | null | { valor: number; formato: string };

export interface Planilha {
  nome: string;
  linhas: Celula[][];
  /** Largura das colunas, em caracteres. */
  larguras: number[];
}

export interface LinhaAgregada {
  grupo: string;
  descricao: string;
  detalhe: string;
  unidade: string;
  confirmado: number;
  pendente: number;
  manual: boolean;
}

/** Rótulo da árvore: descrição + " (detalhe)". */
export function rotuloDaArvore(descricao: string, detalhe?: string): string {
  return detalhe ? `${descricao} (${detalhe})` : descricao;
}

/** Agrega as linhas pela chave da árvore (grupo + descrição + detalhe + unidade), na ordem de chegada. */
export function agregarLinhas(linhas: LinhaQuantitativo[]): LinhaAgregada[] {
  const mapa = new Map<string, LinhaAgregada>();
  for (const l of linhas) {
    const chave = `${l.grupo}|${rotuloDaArvore(l.descricao, l.detalhe)}|${l.unidade}`;
    let a = mapa.get(chave);
    if (!a) {
      a = { grupo: l.grupo, descricao: l.descricao, detalhe: l.detalhe ?? '', unidade: l.unidade, confirmado: 0, pendente: 0, manual: false };
      mapa.set(chave, a);
    }
    if (l.status === 'confirmado') a.confirmado += l.quantidade;
    else a.pendente += l.quantidade;
    a.manual = a.manual || !!l.manual;
  }
  return [...mapa.values()];
}

export interface MaterialAgregado {
  material: string;
  unidade: string;
  confirmado: number;
  pendente: number;
  origem: string;
}

/** Agrega os materiais como a árvore (material + unidade), juntando as origens. */
export function agregarMateriais(materiais: LinhaMaterial[]): MaterialAgregado[] {
  const mapa = new Map<string, MaterialAgregado & { origens: string[] }>();
  for (const m of materiais) {
    const chave = `${m.material}|${m.unidade}`;
    let a = mapa.get(chave);
    if (!a) {
      a = { material: m.material, unidade: m.unidade, confirmado: 0, pendente: 0, origem: '', origens: [] };
      mapa.set(chave, a);
    }
    if (m.status === 'confirmado') a.confirmado += m.quantidade;
    else a.pendente += m.quantidade;
    if (m.origem && !a.origens.includes(m.origem)) a.origens.push(m.origem);
  }
  return [...mapa.values()].map(({ origens, ...a }) => ({ ...a, origem: origens.join('; ') }));
}

/** dd/mm/aaaa (data local). */
export function formatarData(data: Date): string {
  const d2 = (n: number) => String(n).padStart(2, '0');
  return `${d2(data.getDate())}/${d2(data.getMonth() + 1)}/${data.getFullYear()}`;
}

const DISCIPLINAS_QUANTITATIVAS = ['arquitetura', 'estrutura', 'eletrica', 'hidraulica'] as const satisfies readonly Disciplina[];

function abaDetalhe(nome: string, linhas: LinhaQuantitativo[]): Planilha {
  return {
    nome,
    larguras: LARGURAS_DETALHE,
    linhas: [
      COLUNAS_DETALHE,
      ...agregarLinhas(linhas).map((a): Celula[] => [a.grupo, a.descricao, a.detalhe, a.unidade, a.confirmado, a.pendente, a.manual ? TEXTO_SIM : null]),
    ],
  };
}

function abaResumo(projeto: Projeto, levantamento: Levantamento, materiais: MaterialAgregado[], data: Date): Planilha {
  const { peDireito, numeroPessoas } = projeto.parametros.gerais;
  const linhas: Celula[][] = [
    ['Levantamento', projeto.nome],
    ['Data', formatarData(data)],
    ['Arquivo da planta', projeto.arquivoNome ?? TEXTO_SEM_PLANTA],
    ['Pé-direito (m)', peDireito ?? TEXTO_NAO_INFORMADO],
    ['Nº de pessoas', numeroPessoas === null ? TEXTO_NAO_INFORMADO : { valor: numeroPessoas, formato: FORMATO_INTEIRO }],
    [],
    [TITULO_TOTAIS],
    COLUNAS_RESUMO,
  ];
  for (const d of DISCIPLINAS_QUANTITATIVAS) {
    for (const a of agregarLinhas(levantamento[d].linhas)) {
      linhas.push([ROTULO_DISCIPLINA[d], a.grupo, a.descricao, a.detalhe, a.unidade, a.confirmado, a.pendente]);
    }
  }
  for (const m of materiais) {
    linhas.push([ROTULO_DISCIPLINA.materiais, null, m.material, null, m.unidade, m.confirmado, m.pendente]);
  }
  return { nome: ABAS.resumo, linhas, larguras: LARGURAS_RESUMO };
}

/** As 9 abas, na ordem exigida, como matrizes de células. `data` = data do cabeçalho do Resumo. */
export function montarPlanilhas(projeto: Projeto, levantamento: Levantamento, data: Date = new Date()): Planilha[] {
  const materiais = agregarMateriais(levantamento.materiais);
  const arquitetura = levantamento.arquitetura.linhas;
  return [
    abaResumo(projeto, levantamento, materiais, data),
    ...GRUPOS_ARQUITETURA_COM_ABA.map((grupo) =>
      abaDetalhe(
        grupo,
        arquitetura.filter((l) => l.grupo === grupo),
      ),
    ),
    abaDetalhe(ABAS.estrutura, levantamento.estrutura.linhas),
    abaDetalhe(ABAS.eletrica, levantamento.eletrica.linhas),
    abaDetalhe(ABAS.hidraulica, levantamento.hidraulica.linhas),
    {
      nome: ABAS.materiais,
      larguras: LARGURAS_MATERIAIS,
      linhas: [
        COLUNAS_MATERIAIS,
        ...materiais.map((m): Celula[] => [m.material, m.unidade, m.confirmado, m.pendente, m.origem]),
        [],
        [AVISO_COMPOSICOES],
      ],
    },
  ];
}
