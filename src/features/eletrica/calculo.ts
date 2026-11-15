/** Elétrica — quantitativos (pontos, caixas, circuitos, eletrodutos e fios). Função pura, sem React. */
import type {
  Alerta,
  ElementoDe,
  GeometriaDerivada,
  LinhaQuantitativo,
  Ponto,
  Projeto,
  ResultadoDisciplina,
  Status,
} from '@/core/model';
import { comprimentoPolilinha, distancia, paraMetros, rotaOrtogonal } from '@/core/calc';
import {
  ALTURA_QUADRO_M,
  CAIXA_POR_TIPO,
  GRUPOS,
  MENSAGEM_SEM_QUADRO,
  QUANTIDADE_DPS,
  QUANTIDADE_DR,
  ROTULO_TIPO_PONTO,
  ROTULO_TUE,
  TEXTO_TUE_NAO_INFORMADA,
  TOLERANCIA_ROTA_M,
} from './config';
import { type Circuito, calcularCircuitos, somaCarga } from './circuitos';
import {
  type PontoEletrico,
  alturaInstalacaoM,
  ehPontoEletrico,
  escalaDaPagina,
  peDireitoDe,
  posicaoDe,
  secaoDoPonto,
  tipoCircuitoDoPonto,
  trechoVerticalM,
  verticesDe,
} from './regras';

type Quadro = ElementoDe<'quadro'>;
type Eletroduto = ElementoDe<'eletroduto'>;

type BaseLinha = Pick<LinhaQuantitativo, 'grupo' | 'descricao' | 'unidade'> &
  Partial<Pick<LinhaQuantitativo, 'ehMaterial' | 'detalhe'>>;

/** Acumula linhas por chave estável; cada chave vira até 2 linhas (confirmado / pendente). */
class Acumulador {
  private readonly linhas = new Map<string, LinhaQuantitativo>();

  somar(chave: string, status: Status, base: BaseLinha, quantidade: number, elementoIds: string[]): void {
    const id = `eletrica:${chave}:${status}`;
    let linha = this.linhas.get(id);
    if (!linha) {
      linha = { id, disciplina: 'eletrica', ...base, quantidade: 0, status, elementoIds: [] };
      this.linhas.set(id, linha);
    }
    linha.quantidade += quantidade;
    for (const elementoId of elementoIds) {
      if (!linha.elementoIds.includes(elementoId)) linha.elementoIds.push(elementoId);
    }
  }

  listar(): LinhaQuantitativo[] {
    return [...this.linhas.values()];
  }
}

class Alertas {
  private readonly vistos = new Set<string>();
  readonly lista: Alerta[] = [];

  adicionar(campo: string, mensagem: string, elementoId?: string): void {
    const chave = `${campo}|${elementoId ?? ''}|${mensagem}`;
    if (this.vistos.has(chave)) return;
    this.vistos.add(chave);
    this.lista.push({ disciplina: 'eletrica', campo, mensagem, ...(elementoId ? { elementoId } : {}) });
  }
}

const ambos = (a: Status, b: Status): Status => (a === 'confirmado' && b === 'confirmado' ? 'confirmado' : 'pendente');

/** Quadro da página: o primeiro confirmado ou, na falta, o primeiro pendente. */
function quadroDaPagina(projeto: Projeto, pagina: number): { quadro: Quadro; posicao: Ponto } | null {
  const quadros = projeto.elementos.filter(
    (el): el is Quadro => el.tipo === 'quadro' && el.pagina === pagina && el.geometria.tipo === 'ponto',
  );
  const quadro = quadros.find((q) => q.status === 'confirmado') ?? quadros[0];
  const posicao = quadro ? posicaoDe(quadro) : null;
  return quadro && posicao ? { quadro, posicao } : null;
}

/**
 * Rotas redesenhadas pelo usuário, por id do ponto atendido. Uma rota atende o ponto indicado em
 * vinculos.alvoId ou, na falta, o ponto mais próximo da sua extremidade final (depois da inicial)
 * dentro da tolerância. Rotas sem ponto geram alerta e não entram nos quantitativos.
 */
function rotasRedesenhadas(
  projeto: Projeto,
  pagina: number,
  escala: number,
  pontos: PontoEletrico[],
  alertas: Alertas,
): Map<string, Eletroduto[]> {
  const porPonto = new Map<string, Eletroduto[]>();
  const maisProximo = (extremidade: Ponto): PontoEletrico | undefined => {
    let melhor: PontoEletrico | undefined;
    let melhorM = TOLERANCIA_ROTA_M;
    for (const ponto of pontos) {
      const posicao = posicaoDe(ponto);
      if (!posicao) continue;
      const m = paraMetros(distancia(extremidade, posicao), escala);
      if (m <= melhorM) {
        melhor = ponto;
        melhorM = m;
      }
    }
    return melhor;
  };
  for (const el of projeto.elementos) {
    if (el.tipo !== 'eletroduto' || el.pagina !== pagina) continue;
    const vertices = verticesDe(el);
    if (vertices.length < 2) continue;
    const alvo =
      pontos.find((p) => p.id === el.vinculos.alvoId) ??
      maisProximo(vertices[vertices.length - 1]!) ??
      maisProximo(vertices[0]!);
    if (!alvo) {
      alertas.adicionar('alvoId', 'Rota de eletroduto sem ponto elétrico — termine a rota sobre o ponto', el.id);
      continue;
    }
    porPonto.set(alvo.id, [...(porPonto.get(alvo.id) ?? []), el]);
  }
  return porPonto;
}

