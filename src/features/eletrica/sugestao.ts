/** Elétrica — sugestão automática de pontos por ambiente (NBR 5410). Funções puras, sem React. */
import type { Elemento, Ponto, PropsPontoEletrico, Projeto, TipoTUE } from '@/core/model';
import {
  centroidePoligono,
  distancia,
  distanciaPontoPoligono,
  paraMetros,
  paraUnidades,
  pontoEmPoligono,
  projetarNaPolilinha,
} from '@/core/calc';
import {
  AFASTAMENTO_LAVATORIO_M,
  ALTURA_TUE,
  ALTURA_TUG_POR_AMBIENTE,
  ALTURA_TUG_PADRAO,
  DISTANCIA_MINIMA_PONTOS_M,
  FOLGA_INTERRUPTOR_M,
  PASSO_BUSCA_POSICAO_M,
  POTENCIA_INTERRUPTOR_VA,
  PREFIXO_ID_SUGESTAO,
  RECUO_PAREDE_M,
  TENTATIVAS_POSICAO_LIVRE,
  TOLERANCIA_PORTA_M,
} from './config';
import {
  type Ambiente,
  type PontoEletrico,
  ehAmbiente,
  ehPontoEletrico,
  escalaDaPagina,
  posicaoDe,
  resumoAmbiente,
  verticesDe,
} from './regras';

// ---------------------------------------------------------------- geometria do perímetro

/** Comprimento de cada lado do polígono fechado (lado i: vértice i → i+1). */
function ladosDoPoligono(poligono: Ponto[]): number[] {
  return poligono.map((p, i) => distancia(p, poligono[(i + 1) % poligono.length]!));
}

/**
 * Ponto a `s` unidades do 1º vértice, medido ao longo do perímetro, recuado `recuo` unidades
 * para dentro do polígono (e afastado dos cantos pelo mesmo recuo).
 */
export function pontoNoPerimetro(poligono: Ponto[], s: number, recuo: number): Ponto {
  const lados = ladosDoPoligono(poligono);
  const total = lados.reduce((soma, l) => soma + l, 0);
  if (!(total > 0)) return centroidePoligono(poligono);
  let resto = ((s % total) + total) % total;
  let indice = 0;
  while (indice < lados.length - 1 && (resto > lados[indice]! || lados[indice] === 0)) {
    resto -= lados[indice]!;
    indice++;
  }
  const lado = lados[indice]!;
  const a = poligono[indice]!;
  const b = poligono[(indice + 1) % poligono.length]!;
  if (!(lado > 0)) return { x: a.x, y: a.y };
  const aoLongo = lado > 2 * recuo ? Math.min(Math.max(resto, recuo), lado - recuo) : lado / 2;
  const ux = (b.x - a.x) / lado;
  const uy = (b.y - a.y) / lado;
  const base = { x: a.x + ux * aoLongo, y: a.y + uy * aoLongo };
  const candidato = { x: base.x - uy * recuo, y: base.y + ux * recuo };
  if (pontoEmPoligono(candidato, poligono)) return candidato;
  return { x: base.x + uy * recuo, y: base.y - ux * recuo };
}

interface PosicaoPerimetro {
  /** Distância ao longo do perímetro desde o 1º vértice. */
  s: number;
  /** Distância ao longo do lado onde o ponto se projeta. */
  noLado: number;
  /** Comprimento desse lado. */
  lado: number;
}

/** Projeta um ponto no perímetro do polígono. */
function posicaoNoPerimetro(p: Ponto, poligono: Ponto[]): PosicaoPerimetro {
  const lados = ladosDoPoligono(poligono);
  const projecao = projetarNaPolilinha(p, poligono, true);
  const indice = Math.min(Math.max(projecao.indiceSegmento, 0), lados.length - 1);
  const lado = lados[indice]!;
  const antes = lados.slice(0, indice).reduce((soma, l) => soma + l, 0);
  return { s: antes + projecao.t * lado, noLado: projecao.t * lado, lado };
}

const menorDistancia = (p: Ponto, ocupados: Ponto[]): number =>
  ocupados.reduce((menor, o) => Math.min(menor, distancia(p, o)), Infinity);

