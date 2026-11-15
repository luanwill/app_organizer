/** Textos exibidos na planta: medidas ao vivo, rótulos de elementos, status da escala. Lógica pura. */
import type { Elemento, Geometria, Ponto, TipoEsquadria } from '@/core/model';
import { areaPoligono, comprimentoPolilinha, formatarNumero, formatarQuantidade, paraM2, paraMetros } from '@/core/calc';
import { CASAS_ESCALA, CASAS_MEDIDA, ESTILO_TIPO, LETRA_PONTO_ELETRICO } from './config';

/**
 * Medida formatada em pt-BR: comprimento (m) para polilinha, área (m²) para polígono.
 * null sem escala (nunca se assume escala) ou com pontos insuficientes.
 */
export function rotuloMedida(tipo: Geometria['tipo'] | null, pontos: Ponto[], escala: number | null): string | null {
  if (escala === null || !(escala > 0)) return null;
  if (tipo === 'polilinha' && pontos.length >= 2) {
    return formatarQuantidade(paraMetros(comprimentoPolilinha(pontos), escala), 'm', CASAS_MEDIDA);
  }
  if (tipo === 'poligono' && pontos.length >= 3) {
    return formatarQuantidade(paraM2(areaPoligono(pontos), escala), 'm²', CASAS_MEDIDA);
  }
  return null;
}

/** Numeração (1, 2, 3…) dos marcadores de contagem, na ordem em que foram criados. */
export function numerosContagem(elementos: Elemento[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const el of elementos) {
    if (el.tipo === 'medicao' && el.geometria.tipo === 'ponto') mapa.set(el.id, mapa.size + 1);
  }
  return mapa;
}

export interface ContextoRotulo {
  escala: number | null;
  esquadrias: TipoEsquadria[];
  contagens: Map<string, number>;
}

export interface RotuloElemento {
  /** Letra/número dentro do símbolo (geometria de ponto). */
  simbolo: string;
  /** Etiqueta ao lado/no centro do elemento. */
  texto: string | null;
}

export function rotuloDoElemento(el: Elemento, ctx: ContextoRotulo): RotuloElemento {
  const rotulo = el.rotulo ?? null;
  switch (el.tipo) {
    case 'ambiente':
      return { simbolo: '', texto: rotulo ?? (el.props.nome || null) };
    case 'medicao': {
      if (el.geometria.tipo === 'ponto') {
        return { simbolo: String(ctx.contagens.get(el.id) ?? ''), texto: el.props.descricao || rotulo };
      }
      return { simbolo: '', texto: rotuloMedida(el.geometria.tipo, el.geometria.pontos, ctx.escala) };
    }
    case 'esquadria': {
      const tipo = ctx.esquadrias.find((t) => t.id === el.props.tipoEsquadriaId);
      return { simbolo: '', texto: tipo?.codigo ?? rotulo ?? '?' };
    }
    case 'ponto-eletrico':
      return { simbolo: LETRA_PONTO_ELETRICO[el.props.tipoPonto], texto: rotulo };
    default:
      return { simbolo: ESTILO_TIPO[el.tipo].letra, texto: rotulo };
  }
}

/** "Página sem escala" ou "Escala: 1 un = 0,0200 m". */
export function textoEscala(escala: number | null): string {
  if (escala === null || !(escala > 0)) return 'Página sem escala';
  return `Escala: 1 un = ${formatarNumero(escala, CASAS_ESCALA)} m`;
}