/** Quantitativos da disciplina elétrica. Elementos pendentes só geram linhas 'pendente'. */
export function calcularEletrica(projeto: Projeto): ResultadoDisciplina {
  const parametros = projeto.parametros.eletrica;
  const linhas = new Acumulador();
  const alertas = new Alertas();
  const derivados: GeometriaDerivada[] = [];

  // Páginas com elementos elétricos; sem escala → alerta e nenhuma linha da página.
  const paginas = [
    ...new Set(projeto.elementos.filter((el) => el.disciplina === 'eletrica').map((el) => el.pagina)),
  ].sort((a, b) => a - b);
  const paginasValidas = paginas.filter((pagina) => {
    if (escalaDaPagina(projeto, pagina) !== null) return true;
    alertas.adicionar('escala', `Página ${pagina} sem escala — calibre a escala para levantar a elétrica`);
    return false;
  });

  const pontos = projeto.elementos.filter(ehPontoEletrico).filter((p) => paginasValidas.includes(p.pagina));

  // ---- pontos, carga, caixas, luminárias
  for (const ponto of pontos) {
    const { tipoPonto, tue } = ponto.props;
    const ids = [ponto.id];
    if (tipoPonto === 'tue') {
      if (!tue) alertas.adicionar('tue', 'Informe o equipamento da tomada de uso específico (TUE)', ponto.id);
      linhas.somar(
        `pontos:tue:${tue ?? 'sem-equipamento'}`,
        ponto.status,
        {
          grupo: GRUPOS.pontos,
          descricao: ROTULO_TIPO_PONTO.tue,
          unidade: 'un',
          detalhe: tue ? ROTULO_TUE[tue] : TEXTO_TUE_NAO_INFORMADA,
        },
        1,
        ids,
      );
    } else {
      linhas.somar(
        `pontos:${tipoPonto}`,
        ponto.status,
        { grupo: GRUPOS.pontos, descricao: ROTULO_TIPO_PONTO[tipoPonto], unidade: 'un' },
        1,
        ids,
      );
    }
    if (tipoPonto !== 'interruptor') {
      if (somaCarga(ponto)) {
        linhas.somar(
          'carga',
          ponto.status,
          { grupo: GRUPOS.pontos, descricao: 'Carga total instalada', unidade: 'VA' },
          ponto.props.potenciaVA,
          ids,
        );
      } else {
        alertas.adicionar('potenciaVA', 'Informe a potência (VA) do ponto', ponto.id);
      }
    }
    const caixa = CAIXA_POR_TIPO[tipoPonto];
    linhas.somar(
      `caixa:${caixa.chave}`,
      ponto.status,
      { grupo: GRUPOS.caixas, descricao: caixa.descricao, unidade: 'un', ehMaterial: true },
      1,
      ids,
    );
    if (tipoPonto === 'luz') {
      const base = { grupo: GRUPOS.luminarias, unidade: 'un', ehMaterial: true };
      linhas.somar('luminaria', ponto.status, { ...base, descricao: 'Luminária' }, 1, ids);
      linhas.somar('lampada', ponto.status, { ...base, descricao: 'Lâmpada' }, 1, ids);
    }
  }

  // ---- circuitos: disjuntores, DR e DPS (confirmados e pendentes calculados separadamente)
  const circuitos = calcularCircuitos(projeto);
  for (const circuito of circuitos) {
    const ids = [...circuito.pontoIds, ...circuito.interruptorIds];
    linhas.somar('circuitos', circuito.status, { grupo: GRUPOS.circuitos, descricao: 'Circuitos', unidade: 'un' }, 1, ids);
    if (circuito.disjuntorA === null) {
      alertas.adicionar(
        'disjuntor',
        `${circuito.rotulo}: corrente acima da tabela de disjuntores — divida a carga ou confira o projeto elétrico`,
        circuito.pontoIds[0],
      );
      continue;
    }
    linhas.somar(
      `disjuntor:${circuito.disjuntorA}`,
      circuito.status,
      {
        grupo: GRUPOS.circuitos,
        descricao: 'Disjuntor termomagnético',
        unidade: 'un',
        ehMaterial: true,
        detalhe: `${circuito.disjuntorA} A`,
      },
      1,
      ids,
    );
  }
  if (circuitos.length > 0) {
    // 1 conjunto geral: confirmado se houver circuito confirmado; senão, pendente.
    const status: Status = circuitos.some((c) => c.status === 'confirmado') ? 'confirmado' : 'pendente';
    const ids = circuitos.filter((c) => c.status === status).flatMap((c) => c.pontoIds);
    const base = { grupo: GRUPOS.circuitos, unidade: 'un', ehMaterial: true };
    linhas.somar('dr', status, { ...base, descricao: 'Dispositivo DR geral' }, QUANTIDADE_DR, ids);
    linhas.somar('dps', status, { ...base, descricao: 'DPS (protetor de surto)' }, QUANTIDADE_DPS, ids);
  }

  // ---- eletrodutos e fios: quadro → cada ponto (pelo teto) + verticais
  const somarTrecho = (
    status: Status,
    comprimentoM: number,
    diametroMm: number,
    secaoMm2: number | null,
    condutores: number,
    ids: string[],
  ) => {
    linhas.somar(
      `eletroduto:${diametroMm}`,
      status,
      { grupo: GRUPOS.eletrodutos, descricao: 'Eletroduto', unidade: 'm', ehMaterial: true, detalhe: `Ø${diametroMm} mm` },
      comprimentoM,
      ids,
    );
    if (secaoMm2 === null) return; // TUE sem equipamento: alerta 'tue' já emitido; fio não sai.
    linhas.somar(
      `fio:${secaoMm2}`,
      status,
      { grupo: GRUPOS.eletrodutos, descricao: 'Fio / cabo de cobre', unidade: 'm', ehMaterial: true, detalhe: `${secaoMm2} mm²` },
      comprimentoM * condutores,
      ids,
    );
  };

  for (const pagina of paginasValidas) {
    const escala = escalaDaPagina(projeto, pagina)!;
    const daPagina = pontos.filter((p) => p.pagina === pagina);
    const redesenhadas = rotasRedesenhadas(projeto, pagina, escala, daPagina, alertas);
    if (daPagina.length === 0) continue;
    const quadro = quadroDaPagina(projeto, pagina);
    if (!quadro) {
      alertas.adicionar('quadro', paginas.length > 1 ? `${MENSAGEM_SEM_QUADRO} (página ${pagina})` : MENSAGEM_SEM_QUADRO);
      continue;
    }
    const alertaPeDireito = () =>
      alertas.adicionar('peDireito', 'Informe o pé-direito para calcular eletrodutos e fios');
    /** Pontos com eletroduto calculado → status da rota. */
    const roteados = new Map<string, Status>();

    for (const ponto of daPagina) {
      const posicao = posicaoDe(ponto);
      if (!posicao) continue;
      // A rota redesenhada substitui a automática (uma rota pendente não altera um ponto confirmado).
      const redesenhada = (redesenhadas.get(ponto.id) ?? []).find(
        (r) => r.status === 'confirmado' || ponto.status === 'pendente',
      );
      const status = ambos(ambos(ponto.status, quadro.quadro.status), redesenhada?.status ?? 'confirmado');
      let horizontalUn: number;
      if (redesenhada) {
        horizontalUn = comprimentoPolilinha(verticesDe(redesenhada));
      } else {
        const rota = rotaOrtogonal(quadro.posicao, posicao);
        horizontalUn = comprimentoPolilinha(rota);
        derivados.push({
          id: `eletrica:rota:${ponto.id}`,
          disciplina: 'eletrica',
          pagina,
          pontos: rota,
          status: ponto.status,
          elementoId: ponto.id,
        });
      }
      const peDireito = peDireitoDe(projeto, ponto.vinculos.ambienteId);
      if (peDireito === null) {
        alertaPeDireito();
        continue;
      }
      const comprimentoM =
        paraMetros(horizontalUn, escala) +
        trechoVerticalM(peDireito, alturaInstalacaoM(ponto.props.altura, parametros));
      const diametro = redesenhada?.props.diametroMm ?? parametros.diametroEletrodutoMm;
      const ids = redesenhada ? [ponto.id, redesenhada.id] : [ponto.id];
      somarTrecho(
        status,
        comprimentoM,
        diametro,
        secaoDoPonto(ponto, parametros),
        parametros.condutores[tipoCircuitoDoPonto(ponto)],
        ids,
      );
      roteados.set(ponto.id, status);
    }

    // Descida do quadro: uma vez por circuito com eletroduto calculado.
    const peDireitoQuadro = peDireitoDe(projeto, quadro.quadro.vinculos.ambienteId);
    for (const circuito of circuitos) {
      if (circuito.pagina !== pagina) continue;
      const membros = [...circuito.pontoIds, ...circuito.interruptorIds].filter((id) => roteados.has(id));
      if (membros.length === 0) continue;
      if (peDireitoQuadro === null) {
        alertaPeDireito();
        break;
      }
      somarTrecho(
        ambos(circuito.status, quadro.quadro.status),
        trechoVerticalM(peDireitoQuadro, ALTURA_QUADRO_M),
        parametros.diametroEletrodutoMm,
        circuito.secaoMm2,
        parametros.condutores[circuito.tipo],
        [quadro.quadro.id, ...membros],
      );
    }
  }

  return { linhas: linhas.listar(), alertas: alertas.lista, derivados };
}

export type { Circuito };