/** Posição em `s` ou, se sobrepuser um ponto existente, a mais próxima livre ao longo do perímetro. */
function posicaoLivreProxima(poligono: Ponto[], s: number, recuo: number, minima: number, ocupados: Ponto[]): Ponto {
  const inicial = pontoNoPerimetro(poligono, s, recuo);
  if (menorDistancia(inicial, ocupados) >= minima) return inicial;
  for (let i = 1; i <= TENTATIVAS_POSICAO_LIVRE; i++) {
    for (const sentido of [1, -1]) {
      const candidato = pontoNoPerimetro(poligono, s + sentido * i * minima, recuo);
      if (menorDistancia(candidato, ocupados) >= minima) return candidato;
    }
  }
  return inicial;
}

/** Posição de parede mais afastada dos pontos já ocupados (varre o perímetro em passos fixos). */
function posicaoMaisLivre(poligono: Ponto[], recuo: number, passo: number, ocupados: Ponto[]): Ponto {
  const total = ladosDoPoligono(poligono).reduce((soma, l) => soma + l, 0);
  let melhor = pontoNoPerimetro(poligono, total / 2, recuo);
  let melhorDistancia = menorDistancia(melhor, ocupados);
  if (!(passo > 0)) return melhor;
  for (let s = passo; s < total; s += passo) {
    const candidato = pontoNoPerimetro(poligono, s, recuo);
    const d = menorDistancia(candidato, ocupados);
    if (d > melhorDistancia) {
      melhor = candidato;
      melhorDistancia = d;
    }
  }
  return melhor;
}

// ---------------------------------------------------------------- sugestão

function novoPontoSugerido(
  id: string,
  ambiente: Ambiente,
  ponto: Ponto,
  props: PropsPontoEletrico,
): PontoEletrico {
  return {
    id,
    tipo: 'ponto-eletrico',
    disciplina: 'eletrica',
    pagina: ambiente.pagina,
    geometria: { tipo: 'ponto', ponto },
    vinculos: { ambienteId: ambiente.id },
    origem: 'sugerido-auto',
    status: 'pendente',
    props,
  };
}

/**
 * Sugestões de um ambiente: 1 ponto de luz no centro (carga mínima), TUGs no perímetro,
 * 1 TUE por equipamento selecionado e 1 interruptor por porta de acesso.
 * `escala` em m por unidade do PDF. Os ids são determinísticos (prefixo + ambiente + papel).
 */
