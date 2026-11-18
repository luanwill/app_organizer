/** Textos exibidos na planta: medidas ao vivo, rótulos de elementos, status da escala. Lógica pura. */
import type { Elemento, Geometria, Ponto, TipoEsquadria } from '@/core/model';
import {
  areaPoligono,
  caixaEnvolvente,
  centroidePoligono,
  comprimentoPolilinha,
  formatarNumero,
  formatarQuantidade,
  paraM2,
  paraMetros,
  pontoEmPoligono,
} from '@/core/calc';
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
    case 'ambiente': {
      // nome + área (m²) quando a página tem escala
      const nome = rotulo ?? (el.props.nome || null);
      const area = rotuloMedida('poligono', el.geometria.tipo === 'poligono' ? el.geometria.pontos : [], ctx.escala);
      if (!area || (nome && nome.includes('m²'))) return { simbolo: '', texto: nome };
      return { simbolo: '', texto: nome ? `${nome}\n${area}` : area };
    }
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

/**
 * Canto superior esquerdo (da etiqueta) do nome do ambiente: junto ao vértice mais próximo do canto
 * superior esquerdo do polígono, deslocado para dentro pela margem (unidades do PDF) — longe do
 * centro, onde costuma ficar o ponto de luz. Se não couber dentro do polígono, usa o centroide.
 */
export function ancoraRotuloAmbiente(pontos: Ponto[], margem: number): Ponto {
  const caixa = caixaEnvolvente(pontos);
  let canto = pontos[0];
  let menor = Infinity;
  for (const p of pontos) {
    const d = p.x - caixa.minX + (p.y - caixa.minY);
    if (d < menor) {
      menor = d;
      canto = p;
    }
  }
  const candidato = { x: canto.x + margem, y: canto.y + margem };
  return pontoEmPoligono(candidato, pontos) ? candidato : centroidePoligono(pontos);
}

/** Rótulo de uma rota derivada: só com a rota sob o mouse ou o elemento associado destacado. */
export function rotuloDerivadoVisivel(
  derivado: { id: string; elementoId?: string },
  sobreId: string | null,
  selecaoIds: string[],
): boolean {
  if (sobreId === derivado.id) return true;
  const alvo = derivado.elementoId;
  return alvo !== undefined && (sobreId === alvo || selecaoIds.includes(alvo));
}

/**
 * Centro da etiqueta do telhado: centralizada no topo do polígono, logo abaixo da borda (na faixa
 * do beiral), para não coincidir com os rótulos de laje/ambiente no centro. Fora do polígono → centroide.
 * `meiaAltura` = metade da altura da etiqueta (unidades do PDF).
 */
export function ancoraRotuloTelhado(pontos: Ponto[], margem: number, meiaAltura: number): Ponto {
  const caixa = caixaEnvolvente(pontos);
  const candidato = { x: (caixa.minX + caixa.maxX) / 2, y: caixa.minY + margem + meiaAltura };
  return pontoEmPoligono(candidato, pontos) ? candidato : centroidePoligono(pontos);
}
