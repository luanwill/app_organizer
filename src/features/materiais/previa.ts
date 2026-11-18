/**
 * "Prévia da análise" — lógica PURA: o que mostrar em cada fase/progresso e a contagem crescente.
 * Sem React/DOM. Usa apenas as linhas 'confirmado' da prévia (o app trata os pendentes da análise
 * como confirmados numa CÓPIA do projeto; os totais reais não mudam).
 */
import type { Alerta, Levantamento, LinhaMaterial, LinhaQuantitativo } from '@/core/model';
import { formatarNumero } from '@/core/calc';
import {
  CASAS_PREVIA,
  FASE_MATERIAIS,
  JANELA_CASCATA,
  SECOES_PREVIA,
  ORDEM_FASES_PREVIA,
  UNIDADES_INTEIRAS,
  type DestaqueConfig,
  type FasePrevia,
  type IdSecaoPrevia,
  type SecaoConfig,
} from './previaConfig';

const limitar = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export function indiceFase(fase: FasePrevia): number {
  return ORDEM_FASES_PREVIA.indexOf(fase);
}

/** Progresso geral 0..1 da análise (fase atual + progresso dentro dela). */
export function progressoGeral(fase: FasePrevia, progresso: number): number {
  if (fase === 'concluida') return 1;
  return limitar((indiceFase(fase) + limitar(progresso)) / (ORDEM_FASES_PREVIA.length - 1));
}

/**
 * Andamento 0..1 de algo que surge na fase `alvo`: null = ainda não visível; 1 = valor final.
 * Na própria fase segue o progresso; depois dela (ou com a análise concluída), 1.
 */
export function andamento(alvo: FasePrevia, fase: FasePrevia, progresso: number): number | null {
  const a = indiceFase(alvo);
  const f = indiceFase(fase);
  if (f < a) return null;
  return f === a ? limitar(progresso) : 1;
}

/** Suavização da contagem (desacelera no fim). */
export function suavizar(t: number): number {
  const x = limitar(t);
  return 1 - (1 - x) ** 3;
}

/** Valor da contagem crescente em t (0..1); unidades inteiras contam de 1 em 1. */
export function valorContagem(final: number, t: number, unidade = ''): number {
  if (!Number.isFinite(final)) return 0;
  const v = final * suavizar(t);
  return UNIDADES_INTEIRAS.includes(unidade) ? Math.round(v) : v;
}

/** "12,50 m²" / "7 un" (vírgula decimal). */
export function formatarValorPrevia(valor: number, unidade: string): string {
  const casas = UNIDADES_INTEIRAS.includes(unidade) ? 0 : CASAS_PREVIA;
  return `${formatarNumero(valor, casas)} ${unidade}`.trim();
}

/** Estado de um item da cascata de materiais. */
export function estadoCascata(
  indice: number,
  total: number,
  fase: FasePrevia,
  progresso: number,
): { visivel: boolean; t: number } {
  const base = andamento(FASE_MATERIAIS, fase, progresso);
  if (base === null) return { visivel: false, t: 0 };
  if (base >= 1 || total <= 0) return { visivel: true, t: 1 };
  const inicio = (indice / total) * JANELA_CASCATA;
  if (base < inicio) return { visivel: false, t: 0 };
  return { visivel: true, t: limitar((base - inicio) / (1 - JANELA_CASCATA)) };
}

// ---------------------------------------------------------------- resumo da prévia

export interface DestaquePrevia {
  rotulo: string;
  unidade: string;
  fase: FasePrevia;
  valor: number;
}

export interface SecaoPrevia {
  id: IdSecaoPrevia;
  rotulo: string;
  disciplina: SecaoConfig['disciplina'];
  /** Fase em que o cartão aparece. */
  fase: FasePrevia;
  /** Fases dos destaques (o cartão fica "ativo" nelas). */
  fasesDestaques: FasePrevia[];
  destaques: DestaquePrevia[];
  /** Faltantes com selo próprio (ex.: "tipo de telha"). */
  faltantesNomeados: string[];
  /** Nº dos demais dados faltantes (alertas distintos). */
  faltantes: number;
}

