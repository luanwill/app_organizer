/**
 * QA (S10) — CASO DE EXEMPLO reutilizável (fábrica pura, sem React/store).
 *
 * Planta em "L" com 6 cantos + 1 parede interna que encontra a parede esquerda em T (metros):
 *
 *  (0,0)──────────────────────────(9,0)
 *    │  Sala 3×4 │ Cozinha │ Banheiro │
 *  (0,4)═════(3,2;4)──────────────(9,4)
 *    │ Quarto    │
 *    │ 3,07×2,98 │
 *  (0;7,2)───(3,2;7,2)
 *
 * Página 1 calibrada com 0,02 m/unidade, pé-direito 2,80, parede 0,15, 4 pessoas.
 */
import type { Elemento, ElementoDe, Ponto, Projeto, Status, TipoAmbiente, TipoEsquadria } from '@/core/model';
import { projetoVazio } from '@/core/model';
import { MODULOS } from '@/app/modulos';

export const ESCALA = 0.02;
export const PE_DIREITO = 2.8;
export const ESPESSURA = 0.15;
export const PESSOAS = 4;
/** Margem (m) entre a borda da página e o canto (0,0) da planta — a planta não fica colada na borda do PDF. */
export const ORIGEM = 1;
/** Página do PDF do caso (unidades): 11 m × 9,2 m a 0,02 m/unidade. */
export const PAGINA = { largura: 550, altura: 460 };
export const u = (m: number): number => m / ESCALA;
/** Ponto em metros (relativo ao canto (0,0) da planta) → unidades do PDF. */
export const pt = (x: number, y: number): Ponto => ({ x: u(x + ORIGEM), y: u(y + ORIGEM) });

/** Os 6 cantos do "L" (m). */
export const CANTOS: [number, number][] = [
  [0, 0],
  [9, 0],
  [9, 4],
  [3.2, 4],
  [3.2, 7.2],
  [0, 7.2],
];
/** Encontro em T da parede interna com a parede externa esquerda (m). */
export const NO_T: [number, number] = [0, 4];

const base = (id: string, disciplina: Elemento['disciplina'], status: Status = 'confirmado') => ({
  id,
  disciplina,
  pagina: 1,
  vinculos: {},
  origem: 'desenhado' as const,
  status,
});

export function parede(id: string, a: [number, number], b: [number, number], rotulo?: string): ElementoDe<'parede'> {
  return {
    ...base(id, 'arquitetura'),
    tipo: 'parede',
    geometria: { tipo: 'polilinha', pontos: [pt(...a), pt(...b)] },
    props: { espessura: ESPESSURA },
    ...(rotulo ? { rotulo } : {}),
  };
}

export function ambiente(
  id: string,
  nome: string,
  tipoAmbiente: TipoAmbiente,
  [x0, y0, x1, y1]: [number, number, number, number],
  areaMolhada = false,
): ElementoDe<'ambiente'> {
  return {
    ...base(id, 'arquitetura'),
    tipo: 'ambiente',
    geometria: { tipo: 'poligono', pontos: [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)] },
    props: { nome, tipoAmbiente, areaMolhada, coberto: true },
    rotulo: nome,
  };
}

export function esquadria(id: string, tipoEsquadriaId: string, paredeId: string, p: [number, number]): ElementoDe<'esquadria'> {
  return {
    ...base(id, 'arquitetura'),
    tipo: 'esquadria',
    geometria: { tipo: 'ponto', ponto: pt(...p) },
    vinculos: { paredeId },
    props: { tipoEsquadriaId },
  };
}

export const CADASTRO: TipoEsquadria[] = [
  { id: 'tp-P1', codigo: 'P1', categoria: 'porta', largura: 0.8, altura: 2.1, peitoril: 0, quantidade: 2 },
  { id: 'tp-J1', codigo: 'J1', categoria: 'janela', largura: 1.2, altura: 1.0, peitoril: 1.1, quantidade: 2 },
  { id: 'tp-J2', codigo: 'J2', categoria: 'janela', largura: 2.0, altura: 1.2, peitoril: 1.0, quantidade: 1 }, // 2,40 m² (> 2 m²)
];

export function paredesDoL(): ElementoDe<'parede'>[] {
  return [
    parede('par-topo', CANTOS[0]!, CANTOS[1]!),
    parede('par-direita', CANTOS[1]!, CANTOS[2]!),
    parede('par-meio', CANTOS[2]!, CANTOS[3]!),
    parede('par-dentro', CANTOS[3]!, CANTOS[4]!),
    parede('par-base', CANTOS[4]!, CANTOS[5]!),
    parede('par-esquerda', CANTOS[5]!, CANTOS[0]!),
    parede('par-interna', NO_T, CANTOS[3]!),
  ];
}

