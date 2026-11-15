/** Elétrica — agrupamento automático de circuitos. Funções puras, sem React. */
import type { ParametrosEletrica, Projeto, Status, TipoTUE } from '@/core/model';
import type { TipoCircuito } from './config';
import {
  type PontoEletrico,
  correnteA,
  disjuntorComercialA,
  ehAmbiente,
  ehPontoEletrico,
  escalaDaPagina,
  secaoDoPonto,
  tipoCircuitoDoPonto,
} from './regras';

export interface Circuito {
  /** Id estável: página, status, tipo e ordem dentro do tipo. */
  id: string;
  /** Numeração sequencial (C1…Cn): confirmados primeiro, depois os pendentes. */
  numero: number;
  rotulo: string;
  pagina: number;
  tipo: TipoCircuito;
  /** Equipamento (circuitos de TUE). */
  tue?: TipoTUE;
  /** 'confirmado' = formado por pontos confirmados; 'pendente' = por sugestões ainda não aceitas. */
  status: Status;
  /** Pontos que somam carga (luz, TUG ou TUE). */
  pontoIds: string[];
  /** Interruptores atendidos (circuitos de iluminação) — não somam carga. */
  interruptorIds: string[];
  va: number;
  /** Seção dos condutores (mm²); null se TUE sem equipamento informado. */
  secaoMm2: number | null;
  correnteA: number;
  /** Disjuntor comercial (A); null se a corrente excede a tabela. */
  disjuntorA: number | null;
}

export type GrupoCircuito = Pick<Circuito, 'tipo' | 'tue' | 'pontoIds' | 'interruptorIds' | 'va' | 'secaoMm2'>;

/** Ponto com carga válida (interruptores não somam carga; potência inválida fica fora dos circuitos). */
export function somaCarga(ponto: PontoEletrico): boolean {
  const va = ponto.props.potenciaVA;
  return ponto.props.tipoPonto !== 'interruptor' && Number.isFinite(va) && va >= 0;
}

/**
 * Agrupa os pontos em circuitos: iluminação separada de TUG (ambos respeitando o limite de VA,
 * por ambiente em ordem estável; um ponto sozinho acima do limite fica em circuito próprio) e
 * 1 circuito por TUE. Interruptores entram no circuito de iluminação do seu ambiente.
 * `ordemAmbientes`: ids dos ambientes na ordem do projeto (pontos sem ambiente vão por último).
 */
export function agruparCircuitos(
  pontos: PontoEletrico[],
  parametros: ParametrosEletrica,
  ordemAmbientes: string[] = [],
): GrupoCircuito[] {
  const posicao = (p: PontoEletrico): number => {
    const i = p.vinculos.ambienteId ? ordemAmbientes.indexOf(p.vinculos.ambienteId) : -1;
    return i < 0 ? ordemAmbientes.length : i;
  };
  // Array.prototype.sort é estável: dentro do ambiente vale a ordem do projeto.
  const ordenados = [...pontos].sort((a, b) => posicao(a) - posicao(b));
  const comCarga = ordenados.filter(somaCarga);
  const limite = parametros.limiteVAPorCircuito;

  const porLimite = (tipo: 'iluminacao' | 'tug'): GrupoCircuito[] => {
    const grupos: GrupoCircuito[] = [];
    let atual: GrupoCircuito | null = null;
    for (const ponto of comCarga) {
      if (tipoCircuitoDoPonto(ponto) !== tipo) continue;
      if (atual === null || atual.va + ponto.props.potenciaVA > limite) {
        atual = { tipo, pontoIds: [], interruptorIds: [], va: 0, secaoMm2: parametros.secoes[tipo] };
        grupos.push(atual);
      }
      atual.pontoIds.push(ponto.id);
      atual.va += ponto.props.potenciaVA;
    }
    return grupos;
  };

  const iluminacao = porLimite('iluminacao');
  const tug = porLimite('tug');
  const tue = comCarga
    .filter((p) => tipoCircuitoDoPonto(p) === 'tue')
    .map<GrupoCircuito>((p) => ({
      tipo: 'tue',
      tue: p.props.tue,
      pontoIds: [p.id],
      interruptorIds: [],
      va: p.props.potenciaVA,
      secaoMm2: secaoDoPonto(p, parametros),
    }));

  // Interruptores: circuito de iluminação do mesmo ambiente; sem luz no ambiente → 1º de iluminação.
  const ambienteDoPonto = new Map(ordenados.map((p) => [p.id, p.vinculos.ambienteId]));
  for (const interruptor of ordenados) {
    if (interruptor.props.tipoPonto !== 'interruptor') continue;
    const ambienteId = interruptor.vinculos.ambienteId;
    const doAmbiente = ambienteId
      ? iluminacao.find((g) => g.pontoIds.some((id) => ambienteDoPonto.get(id) === ambienteId))
      : undefined;
    (doAmbiente ?? iluminacao[0])?.interruptorIds.push(interruptor.id);
  }

  return [...iluminacao, ...tug, ...tue];
}

/**
 * Circuitos do projeto, por página (cada página tem o seu quadro). Pontos confirmados e pendentes
 * são agrupados SEPARADAMENTE: sugestões pendentes nunca alteram os circuitos confirmados.
 * Páginas sem escala ficam de fora (nenhuma linha sai delas).
 */
export function calcularCircuitos(projeto: Projeto): Circuito[] {
  const parametros = projeto.parametros.eletrica;
  const ordemAmbientes = projeto.elementos.filter(ehAmbiente).map((a) => a.id);
  const pontos = projeto.elementos.filter(ehPontoEletrico).filter((p) => escalaDaPagina(projeto, p.pagina) !== null);
  const paginas = [...new Set(pontos.map((p) => p.pagina))].sort((a, b) => a - b);
  const circuitos: Circuito[] = [];
  for (const status of ['confirmado', 'pendente'] as const) {
    for (const pagina of paginas) {
      const doGrupo = pontos.filter((p) => p.pagina === pagina && p.status === status);
      const ordemPorTipo: Record<TipoCircuito, number> = { iluminacao: 0, tug: 0, tue: 0 };
      for (const grupo of agruparCircuitos(doGrupo, parametros, ordemAmbientes)) {
        const numero = circuitos.length + 1;
        const corrente = correnteA(grupo.va, parametros.tensao);
        circuitos.push({
          ...grupo,
          id: `circuito:${pagina}:${status}:${grupo.tipo}:${++ordemPorTipo[grupo.tipo]}`,
          numero,
          rotulo: `C${numero}`,
          pagina,
          status,
          correnteA: corrente,
          disjuntorA: disjuntorComercialA(corrente),
        });
      }
    }
  }
  return circuitos;
}
