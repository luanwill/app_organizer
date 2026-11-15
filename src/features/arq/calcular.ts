/**
 * Arquitetura (S4): regras de cálculo PURAS (sem React/store).
 * Geometria em unidades do PDF → metros pela escala da página do elemento.
 */
import type {
  Alerta,
  CodigoServico,
  Elemento,
  ElementoDe,
  LinhaQuantitativo,
  ParametrosArquitetura,
  Projeto,
  ResultadoDisciplina,
  Status,
  TipoEsquadria,
} from '@/core/model';
import {
  areaPoligono,
  comprimentoPolilinha,
  distanciaPontoPoligono,
  escalaValida,
  formatarNumero,
  paraM2,
  paraMetros,
  perimetroPoligono,
} from '@/core/calc';
import {
  DESCRICAO_CONTAGEM_PADRAO,
  DESCRICAO_MEDICAO_PADRAO,
  DISCIPLINA,
  GRUPO,
  MANUAL_AREA,
  MANUAL_COMPRIMENTO,
  MANUAL_PERIMETRO,
  NOME_AMBIENTE_PADRAO,
  NOME_PAREDE_PADRAO,
  ROTULO_CATEGORIA,
  TOLERANCIA_ESQUADRIA_AMBIENTE_M,
  UNIDADE,
} from './config';

type Ambiente = ElementoDe<'ambiente'>;
type Parede = ElementoDe<'parede'>;
type Esquadria = ElementoDe<'esquadria'>;
type Medicao = ElementoDe<'medicao'>;

// ---------------------------------------------------------------- helpers

/** Escala (m/unidade) da página do elemento; null se a página não está calibrada. */
export function escalaDaPagina(projeto: Projeto, pagina: number): number | null {
  const escala = projeto.paginas[pagina]?.escala;
  return escalaValida(escala) ? escala : null;
}

/** Dimensão informada = número finito e positivo. null/undefined/0 contam como dado faltante. */
function informado(valor: number | null | undefined): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0;
}