/** Comprimento total das paredes (m): 9 + 4 + 5,8 + 3,2 + 3,2 + 7,2 + 3,2. */
export const COMPRIMENTO_PAREDES = 9 + 4 + 5.8 + 3.2 + 3.2 + 7.2 + 3.2;

/** Só a arquitetura + equipamentos fixos (quadro, reservatório, caixa de inspeção); sem sugestões. */
export function casoBase(): Projeto {
  const projeto = projetoVazio('caso-exemplo', '2026-01-01T00:00:00.000Z');
  projeto.nome = 'Caso de exemplo QA';
  projeto.totalPaginas = 1;
  projeto.paginas = { 1: { escala: ESCALA, largura: PAGINA.largura, altura: PAGINA.altura } };
  projeto.parametros.gerais = { peDireito: PE_DIREITO, espessuraParede: ESPESSURA, numeroPessoas: PESSOAS };
  projeto.esquadrias = CADASTRO.map((t) => ({ ...t }));
  projeto.elementos = [
    ...paredesDoL(),
    ambiente('amb-sala', 'Sala', 'sala', [0, 0, 3, 4]),
    ambiente('amb-cozinha', 'Cozinha', 'cozinha', [3, 0, 6.5, 4], true),
    ambiente('amb-banheiro', 'Banheiro', 'banheiro', [6.5, 0, 9, 4], true),
    ambiente('amb-quarto', 'Quarto', 'quarto', [0.06, 4.1, 3.13, 7.08]), // 3,07 × 2,98
    esquadria('esq-p1-a', 'tp-P1', 'par-topo', [1, 0]),
    esquadria('esq-p1-b', 'tp-P1', 'par-interna', [1.6, 4]),
    esquadria('esq-j1-a', 'tp-J1', 'par-topo', [4.75, 0]),
    esquadria('esq-j1-b', 'tp-J1', 'par-base', [1.6, 7.2]),
    esquadria('esq-j2-a', 'tp-J2', 'par-esquerda', [0, 2]),
    { ...base('quadro-1', 'eletrica'), tipo: 'quadro', geometria: { tipo: 'ponto', ponto: pt(0.3, 0.3) }, vinculos: { ambienteId: 'amb-sala' }, props: {}, rotulo: 'QD' },
    { ...base('res-1', 'hidraulica'), tipo: 'reservatorio', geometria: { tipo: 'ponto', ponto: pt(7.75, 2) }, vinculos: { ambienteId: 'amb-banheiro' }, props: {} },
    { ...base('ci-1', 'hidraulica'), tipo: 'caixa-inspecao', geometria: { tipo: 'ponto', ponto: pt(8.5, 5) }, props: {} },
  ];
  return projeto;
}

export type DisciplinaSugerivel = 'estrutura' | 'eletrica' | 'hidraulica';

/** Aplica a sugestão de uma disciplina como faria store.substituirSugestoes (tudo pendente). */
export function comSugestoes(projeto: Projeto, disciplina: DisciplinaSugerivel): Projeto {
  const novos = MODULOS[disciplina]!.sugerir!(projeto, 1);
  const mantidos = projeto.elementos.filter(
    (e) => !(e.disciplina === disciplina && e.origem === 'sugerido-auto' && e.status === 'pendente' && e.pagina === 1),
  );
  return { ...projeto, elementos: [...mantidos, ...novos] };
}

export function confirmar(projeto: Projeto, filtro: (e: Elemento) => boolean): Projeto {
  return { ...projeto, elementos: projeto.elementos.map((e) => (filtro(e) ? ({ ...e, status: 'confirmado' } as Elemento) : e)) };
}

/** Caso com TODAS as sugestões geradas e ainda pendentes. */
export function casoTudoPendente(): Projeto {
  let p = casoBase();
  p = comSugestoes(p, 'estrutura');
  p = comSugestoes(p, 'eletrica');
  p = comSugestoes(p, 'hidraulica');
  return p;
}

/**
 * Caso completo: parte aceita, parte pendente.
 * Aceitos: pilares + vigas baldrame (estrutura); pontos elétricos da Sala; pontos hidráulicos do Banheiro.
 * Pendentes: vigas superiores, lajes, fundações; elétrica dos demais ambientes; hidráulica da Cozinha.
 */
export function casoExemplo(): Projeto {
  return confirmar(casoTudoPendente(), (e) => {
    if (e.status !== 'pendente') return false;
    if (e.tipo === 'pilar' || e.tipo === 'viga-baldrame') return true;
    if (e.disciplina === 'eletrica') return e.vinculos.ambienteId === 'amb-sala';
    if (e.disciplina === 'hidraulica') return e.vinculos.ambienteId === 'amb-banheiro';
    return false;
  });
}

export function casoTudoConfirmado(): Projeto {
  return confirmar(casoTudoPendente(), () => true);
}
