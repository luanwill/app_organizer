/**
 * Sugestão automática de pontos hidráulicos por ambiente (função pura).
 */
import type { Aparelho, Elemento, ElementoDe, Ponto, Projeto, PropsPontoHidraulico } from '@/core/model';
import {
  centroidePoligono,
  escalaValida,
  paraUnidades,
  perimetroPoligono,
  pontoEmPoligono,
  segmentosDaPolilinha,
} from '@/core/calc';
import { APARELHOS_POR_AMBIENTE, LIGACOES_APARELHO, PREFIXO_ID, RECUO_PONTO_M, ROTULO_APARELHO } from './config';

type Ambiente = ElementoDe<'ambiente'>;

/** Ambientes (com polígono) de uma página. */
export function ambientesDaPagina(projeto: Projeto, pagina: number): Ambiente[] {
  return projeto.elementos.filter(
    (e): e is Ambiente => e.tipo === 'ambiente' && e.pagina === pagina && e.geometria.tipo === 'poligono',
  );
}

/** Aparelhos sugeridos para o ambiente ([] se o tipo não recebe pontos hidráulicos). */
export function aparelhosDoAmbiente(ambiente: Ambiente): Aparelho[] {
  return APARELHOS_POR_AMBIENTE[ambiente.props.tipoAmbiente] ?? [];
}

/** Props padrão de um ponto: ligações da tabela; diâmetros ficam undefined (vêm dos parâmetros). */
export function propsPadraoPonto(aparelho: Aparelho, ambienteComAguaQuente: boolean): PropsPontoHidraulico {
  const ligacoes = LIGACOES_APARELHO[aparelho];
  return {
    aparelho,
    aguaFria: ligacoes.aguaFria,
    aguaQuente: ligacoes.aceitaAguaQuente && ambienteComAguaQuente,
    esgoto: ligacoes.esgoto,
  };
}

/**
 * `quantidade` posições distribuídas ao longo do perímetro do polígono (nos meios de trechos
 * iguais), recuadas `recuo` unidades para dentro. Se o recuo não couber, usa o centroide.
 */
export function posicoesNoPerimetro(poligono: Ponto[], quantidade: number, recuo: number): Ponto[] {
  const centro = centroidePoligono(poligono);
  const perimetro = perimetroPoligono(poligono);
  const segmentos = segmentosDaPolilinha(poligono, true);
  const posicoes: Ponto[] = [];
  for (let i = 0; i < quantidade; i++) {
    let restante = ((i + 0.5) / quantidade) * perimetro;
    let posicao = centro;
    for (const { a, b } of segmentos) {
      const comprimento = Math.hypot(b.x - a.x, b.y - a.y);
      if (restante > comprimento || comprimento === 0) {
        restante -= comprimento;
        continue;
      }
      // afasta dos cantos: o ponto fica a pelo menos `recuo` das duas paredes do canto
      const aoLongo = comprimento > 2 * recuo ? Math.min(Math.max(restante, recuo), comprimento - recuo) : comprimento / 2;
      const t = aoLongo / comprimento;
      const base = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const normal = { x: -(b.y - a.y) / comprimento, y: (b.x - a.x) / comprimento };
      const candidatos = [1, -1].map((s) => ({ x: base.x + s * normal.x * recuo, y: base.y + s * normal.y * recuo }));
      posicao = candidatos.find((c) => pontoEmPoligono(c, poligono)) ?? centro;
      break;
    }
    posicoes.push(posicao);
  }
  return posicoes;
}

/**
 * Pontos sugeridos para um ambiente: aparelhos da tabela distribuídos pelo perímetro (recuados
 * para dentro) e o ralo no centro. Ids determinísticos (função pura).
 */
export function sugerirPontosDoAmbiente(ambiente: Ambiente, escala: number): ElementoDe<'ponto-hidraulico'>[] {
  if (ambiente.geometria.tipo !== 'poligono') return [];
  const poligono = ambiente.geometria.pontos;
  const aparelhos = aparelhosDoAmbiente(ambiente);
  const noPerimetro = aparelhos.filter((a) => a !== 'ralo');
  const posicoes = posicoesNoPerimetro(poligono, noPerimetro.length, paraUnidades(RECUO_PONTO_M, escala));
  const centro = centroidePoligono(poligono);
  return aparelhos.map((aparelho) => ({
    id: `${PREFIXO_ID}-sug:${ambiente.id}:${aparelho}`,
    tipo: 'ponto-hidraulico',
    disciplina: 'hidraulica',
    pagina: ambiente.pagina,
    geometria: { tipo: 'ponto', ponto: aparelho === 'ralo' ? centro : posicoes[noPerimetro.indexOf(aparelho)] ?? centro },
    vinculos: { ambienteId: ambiente.id },
    origem: 'sugerido-auto',
    status: 'pendente',
    rotulo: ROTULO_APARELHO[aparelho],
    props: propsPadraoPonto(aparelho, ambiente.props.aguaQuente === true),
  }));
}

/**
 * Sugestões da página: pontos para banheiros, cozinhas e áreas de serviço. Página sem escala → [].
 * Ambientes que já possuem pontos hidráulicos CONFIRMADOS não recebem sugestão.
 */
export function sugerirHidraulica(projeto: Projeto, pagina: number): Elemento[] {
  const escala = projeto.paginas[pagina]?.escala;
  if (!escalaValida(escala)) return [];
  const comConfirmados = new Set<string>();
  for (const e of projeto.elementos) {
    if (e.tipo === 'ponto-hidraulico' && e.status === 'confirmado' && e.vinculos.ambienteId) {
      comConfirmados.add(e.vinculos.ambienteId);
    }
  }
  return ambientesDaPagina(projeto, pagina)
    .filter((a) => !comConfirmados.has(a.id))
    .flatMap((a) => sugerirPontosDoAmbiente(a, escala));
}