function valorManual(el: Elemento, chave: string): number | null {
  const v = el.manuais?.[chave];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

export function nomeAmbiente(el: Ambiente): string {
  return el.props.nome.trim() || el.rotulo?.trim() || NOME_AMBIENTE_PADRAO;
}

/** Próximo nome livre "Ambiente N" para um ambiente novo. */
export function proximoNomeAmbiente(elementos: Elemento[]): string {
  const usados = new Set(elementos.filter((e) => e.tipo === 'ambiente').map((e) => (e as Ambiente).props.nome));
  let n = usados.size + 1;
  while (usados.has(`${NOME_AMBIENTE_PADRAO} ${n}`)) n += 1;
  return `${NOME_AMBIENTE_PADRAO} ${n}`;
}

export interface MedidasAmbiente {
  area: number; // m²
  perimetro: number; // m
  areaManual: boolean;
  perimetroManual: boolean;
}

/** Área e perímetro do ambiente em metros (valor manual substitui o geométrico). null se não for polígono. */
export function medidasAmbiente(el: Ambiente, escala: number): MedidasAmbiente | null {
  if (el.geometria.tipo !== 'poligono') return null;
  const areaM = valorManual(el, MANUAL_AREA);
  const perimetroM = valorManual(el, MANUAL_PERIMETRO);
  return {
    area: areaM ?? paraM2(areaPoligono(el.geometria.pontos), escala),
    perimetro: perimetroM ?? paraMetros(perimetroPoligono(el.geometria.pontos), escala),
    areaManual: areaM !== null,
    perimetroManual: perimetroM !== null,
  };
}

/** Comprimento da parede em metros (valor manual substitui o geométrico). null se não for polilinha. */
export function comprimentoParede(el: Parede, escala: number): { comprimento: number; manual: boolean } | null {
  if (el.geometria.tipo !== 'polilinha') return null;
  const manual = valorManual(el, MANUAL_COMPRIMENTO);
  return {
    comprimento: manual ?? paraMetros(comprimentoPolilinha(el.geometria.pontos), escala),
    manual: manual !== null,
  };
}

export function areaVao(tipo: Pick<TipoEsquadria, 'largura' | 'altura'>): number {
  return tipo.largura * tipo.altura;
}

/**
 * Regra de desconto de vão: área (m²) a descontar de UM vão.
 * 'acima-do-limite' desconta a área inteira apenas de vãos MAIORES que o limite; 'todos' sempre; 'nenhum' nunca.
 */
export function descontoDoVao(
  tipo: Pick<TipoEsquadria, 'largura' | 'altura'>,
  regra: Pick<ParametrosArquitetura, 'modoDescontoVao' | 'limiteDescontoVaoM2'>,
): number {
  const area = areaVao(tipo);
  if (regra.modoDescontoVao === 'nenhum') return 0;
  if (regra.modoDescontoVao === 'todos') return area;
  return area > regra.limiteDescontoVaoM2 ? area : 0;
}

/**
 * Uma esquadria pendente (sugestão ainda não aceita) não altera quantidades de um hospedeiro
 * confirmado — pendentes nunca entram como confirmados. Num hospedeiro pendente, ela conta.
 */
function contaNoHospedeiro(esquadria: Esquadria, hospedeiro: Elemento): boolean {
  return esquadria.status === 'confirmado' || hospedeiro.status === 'pendente';
}

/** A esquadria pertence ao ambiente (mesma página, ponto a até `toleranciaM` da borda do polígono)? */
export function esquadriaNoAmbiente(
  esquadria: Esquadria,
  ambiente: Ambiente,
  escala: number,
  toleranciaM: number = TOLERANCIA_ESQUADRIA_AMBIENTE_M,
): boolean {
  if (esquadria.pagina !== ambiente.pagina) return false;
  if (esquadria.geometria.tipo !== 'ponto' || ambiente.geometria.tipo !== 'poligono') return false;
  const d = distanciaPontoPoligono(esquadria.geometria.ponto, ambiente.geometria.pontos);
  return paraMetros(d, escala) <= toleranciaM;
}

/** Quantidade de esquadrias posicionadas por tipo do cadastro (todas as páginas, pendentes inclusive). */
export function contarPosicionadas(elementos: Elemento[]): Record<string, number> {
  const contagem: Record<string, number> = {};
  for (const el of elementos) {
    if (el.tipo !== 'esquadria') continue;
    contagem[el.props.tipoEsquadriaId] = (contagem[el.props.tipoEsquadriaId] ?? 0) + 1;
  }
  return contagem;
}

/** Nome exibido de cada parede: rótulo próprio ou "Parede N" (ordem de criação). */
export function nomesDasParedes(elementos: Elemento[]): Map<string, string> {
  const nomes = new Map<string, string>();
  let n = 0;
  for (const el of elementos) {
    if (el.tipo !== 'parede') continue;
    n += 1;
    nomes.set(el.id, el.rotulo?.trim() || `${NOME_PAREDE_PADRAO} ${n}`);
  }
  return nomes;
}

// ---------------------------------------------------------------- cálculo

interface DadosLinha {
  id: string;
  grupo: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  status: Status;
  elementoIds: string[];
  servico?: CodigoServico;
  detalhe?: string;
  manual?: boolean;
}

function linha(d: DadosLinha): LinhaQuantitativo {
  const l: LinhaQuantitativo = {
    id: d.id,
    disciplina: DISCIPLINA,
    grupo: d.grupo,
    descricao: d.descricao,
    unidade: d.unidade,
    quantidade: d.quantidade,
    status: d.status,
    elementoIds: d.elementoIds,
  };
  if (d.servico) l.servico = d.servico;
  if (d.detalhe) l.detalhe = d.detalhe;
  if (d.manual) l.manual = true;
  return l;
}

const sufixoStatus = (status: Status): string => (status === 'pendente' ? ':pendente' : '');

export function calcularArquitetura(projeto: Projeto): ResultadoDisciplina {
  const linhas: LinhaQuantitativo[] = [];
  const alertas: Alerta[] = [];
  const { gerais, arquitetura: regra } = projeto.parametros;
  const tipos = new Map(projeto.esquadrias.map((t) => [t.id, t]));

  // --- páginas sem escala: alerta único por página; os elementos não geram linhas
  const semEscala = new Map<number, number>();
  const escalas = new Map<string, number>();
  const ambientes: Ambiente[] = [];
  const paredes: Parede[] = [];
  const esquadrias: Esquadria[] = [];
  const medicoes: Medicao[] = [];
  for (const el of projeto.elementos) {
    if (el.tipo !== 'ambiente' && el.tipo !== 'parede' && el.tipo !== 'esquadria' && el.tipo !== 'medicao') continue;
    const escala = escalaDaPagina(projeto, el.pagina);
    if (escala === null) {
      semEscala.set(el.pagina, (semEscala.get(el.pagina) ?? 0) + 1);
      continue;
    }
    escalas.set(el.id, escala);
    if (el.tipo === 'ambiente') ambientes.push(el);
    else if (el.tipo === 'parede') paredes.push(el);
    else if (el.tipo === 'esquadria') esquadrias.push(el);
    else medicoes.push(el);
  }
  for (const [pagina, n] of [...semEscala].sort((a, b) => a[0] - b[0])) {
    alertas.push({
      disciplina: DISCIPLINA,
      campo: 'escala',
      mensagem: `Página ${pagina} sem escala calibrada: ${n} ${n === 1 ? 'elemento não foi medido' : 'elementos não foram medidos'}`,
    });
  }

  // --- esquadrias válidas (tipo existente no cadastro)
  const esquadriasValidas: { el: Esquadria; tipo: TipoEsquadria }[] = [];
  for (const el of esquadrias) {
    const tipo = tipos.get(el.props.tipoEsquadriaId);
    if (!tipo) {
      alertas.push({
        disciplina: DISCIPLINA,
        elementoId: el.id,
        campo: 'tipoEsquadriaId',
        mensagem: `Esquadria${el.rotulo ? ` ${el.rotulo}` : ''} sem tipo no cadastro: não entra nas quantidades nem nos descontos de vão`,
      });
      continue;
    }
    esquadriasValidas.push({ el, tipo });
  }

  // --- 1 e 6. ambientes e acabamentos
  for (const amb of ambientes) {
    const escala = escalas.get(amb.id)!;
    const m = medidasAmbiente(amb, escala);
    if (!m) continue;
    const nome = nomeAmbiente(amb);
    const ids = [amb.id];
    const status = amb.status;
    const molhada = amb.props.areaMolhada;
    const doAmbiente = esquadriasValidas.filter(
      (e) => contaNoHospedeiro(e.el, amb) && esquadriaNoAmbiente(e.el, amb, escala),
    );
    const emite = (
      grupo: string,
      chave: string,
      rotulo: string,
      unidade: string,
      quantidade: number,
      manual: boolean,
      extra: { servico?: CodigoServico; detalhe?: string; elementoIds?: string[] } = {},
    ) =>
      linhas.push(
        linha({
          id: `${amb.id}:${chave}`,
          grupo,
          descricao: `${nome} — ${rotulo}`,
          unidade,
          quantidade,
          status,
          elementoIds: extra.elementoIds ?? ids,
          servico: extra.servico,
          detalhe: extra.detalhe,
          manual,
        }),
      );

    emite(GRUPO.ambientes, 'area', 'área', UNIDADE.m2, m.area, m.areaManual);
    emite(GRUPO.ambientes, 'perimetro', 'perímetro', UNIDADE.m, m.perimetro, m.perimetroManual);

    // área de parede (depende do pé-direito)
    const peDireito = amb.props.peDireito ?? gerais.peDireito;
    let areaParede: number | null = null;
    let idsParede = ids;
    if (informado(peDireito)) {
      const descontados = doAmbiente.filter((e) => descontoDoVao(e.tipo, regra) > 0);
      const desconto = descontados.reduce((s, e) => s + descontoDoVao(e.tipo, regra), 0);
      areaParede = Math.max(0, m.perimetro * peDireito - desconto);
      idsParede = [amb.id, ...descontados.map((e) => e.el.id)];
      emite(GRUPO.ambientes, 'area-parede', 'área de parede', UNIDADE.m2, areaParede, m.perimetroManual, {
        elementoIds: idsParede,
      });
    } else {
      alertas.push({
        disciplina: DISCIPLINA,
        elementoId: amb.id,
        campo: 'peDireito',
        mensagem: `Pé-direito não informado (${nome}): área de parede, pintura, revestimento e chapisco/emboço/reboco não calculados`,
      });
    }
    emite(GRUPO.ambientes, 'teto', 'teto', UNIDADE.m2, m.area, m.areaManual);

    // acabamentos
    const acab = (
      servico: CodigoServico,
      rotulo: string,
      unidade: string,
      quantidade: number,
      manual: boolean,
      extra: { detalhe?: string; elementoIds?: string[] } = {},
    ) => emite(GRUPO.acabamentos, servico, rotulo, unidade, quantidade, manual, { servico, ...extra });
    const demaos = `${regra.demaosPintura} ${regra.demaosPintura === 1 ? 'demão' : 'demãos'}`;

    acab('piso', 'piso', UNIDADE.m2, m.area, m.areaManual);
    acab('contrapiso', 'contrapiso', UNIDADE.m2, m.area, m.areaManual);
    if (!molhada) {
      const portas = doAmbiente.filter((e) => e.tipo.categoria === 'porta');
      const larguras = portas.reduce((s, e) => s + e.tipo.largura, 0);
      acab('rodape', 'rodapé', UNIDADE.m, Math.max(0, m.perimetro - larguras), m.perimetroManual, {
        elementoIds: [amb.id, ...portas.map((e) => e.el.id)],
      });
    }
    if (areaParede !== null) {
      const extra = { elementoIds: idsParede };
      if (molhada) {
        acab('revestimento-parede', 'revestimento de parede', UNIDADE.m2, areaParede, m.perimetroManual, extra);
      } else {
        acab('pintura-parede', 'pintura de parede', UNIDADE.m2, areaParede, m.perimetroManual, {
          ...extra,
          detalhe: demaos,
        });
      }
    }
    acab('pintura-teto', 'pintura de teto', UNIDADE.m2, m.area, m.areaManual, { detalhe: demaos });
    if (molhada) {
      acab(
        'impermeabilizacao',
        'impermeabilização',
        UNIDADE.m2,
        m.area + m.perimetro * regra.subidaImpermeabilizacao,
        m.areaManual || m.perimetroManual,
      );
    }
    if (areaParede !== null) {
      const extra = { elementoIds: idsParede };
      acab('chapisco', 'chapisco', UNIDADE.m2, areaParede, m.perimetroManual, extra);
      acab('emboco', 'emboço', UNIDADE.m2, areaParede, m.perimetroManual, extra);
      acab('reboco', 'reboco', UNIDADE.m2, areaParede, m.perimetroManual, extra);
    }
  }

  // --- 4. esquadrias: por código do cadastro (e por status — pendentes à parte)
  for (const tipo of projeto.esquadrias) {
    for (const status of ['confirmado', 'pendente'] as const) {
      const els = esquadriasValidas.filter((e) => e.tipo.id === tipo.id && e.el.status === status);
      if (els.length === 0) continue;
      const base = {
        grupo: GRUPO.esquadrias,
        status,
        elementoIds: els.map((e) => e.el.id),
        detalhe: `${ROTULO_CATEGORIA[tipo.categoria]} ${formatarNumero(tipo.largura)} × ${formatarNumero(tipo.altura)} m`,
      };
      linhas.push(
        linha({
          ...base,
          id: `esquadria:${tipo.id}:quantidade${sufixoStatus(status)}`,
          descricao: `${tipo.codigo} — quantidade`,
          unidade: UNIDADE.un,
          quantidade: els.length,
        }),
        linha({
          ...base,
          id: `esquadria:${tipo.id}:area-vao${sufixoStatus(status)}`,
          descricao: `${tipo.codigo} — área de vão`,
          unidade: UNIDADE.m2,
          quantidade: els.length * areaVao(tipo),
        }),
      );
    }
  }

  // --- 5. paredes
  const nomesParedes = nomesDasParedes(projeto.elementos);
  for (const par of paredes) {
    const escala = escalas.get(par.id)!;
    const c = comprimentoParede(par, escala);
    if (!c) continue;
    const nome = nomesParedes.get(par.id) ?? NOME_PAREDE_PADRAO;
    linhas.push(
      linha({
        id: `${par.id}:comprimento`,
        grupo: GRUPO.paredes,
        descricao: `${nome} — comprimento`,
        unidade: UNIDADE.m,
        quantidade: c.comprimento,
        status: par.status,
        elementoIds: [par.id],
        manual: c.manual,
      }),
    );
    if (!informado(par.props.espessura)) {
      alertas.push({
        disciplina: DISCIPLINA,
        elementoId: par.id,
        campo: 'espessuraParede',
        mensagem: `Espessura não informada (${nome})`,
      });
    }
    const altura = par.props.altura ?? gerais.peDireito;
    if (!informado(altura)) {
      alertas.push({
        disciplina: DISCIPLINA,
        elementoId: par.id,
        campo: 'peDireito',
        mensagem: `Altura não informada (${nome}): informe o pé-direito ou a altura da parede — alvenaria não calculada`,
      });
      continue;
    }
    const descontados = esquadriasValidas.filter(
      (e) => e.el.vinculos.paredeId === par.id && contaNoHospedeiro(e.el, par) && descontoDoVao(e.tipo, regra) > 0,
    );
    const desconto = descontados.reduce((s, e) => s + descontoDoVao(e.tipo, regra), 0);
    linhas.push(
      linha({
        id: `${par.id}:alvenaria`,
        grupo: GRUPO.paredes,
        descricao: `${nome} — alvenaria`,
        unidade: UNIDADE.m2,
        quantidade: Math.max(0, c.comprimento * altura - desconto),
        status: par.status,
        elementoIds: [par.id, ...descontados.map((e) => e.el.id)],
        servico: 'alvenaria',
        manual: c.manual,
      }),
    );
  }

  // --- 7. medições genéricas
  const contagens = new Map<string, { descricao: string; status: Status; ids: string[] }>();
  for (const med of medicoes) {
    const escala = escalas.get(med.id)!;
    const descricao = med.props.descricao.trim();
    const g = med.geometria;
    if (g.tipo === 'ponto') {
      const d = descricao || DESCRICAO_CONTAGEM_PADRAO;
      const chave = `contagem:${d}${sufixoStatus(med.status)}`;
      const grupo = contagens.get(chave) ?? { descricao: d, status: med.status, ids: [] };
      grupo.ids.push(med.id);
      contagens.set(chave, grupo);
      continue;
    }
    const d = descricao || DESCRICAO_MEDICAO_PADRAO;
    const base = { grupo: GRUPO.medicoes, status: med.status, elementoIds: [med.id] };
    if (g.tipo === 'polilinha') {
      linhas.push(
        linha({
          ...base,
          id: `${med.id}:comprimento`,
          descricao: `${d} — comprimento`,
          unidade: UNIDADE.m,
          quantidade: paraMetros(comprimentoPolilinha(g.pontos), escala),
        }),
      );
    } else {
      linhas.push(
        linha({
          ...base,
          id: `${med.id}:area`,
          descricao: `${d} — área`,
          unidade: UNIDADE.m2,
          quantidade: paraM2(areaPoligono(g.pontos), escala),
        }),
        linha({
          ...base,
          id: `${med.id}:perimetro`,
          descricao: `${d} — perímetro`,
          unidade: UNIDADE.m,
          quantidade: paraMetros(perimetroPoligono(g.pontos), escala),
        }),
      );
    }
  }
  for (const [chave, c] of contagens) {
    linhas.push(
      linha({
        id: chave,
        grupo: GRUPO.medicoes,
        descricao: c.descricao,
        unidade: UNIDADE.un,
        quantidade: c.ids.length,
        status: c.status,
        elementoIds: c.ids,
      }),
    );
  }

  return { linhas, alertas };
}
