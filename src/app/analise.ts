/**
 * Integração (orquestrador): estado e linha do tempo da apresentação "Analisar planta".
 * A animação é só visual: os elementos já existem no projeto como 'pendente' e nada entra
 * nos totais por causa dela. O viewer e o painel de prévia recebem o estado por props.
 */
import { create } from 'zustand';

export type FaseAnalise =
  | 'varredura'
  | 'paredes'
  | 'ambientes'
  | 'estrutura'
  | 'laje'
  | 'telhado'
  | 'calhas'
  | 'eletrica'
  | 'hidraulica'
  | 'materiais'
  | 'concluida';

export const ORDEM_FASES: FaseAnalise[] = [
  'varredura',
  'paredes',
  'ambientes',
  'estrutura',
  'laje',
  'telhado',
  'calhas',
  'eletrica',
  'hidraulica',
  'materiais',
  'concluida',
];

/** Duração de cada fase (ms). Fases sem elementos são puladas. */
export const DURACAO_FASE_MS: Record<FaseAnalise, number> = {
  varredura: 1600,
  paredes: 1800,
  ambientes: 1600,
  estrutura: 1200,
  laje: 1000,
  telhado: 1200,
  calhas: 900,
  eletrica: 1200,
  hidraulica: 1000,
  materiais: 1800,
  concluida: 0,
};

export const ROTULO_FASE: Record<FaseAnalise, string> = {
  varredura: 'Lendo a planta…',
  paredes: 'Identificando paredes…',
  ambientes: 'Medindo ambientes…',
  estrutura: 'Lançando estrutura…',
  laje: 'Lançando lajes…',
  telhado: 'Montando o telhado…',
  calhas: 'Posicionando calhas e condutores…',
  eletrica: 'Distribuindo pontos elétricos…',
  hidraulica: 'Distribuindo pontos hidráulicos…',
  materiais: 'Levantando materiais…',
  concluida: 'Análise concluída — confira e aceite as sugestões',
};

export interface EstadoAnalise {
  ativa: boolean;
  fase: FaseAnalise;
  /** 0..1 dentro da fase atual. */
  progresso: number;
  pagina: number;
  /** Ids revelados em cada fase, na ordem em que aparecem. */
  porFase: Partial<Record<FaseAnalise, string[]>>;
}

interface StoreAnalise extends EstadoAnalise {
  iniciar(pagina: number, porFase: Partial<Record<FaseAnalise, string[]>>): void;
  pular(): void;
  fechar(): void;
}

const INICIAL: EstadoAnalise = { ativa: false, fase: 'concluida', progresso: 1, pagina: 1, porFase: {} };

let quadro: number | null = null;
const parar = () => {
  if (quadro !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(quadro);
  quadro = null;
};

/** Fases que serão exibidas: varredura e materiais sempre; as demais só se tiverem elementos. */
export function fasesExibidas(porFase: Partial<Record<FaseAnalise, string[]>>): FaseAnalise[] {
  return ORDEM_FASES.filter(
    (f) => f === 'varredura' || f === 'materiais' || f === 'concluida' || (porFase[f]?.length ?? 0) > 0,
  );
}

function reduzirMovimento(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const useAnalise = create<StoreAnalise>((set) => ({
  ...INICIAL,
  iniciar(pagina, porFase) {
    parar();
    const fases = fasesExibidas(porFase);
    if (reduzirMovimento() || typeof requestAnimationFrame !== 'function') {
      set({ ativa: true, fase: 'concluida', progresso: 1, pagina, porFase });
      return;
    }
    const inicio = performance.now();
    const passo = (agora: number) => {
      let t = agora - inicio;
      for (const f of fases) {
        const d = DURACAO_FASE_MS[f];
        if (f === 'concluida' || t < d) {
          set({ fase: f, progresso: f === 'concluida' ? 1 : t / d });
          if (f !== 'concluida') quadro = requestAnimationFrame(passo);
          else quadro = null;
          return;
        }
        t -= d;
      }
    };
    set({ ativa: true, fase: fases[0] ?? 'concluida', progresso: 0, pagina, porFase });
    quadro = requestAnimationFrame(passo);
  },
  pular() {
    parar();
    set({ fase: 'concluida', progresso: 1 });
  },
  fechar() {
    parar();
    set({ ...INICIAL });
  },
}));
