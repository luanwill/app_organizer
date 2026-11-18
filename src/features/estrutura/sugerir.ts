/**
 * Sugestão automática da estrutura de uma página: pilares + vigas baldrame + vigas superiores +
 * lajes + fundações. Função PURA (ids determinísticos); tudo nasce 'sugerido-auto' / 'pendente'.
 */
import type { Elemento, ElementoDe, Geometria, Ponto, Projeto, TipoElemento, Vinculos } from '@/core/model';
import {
  areaPoligono,
  caixaEnvolvente,
  comprimentoPolilinha,
  construirGrafoParedes,
  distancia,
  escalaValida,
  paraUnidades,
  retanguloParaPoligono,
  pontoEmPoligono,
} from '@/core/calc';
import { montarCadeias, trechoJaExiste } from './cadeias';
import {
  bordasBaixas,
  cadeiasDeBordas,
  numeroCondutores,
  posicoesCondutores,
  recortarSegmentoNoPoligono,
  sugerirTelhados,
  type SegmentoParede,
} from './cobertura';
import {
  FOLGA_PAREDE_MAIS_ALTA_M,
  PREFIXO_CALHA,
  PREFIXO_ID_SUGESTAO,
  PREFIXO_TELHADO,
  PREFIXO_ROTULO,
  ROTULO_RADIER,
  DEGRAU_MINIMO_TELHADO_M,
  TOLERANCIA_GRAFO_M,
  TOLERANCIA_LINHA_M,
  TOLERANCIA_ORTOGONAL_M,
  TOLERANCIA_UNIAO_LAJES_M,
} from './config';
import { montarLajes, pontoInterno } from './lajes';
import { ordenarLeitura, posicionarPilares } from './pilares';
import { dividirEmTrechos, type TrechoViga } from './vigas';


/** Sugestão anterior desta página — será trocada por store.substituirSugestoes. */
function seraSubstituida(e: Elemento, pagina: number): boolean {
  return e.disciplina === 'estrutura' && e.origem === 'sugerido-auto' && e.status === 'pendente' && e.pagina === pagina;
}

/** Maior número já usado em rótulos do tipo com o prefixo (P7 → 7); a numeração nova continua depois dele. */
function ultimoNumero(elementos: Elemento[], tipo: TipoElemento, prefixo: string): number {
  const padrao = new RegExp(`^${prefixo}(\\d+)$`);
  let maior = 0;
  for (const e of elementos) {
    const numero = e.tipo === tipo ? padrao.exec(e.rotulo ?? '')?.[1] : undefined;
    if (numero !== undefined) maior = Math.max(maior, Number(numero));
  }
  return maior;
}

/** Próximo rótulo livre para um elemento desenhado à mão (T3, CH5…). */
export function proximoRotulo(elementos: Elemento[], tipo: TipoElemento, prefixo: string): string {
  return `${prefixo}${ultimoNumero(elementos, tipo, prefixo) + 1}`;
}

const pontoMedio = (t: TrechoViga): Ponto => ({ x: (t.pontos[0].x + t.pontos[1].x) / 2, y: (t.pontos[0].y + t.pontos[1].y) / 2 });

