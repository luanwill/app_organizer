/**
 * Sugestão automática da estrutura de uma página: pilares + vigas baldrame + vigas superiores +
 * lajes + fundações. Função PURA (ids determinísticos); tudo nasce 'sugerido-auto' / 'pendente'.
 */
import type { Elemento, ElementoDe, Geometria, Ponto, Projeto, TipoElemento, Vinculos } from '@/core/model';
import {
  areaPoligono,
  caixaEnvolvente,
  construirGrafoParedes,
  distancia,
  escalaValida,
  paraUnidades,
  retanguloParaPoligono,
} from '@/core/calc';
import { montarCadeias } from './cadeias';
import {
  PREFIXO_ID_SUGESTAO,
  PREFIXO_ROTULO,
  ROTULO_RADIER,
  TOLERANCIA_GRAFO_M,
  TOLERANCIA_LINHA_M,
  TOLERANCIA_ORTOGONAL_M,
  TOLERANCIA_UNIAO_LAJES_M,
} from './config';
import { montarLajes } from './lajes';
import { ordenarLeitura, posicionarPilares } from './pilares';
import { dividirEmTrechos, type TrechoViga } from './vigas';

type TipoEstrutura = keyof typeof PREFIXO_ROTULO;

/** Sugestão anterior desta página — será trocada por store.substituirSugestoes. */
function seraSubstituida(e: Elemento, pagina: number): boolean {
  return e.disciplina === 'estrutura' && e.origem === 'sugerido-auto' && e.status === 'pendente' && e.pagina === pagina;
}

/** Maior número já usado em rótulos do tipo (P7 → 7); a numeração nova continua depois dele. */
function ultimoNumero(elementos: Elemento[], tipo: TipoEstrutura): number {
  const padrao = new RegExp(`^${PREFIXO_ROTULO[tipo]}(\\d+)$`);
  let maior = 0;
  for (const e of elementos) {
    const numero = e.tipo === tipo ? padrao.exec(e.rotulo ?? '')?.[1] : undefined;
    if (numero !== undefined) maior = Math.max(maior, Number(numero));
  }
  return maior;
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
  const numerador = (tipo: TipoEstrutura): (() => string) => {
    let numero = ultimoNumero(restantes, tipo);
    return () => `${PREFIXO_ROTULO[tipo]}${++numero}`;
  };
  const mantidos = <K extends TipoElemento>(tipo: K): ElementoDe<K>[] =>
    daPagina.filter((e): e is ElementoDe<K> => e.tipo === tipo);

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
  const proximoPilar = numerador('pilar');
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
    const perto = (a: Ponto, b: Ponto | undefined): boolean => b !== undefined && distancia(a, b) <= tolerancia;
    const jaExiste = ([a, b]: [Ponto, Ponto]): boolean =>
      existentes.some((v) => {
        const [c, d] = [v[0], v[v.length - 1]];
        return (perto(a, c) && perto(b, d)) || (perto(a, d) && perto(b, c));
      });
    const proximo = numerador(tipo);
    for (const trecho of trechos) {
      if (jaExiste(trecho.pontos)) continue;
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
  const cobertos = mantidos('ambiente').flatMap((e) =>
    e.props.coberto === true && e.geometria.tipo === 'poligono' && !comLaje.has(e.id)
      ? [{ id: e.id, pontos: e.geometria.pontos }]
      : [],
  );
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
  const proximaLaje = numerador('laje');
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
    const proximaFundacao = numerador('fundacao');
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

  return sugestoes;
}
