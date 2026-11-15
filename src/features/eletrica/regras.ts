/** Elétrica — regras normativas (NBR 5410) e utilitários puros compartilhados. Sem React. */
import type {
  AlturaPonto,
  Elemento,
  ElementoDe,
  ParametrosEletrica,
  Ponto,
  Projeto,
  TipoAmbiente,
} from '@/core/model';
import { areaPoligono, arredondar, escalaValida, paraM2, paraMetros, perimetroPoligono } from '@/core/calc';
import {
  CASAS_DEGRAU_NORMA,
  DISJUNTORES_COMERCIAIS_A,
  ILUMINACAO,
  REGRA_TUG,
  type TipoCircuito,
} from './config';

export type PontoEletrico = ElementoDe<'ponto-eletrico'>;
export type Ambiente = ElementoDe<'ambiente'>;

export const ehPontoEletrico = (el: Elemento): el is PontoEletrico => el.tipo === 'ponto-eletrico';
export const ehAmbiente = (el: Elemento): el is Ambiente => el.tipo === 'ambiente';

/** Posição de um elemento de geometria 'ponto' (null para outras geometrias). */
export function posicaoDe(el: Elemento): Ponto | null {
  return el.geometria.tipo === 'ponto' ? el.geometria.ponto : null;
}

/** Vértices de um elemento de polilinha/polígono ([] para ponto). */
export function verticesDe(el: Elemento): Ponto[] {
  return el.geometria.tipo === 'ponto' ? [] : el.geometria.pontos;
}

/** Escala (m por unidade) da página, ou null se não calibrada. */
export function escalaDaPagina(projeto: Projeto, pagina: number): number | null {
  const escala = projeto.paginas[pagina]?.escala;
  return escalaValida(escala) ? escala : null;
}

/** Carga mínima de iluminação (VA): 100 VA até 6 m² + 60 VA a cada 4 m² inteiros acima disso. */
export function cargaIluminacaoVA(areaM2: number): number {
  const area = arredondar(areaM2, CASAS_DEGRAU_NORMA);
  const excedente = Math.max(0, area - ILUMINACAO.areaBaseM2);
  const incrementos = Math.floor(arredondar(excedente / ILUMINACAO.areaIncrementoM2, CASAS_DEGRAU_NORMA));
  return ILUMINACAO.cargaBaseVA + incrementos * ILUMINACAO.cargaIncrementoVA;
}

/** Nº mínimo de TUGs do ambiente conforme tipo, área (m²) e perímetro (m). */
export function quantidadeTUGs(tipo: TipoAmbiente, areaM2: number, perimetroM: number): number {
  const regra = REGRA_TUG[tipo];
  const porPerimetro = (passoM: number) =>
    Math.max(1, Math.ceil(arredondar(perimetroM / passoM, CASAS_DEGRAU_NORMA)));
  switch (regra.modo) {
    case 'fixo':
      return regra.quantidade;
    case 'perimetro':
      return porPerimetro(regra.passoM);
    case 'area-ou-perimetro':
      return arredondar(areaM2, CASAS_DEGRAU_NORMA) <= regra.areaLimiteM2
        ? regra.quantidadeMinima
        : porPerimetro(regra.passoM);
  }
}

export interface ResumoAmbiente {
  ambienteId: string;
  nome: string;
  tipoAmbiente: TipoAmbiente;
  areaM2: number;
  perimetroM: number;
  /** Carga mínima de iluminação (VA) pela norma. */
  iluminacaoVA: number;
  /** Nº mínimo de TUGs pela norma. */
  tugs: number;
}

export function resumoAmbiente(ambiente: Ambiente, escala: number): ResumoAmbiente {
  const pontos = verticesDe(ambiente);
  const areaM2 = paraM2(areaPoligono(pontos), escala);
  const perimetroM = paraMetros(perimetroPoligono(pontos), escala);
  return {
    ambienteId: ambiente.id,
    nome: ambiente.props.nome,
    tipoAmbiente: ambiente.props.tipoAmbiente,
    areaM2,
    perimetroM,
    iluminacaoVA: cargaIluminacaoVA(areaM2),
    tugs: quantidadeTUGs(ambiente.props.tipoAmbiente, areaM2, perimetroM),
  };
}

/** Resumo (área, perímetro, VA de iluminação, nº de TUGs) dos ambientes da página; [] sem escala. */
export function resumoAmbientes(projeto: Projeto, pagina: number): ResumoAmbiente[] {
  const escala = escalaDaPagina(projeto, pagina);
  if (escala === null) return [];
  return projeto.elementos
    .filter(ehAmbiente)
    .filter((a) => a.pagina === pagina && verticesDe(a).length >= 3)
    .map((a) => resumoAmbiente(a, escala));
}

/** Tipo de circuito ao qual o ponto pertence (interruptor → iluminação). */
export function tipoCircuitoDoPonto(ponto: PontoEletrico): TipoCircuito {
  const tipo = ponto.props.tipoPonto;
  if (tipo === 'tug') return 'tug';
  if (tipo === 'tue') return 'tue';
  return 'iluminacao';
}

/** Seção (mm²) dos condutores do ponto; null se for TUE sem equipamento informado. */
export function secaoDoPonto(ponto: PontoEletrico, parametros: ParametrosEletrica): number | null {
  const tipo = tipoCircuitoDoPonto(ponto);
  if (tipo !== 'tue') return parametros.secoes[tipo];
  return ponto.props.tue ? parametros.secoes.tue[ponto.props.tue] : null;
}

/** Altura de instalação (m) do ponto; 'teto' → null (sem trecho vertical). */
export function alturaInstalacaoM(altura: AlturaPonto, parametros: ParametrosEletrica): number | null {
  return altura === 'teto' ? null : parametros.alturas[altura];
}

/** Trecho vertical (m) do eletroduto que corre pelo teto até a altura do ponto. */
export function trechoVerticalM(peDireito: number, alturaM: number | null): number {
  return alturaM === null ? 0 : Math.max(0, peDireito - alturaM);
}

/** Corrente de projeto (A) = VA / tensão. */
export function correnteA(va: number, tensao: number): number {
  return va / tensao;
}

/** Menor disjuntor comercial (A) que atende a corrente; null se nenhum da tabela atende. */
export function disjuntorComercialA(corrente: number): number | null {
  if (!Number.isFinite(corrente) || corrente < 0) return null;
  return DISJUNTORES_COMERCIAIS_A.find((nominal) => nominal >= corrente) ?? null;
}

/** Pé-direito (m) válido para um elemento: o do seu ambiente ou o geral; null se não informado. */
export function peDireitoDe(projeto: Projeto, ambienteId: string | undefined): number | null {
  const ambiente = ambienteId
    ? projeto.elementos.find((el): el is Ambiente => el.tipo === 'ambiente' && el.id === ambienteId)
    : undefined;
  const valor = ambiente?.props.peDireito ?? projeto.parametros.gerais.peDireito;
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0 ? valor : null;
}