export function sugerirEstrutura(projeto: Projeto, pagina: number): Elemento[] {
  const escala = projeto.paginas[pagina]?.escala;
  if (!escalaValida(escala)) return [];
  const estrutura = projeto.parametros.estrutura;
  const tolerancia = paraUnidades(TOLERANCIA_GRAFO_M, escala);
  const toleranciaLinha = paraUnidades(TOLERANCIA_LINHA_M, escala);

  const restantes = projeto.elementos.filter((e) => !seraSubstituida(e, pagina));
  const daPagina = restantes.filter((e) => e.pagina === pagina);
  const idsEmUso = new Set(restantes.map((e) => e.id));
  const sugestoes: Elemento[] = [];

  const base = (rotulo: string, geometria: Geometria, vinculos: Vinculos) => {
    let id = `${PREFIXO_ID_SUGESTAO}-${pagina}-${rotulo}`;
    for (let n = 2; idsEmUso.has(id); n++) id = `${PREFIXO_ID_SUGESTAO}-${pagina}-${rotulo}-${n}`;
    idsEmUso.add(id);
    return {
      id,
      disciplina: 'estrutura' as const,
      pagina,
      geometria,
      vinculos,
      origem: 'sugerido-auto' as const,
      status: 'pendente' as const,
      rotulo,
    };
  };
  const numerador = (tipo: TipoElemento, prefixo: string): (() => string) => {
    let numero = ultimoNumero(restantes, tipo, prefixo);
    return () => `${prefixo}${++numero}`;
  };
  const mantidos = <K extends TipoElemento>(tipo: K): Extract<Elemento, { tipo: K }>[] =>
    daPagina.filter((e): e is Extract<Elemento, { tipo: K }> => e.tipo === tipo);

  // ---- grafo das paredes
  const paredes = mantidos('parede').flatMap((e) =>
    e.geometria.tipo === 'polilinha' && e.geometria.pontos.length >= 2 ? [{ id: e.id, pontos: e.geometria.pontos }] : [],
  );
  const grafo = construirGrafoParedes(paredes, tolerancia);
  const cadeias = montarCadeias(grafo);

  // ---- pilares
  const pilaresMantidos = mantidos('pilar').flatMap((e) =>
    e.geometria.tipo === 'ponto' ? [{ id: e.id, ponto: e.geometria.ponto }] : [],
  );
  const proximoPilar = numerador('pilar', PREFIXO_ROTULO.pilar);
  const pilaresNovos = posicionarPilares(grafo, cadeias, {
    escala,
    vaoMaximo: estrutura.vaoMaximo,
    distanciaFusao: estrutura.distanciaFusao,
    tolerancia,
    toleranciaLinha,
    existentes: pilaresMantidos.map((p) => p.ponto),
  }).map((p): ElementoDe<'pilar'> => ({
    ...base(proximoPilar(), { tipo: 'ponto', ponto: p.ponto }, {}),
    tipo: 'pilar',
    // altura fica indefinida de propósito: derivada ao vivo (pé-direito + viga superior)
    props: { secaoB: estrutura.pilar.secaoB, secaoH: estrutura.pilar.secaoH, noTipo: p.noTipo },
  }));
  sugestoes.push(...pilaresNovos);
  const todosPilares = ordenarLeitura(
    [...pilaresMantidos, ...pilaresNovos.map((e) => ({ id: e.id, ponto: (e.geometria as { ponto: Ponto }).ponto }))],
    (p) => p.ponto,
    toleranciaLinha,
  );

  // ---- vigas (trechos entre pilares; não repete trecho que já existe)
  const trechos = ordenarLeitura(
    dividirEmTrechos(cadeias, todosPilares.map((p) => p.ponto), tolerancia),
    pontoMedio,
    toleranciaLinha,
  );
  const sugerirVigas = (tipo: 'viga-baldrame' | 'viga-superior', secao: { secaoB: number; secaoH: number }): void => {
    const existentes = mantidos(tipo).flatMap((e) => (e.geometria.tipo === 'polilinha' ? [e.geometria.pontos] : []));
    const proximo = numerador(tipo, PREFIXO_ROTULO[tipo]);
    for (const trecho of trechos) {
      // já existe se as extremidades coincidem ou se o meio do trecho cai sobre uma viga mantida
      if (trechoJaExiste(trecho.pontos, existentes, tolerancia)) continue;
      sugestoes.push({
        ...base(proximo(), { tipo: 'polilinha', pontos: [...trecho.pontos] }, { paredeId: trecho.paredeId }),
        tipo,
        props: { secaoB: secao.secaoB, secaoH: secao.secaoH },
      });
    }
  };
  sugerirVigas('viga-baldrame', estrutura.baldrame);
  if (estrutura.vigaSuperior.ativa) sugerirVigas('viga-superior', estrutura.vigaSuperior);

  // ---- lajes (ambientes cobertos que ainda não têm laje)
  const comLaje = new Set(mantidos('laje').flatMap((e) => e.vinculos.ambienteIds ?? []));
  const todosCobertos = mantidos('ambiente').flatMap((e) =>
    e.props.coberto === true && e.geometria.tipo === 'poligono' ? [{ id: e.id, pontos: e.geometria.pontos }] : [],
  );
  const cobertos = todosCobertos.filter((a) => !comLaje.has(a.id));
  const lajes = ordenarLeitura(
    montarLajes(
      cobertos,
      estrutura.laje.modo,
      paraUnidades(TOLERANCIA_UNIAO_LAJES_M, escala),
      paraUnidades(TOLERANCIA_ORTOGONAL_M, escala),
    ),
    (l) => {
      const caixa = caixaEnvolvente(l.pontos);
      return { x: caixa.minX, y: caixa.minY };
    },
    toleranciaLinha,
  );
  const proximaLaje = numerador('laje', PREFIXO_ROTULO.laje);
  for (const laje of lajes) {
    sugestoes.push({
      ...base(proximaLaje(), { tipo: 'poligono', pontos: laje.pontos }, { ambienteIds: laje.ambienteIds }),
      tipo: 'laje',
      props: { tipoLaje: estrutura.laje.tipo, espessura: estrutura.laje.espessura },
    });
  }

  // ---- fundações
  const fundacoes = mantidos('fundacao');
  const tipoFundacao = estrutura.fundacao.tipo;
  if (tipoFundacao === 'radier') {
    const caixa = caixaEnvolvente(paredes.flatMap((p) => p.pontos));
    const contorno = retanguloParaPoligono({ x: caixa.minX, y: caixa.minY }, { x: caixa.maxX, y: caixa.maxY });
    const jaTemRadier = fundacoes.some((f) => f.geometria.tipo === 'poligono');
    if (!jaTemRadier && areaPoligono(contorno) > 0) {
      sugestoes.push({
        ...base(ROTULO_RADIER, { tipo: 'poligono', pontos: contorno }, {}),
        tipo: 'fundacao',
        props: { tipoFundacao },
      });
    }
  } else {
    const pilaresComFundacao = new Set(fundacoes.flatMap((f) => (f.vinculos.pilarId ? [f.vinculos.pilarId] : [])));
    const pontosComFundacao = fundacoes.flatMap((f) => (f.geometria.tipo === 'ponto' ? [f.geometria.ponto] : []));
    const proximaFundacao = numerador('fundacao', PREFIXO_ROTULO.fundacao);
    for (const pilar of todosPilares) {
      if (pilaresComFundacao.has(pilar.id)) continue;
      if (pontosComFundacao.some((p) => distancia(p, pilar.ponto) <= tolerancia)) continue;
      sugestoes.push({
        ...base(proximaFundacao(), { tipo: 'ponto', ponto: { ...pilar.ponto } }, { pilarId: pilar.id }),
        tipo: 'fundacao',
        props: { tipoFundacao },
      });
    }
  }

  sugestoes.push(...sugerirCobertura());
  return sugestoes;

  // ---- cobertura: telhados, calhas, condutores e rufos
  function sugerirCobertura(): Elemento[] {
    const novos: Elemento[] = [];
    const cobertura = estrutura.cobertura;
    const espessuraGeral = projeto.parametros.gerais.espessuraParede;
    const segmentos: SegmentoParede[] = mantidos('parede').flatMap((e) => {
      if (e.geometria.tipo !== 'polilinha') return [];
      // espessura desconhecida → eixo (o módulo de arquitetura já alerta a espessura faltante)
      const meiaEspessura = paraUnidades((e.props.espessura ?? espessuraGeral ?? 0) / 2, escala!);
      const pts = e.geometria.pontos;
      return pts.slice(1).map((b, i) => ({ a: pts[i]!, b, meiaEspessura }));
    });

    // telhados (um por bloco de ambientes cobertos que ainda não tem telhado)
    const telhadosMantidos = mantidos('telhado').flatMap((e) =>
      e.geometria.tipo === 'poligono' ? [{ id: e.id, pontos: e.geometria.pontos, props: e.props, ambienteIds: e.vinculos.ambienteIds ?? [] }] : [],
    );
    const jaCoberto = (ambienteId: string, pontos: Ponto[]): boolean => {
      const p = pontoInterno(pontos);
      return telhadosMantidos.some((t) => t.ambienteIds.includes(ambienteId) || (p !== null && pontoEmPoligono(p, t.pontos)));
    };
    const sugeridos = ordenarLeitura(
      sugerirTelhados(
        todosCobertos.filter((a) => !jaCoberto(a.id, a.pontos)),
        segmentos,
        {
          tolerancia: paraUnidades(TOLERANCIA_UNIAO_LAJES_M, escala!),
          toleranciaOrtogonal: paraUnidades(TOLERANCIA_ORTOGONAL_M, escala!),
          beiral: paraUnidades(cobertura.beiral, escala!),
          degrauMinimo: paraUnidades(DEGRAU_MINIMO_TELHADO_M, escala!),
        },
      ),
      (t) => {
        const c = caixaEnvolvente(t.pontos);
        return { x: c.minX, y: c.minY };
      },
      toleranciaLinha,
    );
    const proximoTelhado = numerador('telhado', PREFIXO_TELHADO);
    const telhados = [...telhadosMantidos];
    for (const t of sugeridos) {
      const props = { tipoTelha: null, inclinacaoPct: null, aguas: t.aguas, direcao: t.direcao, beiral: cobertura.beiral };
      const el: ElementoDe<'telhado'> = {
        ...base(proximoTelhado(), { tipo: 'poligono', pontos: t.pontos }, { ambienteIds: t.ambienteIds }),
        tipo: 'telhado',
        props,
      };
      novos.push(el);
      telhados.push({ id: el.id, pontos: t.pontos, props, ambienteIds: t.ambienteIds });
    }

    // calhas nas bordas baixas, condutores ao longo delas e rufos nas paredes mais altas
    const calhasMantidas = (funcao: 'calha' | 'rufo'): Ponto[][] =>
      mantidos('calha').flatMap((e) => (e.props.funcao === funcao && e.geometria.tipo === 'polilinha' ? [e.geometria.pontos] : []));
    const existentesCalha = calhasMantidas('calha');
    const existentesRufo = calhasMantidas('rufo');
    const existentesCondutor = mantidos('calha').flatMap((e) =>
      e.props.funcao === 'condutor' && e.geometria.tipo === 'ponto' ? [e.geometria.ponto] : [],
    );
    const proxima = {
      calha: numerador('calha', PREFIXO_CALHA.calha),
      rufo: numerador('calha', PREFIXO_CALHA.rufo),
      condutor: numerador('calha', PREFIXO_CALHA.condutor),
    };
    const peDireito = projeto.parametros.gerais.peDireito;
    const paredesAltas =
      peDireito === null
        ? []
        : mantidos('parede').filter(
            (e) => typeof e.props.altura === 'number' && e.props.altura > peDireito + FOLGA_PAREDE_MAIS_ALTA_M,
          );
    for (const telhado of telhados) {
      // propriedades de desenvolvimento/diâmetro ficam indefinidas: derivadas ao vivo dos parâmetros
      const bordas = bordasBaixas(telhado.pontos, telhado.props.aguas, telhado.props.direcao, tolerancia);
      // um elemento calha por aresta…
      for (const [a, b] of bordas) {
        if (trechoJaExiste([a, b], existentesCalha, tolerancia)) continue;
        novos.push({
          ...base(proxima.calha(), { tipo: 'polilinha', pontos: [{ ...a }, { ...b }] }, { telhadoId: telhado.id }),
          tipo: 'calha',
          props: { funcao: 'calha' },
        });
      }
      // …e os condutores distribuídos pela cadeia contínua de calhas (não por aresta)
      for (const cadeia of cadeiasDeBordas(bordas, tolerancia)) {
        const n = numeroCondutores(comprimentoPolilinha(cadeia) * escala!, cobertura.calhaPorCondutorM);
        for (const p of posicoesCondutores(cadeia, n)) {
          if (existentesCondutor.some((q) => distancia(p, q) <= tolerancia)) continue;
          existentesCondutor.push(p);
          novos.push({
            ...base(proxima.condutor(), { tipo: 'ponto', ponto: p }, { telhadoId: telhado.id }),
            tipo: 'calha',
            props: { funcao: 'condutor' },
          });
        }
      }
      for (const parede of paredesAltas) {
        if (parede.geometria.tipo !== 'polilinha') continue;
        const pts = parede.geometria.pontos;
        for (let i = 0; i + 1 < pts.length; i++) {
          for (const trecho of recortarSegmentoNoPoligono(pts[i]!, pts[i + 1]!, telhado.pontos, tolerancia)) {
            if (trechoJaExiste(trecho, existentesRufo, tolerancia)) continue;
            existentesRufo.push(trecho);
            novos.push({
              ...base(proxima.rufo(), { tipo: 'polilinha', pontos: trecho }, { telhadoId: telhado.id, paredeId: parede.id }),
              tipo: 'calha',
              props: { funcao: 'rufo' },
            });
          }
        }
      }
    }
    return novos;
  }
}