export function sugerirAmbiente(projeto: Projeto, ambiente: Ambiente, escala: number): PontoEletrico[] {
  const poligono = verticesDe(ambiente);
  if (poligono.length < 3) return [];
  const parametros = projeto.parametros.eletrica;
  const resumo = resumoAmbiente(ambiente, escala);
  const recuo = paraUnidades(RECUO_PAREDE_M, escala);
  const minima = paraUnidades(DISTANCIA_MINIMA_PONTOS_M, escala);
  const prefixo = `${PREFIXO_ID_SUGESTAO}:${ambiente.id}`;
  const sugestoes: PontoEletrico[] = [];
  const ocupados: Ponto[] = [];
  const adicionar = (id: string, ponto: Ponto, props: PropsPontoEletrico) => {
    sugestoes.push(novoPontoSugerido(id, ambiente, ponto, props));
    ocupados.push(ponto);
  };

  // Iluminação: 1 ponto no teto, no centro, com a carga mínima do ambiente.
  adicionar(`${prefixo}:luz`, centroidePoligono(poligono), {
    tipoPonto: 'luz',
    potenciaVA: resumo.iluminacaoVA,
    altura: 'teto',
  });

  // Interruptores: 1 por porta de acesso, ao lado da porta.
  for (const esquadria of projeto.elementos) {
    if (esquadria.tipo !== 'esquadria' || esquadria.pagina !== ambiente.pagina) continue;
    const tipo = projeto.esquadrias.find((t) => t.id === esquadria.props.tipoEsquadriaId);
    const centro = posicaoDe(esquadria);
    if (!tipo || tipo.categoria !== 'porta' || !centro) continue;
    if (paraMetros(distanciaPontoPoligono(centro, poligono), escala) > TOLERANCIA_PORTA_M) continue;
    const posicao = posicaoNoPerimetro(centro, poligono);
    const deslocamento = paraUnidades(tipo.largura / 2 + FOLGA_INTERRUPTOR_M, escala);
    const cabeDepois = posicao.noLado + deslocamento <= posicao.lado - recuo;
    const cabeAntes = posicao.noLado - deslocamento >= recuo;
    const s = !cabeDepois && cabeAntes ? posicao.s - deslocamento : posicao.s + deslocamento;
    adicionar(`${prefixo}:interruptor:${esquadria.id}`, pontoNoPerimetro(poligono, s, recuo), {
      tipoPonto: 'interruptor',
      potenciaVA: POTENCIA_INTERRUPTOR_VA,
      altura: 'interruptor',
    });
  }

  // TUGs: igualmente espaçadas no perímetro (banheiro: junto ao lavatório, se houver).
  const perimetro = paraUnidades(resumo.perimetroM, escala);
  const propsTUG: PropsPontoEletrico = {
    tipoPonto: 'tug',
    potenciaVA: parametros.potenciaTUG,
    altura: ALTURA_TUG_POR_AMBIENTE[ambiente.props.tipoAmbiente] ?? ALTURA_TUG_PADRAO,
  };
  const lavatorio =
    ambiente.props.tipoAmbiente === 'banheiro'
      ? projeto.elementos.find(
          (el) =>
            el.tipo === 'ponto-hidraulico' &&
            el.props.aparelho === 'lavatorio' &&
            el.pagina === ambiente.pagina &&
            (el.vinculos.ambienteId === ambiente.id ||
              (el.geometria.tipo === 'ponto' && pontoEmPoligono(el.geometria.ponto, poligono))),
        )
      : undefined;
  const centroLavatorio = lavatorio ? posicaoDe(lavatorio) : null;
  for (let i = 0; i < resumo.tugs; i++) {
    const s =
      centroLavatorio && i === 0
        ? posicaoNoPerimetro(centroLavatorio, poligono).s + paraUnidades(AFASTAMENTO_LAVATORIO_M, escala)
        : ((i + 0.5) * perimetro) / resumo.tugs;
    adicionar(`${prefixo}:tug:${i + 1}`, posicaoLivreProxima(poligono, s, recuo, minima, ocupados), propsTUG);
  }

  // TUEs: 1 por equipamento selecionado no ambiente, na parede, sem sobrepor outros pontos.
  const tues: TipoTUE[] = [...new Set(ambiente.props.tues ?? [])];
  const passo = paraUnidades(PASSO_BUSCA_POSICAO_M, escala);
  for (const tue of tues) {
    adicionar(`${prefixo}:tue:${tue}`, posicaoMaisLivre(poligono, recuo, passo, ocupados), {
      tipoPonto: 'tue',
      potenciaVA: parametros.potenciaTUE[tue],
      altura: ALTURA_TUE[tue],
      tue,
    });
  }

  return sugestoes;
}

/**
 * Sugestões da página (todas 'sugerido-auto' / 'pendente'). Página sem escala → [].
 * Ambientes que já possuem pontos elétricos confirmados são respeitados (nada é sugerido para eles).
 */
export function sugerirEletrica(projeto: Projeto, pagina: number): Elemento[] {
  const escala = escalaDaPagina(projeto, pagina);
  if (escala === null) return [];
  const comConfirmados = new Set<string>();
  // Ids que continuarão no projeto depois de store.substituirSugestoes (não podem ser repetidos).
  const idsMantidos = new Set<string>();
  for (const el of projeto.elementos) {
    const seraSubstituido =
      el.disciplina === 'eletrica' && el.origem === 'sugerido-auto' && el.status === 'pendente' && el.pagina === pagina;
    if (!seraSubstituido) idsMantidos.add(el.id);
    if (ehPontoEletrico(el) && el.status === 'confirmado' && el.vinculos.ambienteId) {
      comConfirmados.add(el.vinculos.ambienteId);
    }
  }
  const sugestoes: Elemento[] = [];
  for (const ambiente of projeto.elementos) {
    if (!ehAmbiente(ambiente) || ambiente.pagina !== pagina || comConfirmados.has(ambiente.id)) continue;
    for (const sugestao of sugerirAmbiente(projeto, ambiente, escala)) {
      let id = sugestao.id;
      for (let n = 2; idsMantidos.has(id); n++) id = `${sugestao.id}~${n}`;
      idsMantidos.add(id);
      sugestoes.push({ ...sugestao, id });
    }
  }
  return sugestoes;
}
