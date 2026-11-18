/**
 * Integração (orquestrador): botão "Analisar planta". Reconhece paredes e ambientes do PDF vetorial
 * e roda as sugestões de estrutura, elétrica e hidráulica — tudo entra 'pendente'. Depois dispara a
 * apresentação animada (useAnalise). A prévia trata esses pendentes como confirmados, só para exibir.
 */
import { OPS } from 'pdfjs-dist';
import type { Disciplina, Elemento, Projeto } from '@/core/model';
import { escalaValida } from '@/core/calc';
import { useLevantamento } from '@/core/store';
import { abrirPdf } from '@/features/viewer/pdf';
import {
  ehDoReconhecimentoPdf,
  extrairVetores,
  paraEntradaDoReconhecimento,
  reconhecerVetores,
} from '@/features/import';
import { MODULOS } from './modulos';
import { useAnalise, type FaseAnalise } from './analise';

export interface ResultadoAnalise {
  erro?: string;
  pendencias: string[];
}

/** Fase em que cada tipo de elemento aparece na apresentação. */
export function faseDoElemento(e: Elemento): FaseAnalise | null {
  if (e.tipo === 'parede') return 'paredes';
  if (e.tipo === 'ambiente') return 'ambientes';
  if (e.tipo === 'laje') return 'laje';
  if (e.tipo === 'telhado') return 'telhado';
  if (e.tipo === 'calha') return 'calhas';
  if (e.disciplina === 'estrutura') return 'estrutura';
  if (e.disciplina === 'eletrica') return 'eletrica';
  if (e.disciplina === 'hidraulica') return 'hidraulica';
  return null;
}

/** Agrupa os ids novos por fase, na ordem em que foram gerados. */
export function agruparPorFase(elementos: Elemento[]): Partial<Record<FaseAnalise, string[]>> {
  const porFase: Partial<Record<FaseAnalise, string[]>> = {};
  for (const e of elementos) {
    const f = faseDoElemento(e);
    if (!f) continue;
    (porFase[f] ??= []).push(e.id);
  }
  return porFase;
}

/** Cópia do projeto em que os elementos indicados contam como confirmados (só para a prévia). */
export function projetoDaPrevia(projeto: Projeto, ids: Set<string>): Projeto {
  return {
    ...projeto,
    elementos: projeto.elementos.map((e) => (ids.has(e.id) && e.status === 'pendente' ? { ...e, status: 'confirmado' } : e)),
  };
}

const DISCIPLINAS_SUGESTAO: Disciplina[] = ['estrutura', 'eletrica', 'hidraulica'];

export async function analisarPlanta(): Promise<ResultadoAnalise> {
  const st = useLevantamento.getState();
  const pagina = st.paginaAtual;
  const escala = st.projeto.paginas[pagina]?.escala;
  if (!st.pdfDados) return { erro: 'Abra uma planta em PDF antes de analisar.', pendencias: [] };
  if (!escalaValida(escala)) return { erro: 'Calibre a escala desta página (etapa 1) antes de analisar.', pendencias: [] };

  const antes = new Set(st.projeto.elementos.map((e) => e.id));
  const pendencias: string[] = [];

  // 1. paredes e ambientes do PDF vetorial
  const documento = await abrirPdf(st.pdfDados);
  let vetores;
  try {
    vetores = await extrairVetores(await documento.getPage(pagina), OPS as unknown as Record<string, number>);
  } finally {
    void documento.destroy();
  }
  const reconhecido = reconhecerVetores(paraEntradaDoReconhecimento(vetores), { pagina, escala });
  if (reconhecido.situacao === 'ok') {
    const anteriores = useLevantamento
      .getState()
      .projeto.elementos.filter((e) => e.pagina === pagina && e.status === 'pendente' && ehDoReconhecimentoPdf(e))
      .map((e) => e.id);
    if (anteriores.length > 0) useLevantamento.getState().removerElementos(anteriores);
    useLevantamento.getState().adicionarElementos(reconhecido.elementos);
    pendencias.push(...reconhecido.pendencias);
  } else {
    // sem reconhecimento automático: segue com o que já foi desenhado à mão
    pendencias.push(reconhecido.mensagem ?? 'Não foi possível reconhecer paredes e ambientes deste PDF.');
  }

  // 2. sugestões das disciplinas (sobre paredes/ambientes desenhados ou reconhecidos)
  for (const d of DISCIPLINAS_SUGESTAO) {
    const modulo = MODULOS[d as keyof typeof MODULOS];
    if (!modulo?.sugerir) continue;
    const atual = useLevantamento.getState();
    atual.substituirSugestoes(d, modulo.sugerir(atual.projeto, pagina), pagina);
  }

  // 3. apresentação: só o que nasceu nesta análise
  const novos = useLevantamento.getState().projeto.elementos.filter((e) => !antes.has(e.id) && e.pagina === pagina);
  if (novos.length === 0) {
    return { erro: pendencias[0] ?? 'Nada foi encontrado para analisar nesta página.', pendencias };
  }
  useAnalise.getState().iniciar(pagina, agruparPorFase(novos));
  return { pendencias };
}