export interface MaterialPrevia {
  chave: string;
  material: string;
  unidade: string;
  quantidade: number;
}

export interface ResumoPrevia {
  secoes: SecaoPrevia[];
  materiais: MaterialPrevia[];
}

function valorDestaque(d: DestaqueConfig, linhas: LinhaQuantitativo[]): number {
  const filtradas = linhas.filter(d.filtro);
  if (d.modo === 'contagem') return new Set(filtradas.map((l) => l.elementoIds[0] ?? l.id)).size;
  return filtradas.reduce((s, l) => s + l.quantidade, 0);
}

/** Consolida materiais confirmados por material + unidade, na ordem de chegada. */
function materiaisDaPrevia(materiais: LinhaMaterial[]): MaterialPrevia[] {
  const mapa = new Map<string, MaterialPrevia>();
  for (const m of materiais) {
    if (m.status !== 'confirmado') continue;
    const chave = `${m.material}|${m.unidade}`;
    const item = mapa.get(chave) ?? { chave, material: m.material, unidade: m.unidade, quantidade: 0 };
    item.quantidade += m.quantidade;
    mapa.set(chave, item);
  }
  return [...mapa.values()].filter((m) => m.quantidade > 0);
}

/**
 * Alertas de cada seção: cada alerta vai para a 1ª seção da sua disciplina cujo predicado o aceita;
 * os que sobram vão para a seção padrão da disciplina (sem predicado). Mensagens repetidas contam uma vez.
 */
function alertasPorSecao(previa: Levantamento): Map<IdSecaoPrevia, Alerta[]> {
  const mapa = new Map<IdSecaoPrevia, Map<string, Alerta>>(SECOES_PREVIA.map((s) => [s.id, new Map()]));
  for (const disciplina of new Set(SECOES_PREVIA.map((s) => s.disciplina))) {
    const daDisciplina = SECOES_PREVIA.filter((s) => s.disciplina === disciplina);
    const padrao = daDisciplina.find((s) => !s.alertas);
    for (const a of previa[disciplina].alertas) {
      const secao = daDisciplina.find((s) => s.alertas?.(a)) ?? padrao;
      if (secao) mapa.get(secao.id)?.set(a.mensagem, a);
    }
  }
  return new Map([...mapa].map(([id, m]) => [id, [...m.values()]]));
}

/** O que o painel mostra a partir da prévia: só linhas 'confirmado'; destaques zerados são omitidos. */
export function resumirPrevia(previa: Levantamento): ResumoPrevia {
  const alertas = alertasPorSecao(previa);
  const secoes = SECOES_PREVIA.map((cfg): SecaoPrevia => {
    const linhas = previa[cfg.disciplina].linhas.filter((l) => l.status === 'confirmado' && cfg.linhas(l));
    const destaques = cfg.destaques
      .map((d) => ({ rotulo: d.rotulo, unidade: d.unidade, fase: d.fase, valor: valorDestaque(d, linhas) }))
      .filter((d) => d.valor > 0);
    const daSecao = alertas.get(cfg.id) ?? [];
    const nomeados = (cfg.faltantesNomeados ?? []).filter((n) => daSecao.some(n.alerta));
    const outros = daSecao.filter((a) => !(cfg.faltantesNomeados ?? []).some((n) => n.alerta(a)));
    return {
      id: cfg.id,
      rotulo: cfg.rotulo,
      disciplina: cfg.disciplina,
      fase: cfg.fase,
      fasesDestaques: [...new Set(cfg.destaques.map((d) => d.fase))],
      destaques,
      faltantesNomeados: nomeados.map((n) => n.nome),
      faltantes: outros.length,
    };
  });
  return { secoes, materiais: materiaisDaPrevia(previa.materiais) };
}
