/**
 * Quantitativos de hidráulica e sanitária (funções puras).
 *
 * MODELO DE TUBULAÇÃO (por página; planta em unidades do PDF, convertida pela escala da página)
 * - Cada ambiente com pontos tem um nó de "coluna" = centroide do ambiente.
 * - Água fria (AF) e água quente (AQ, mesmo traçado, só para pontos com água quente):
 *     tronco  = rota ortogonal do reservatório/entrada até a coluna do ambiente (sobre o forro);
 *     ramal   = rota ortogonal da coluna até cada ponto;
 *     descida = pé-direito − altura do ponto (parametros.hidraulica.alturaPontoM), uma por ponto.
 *   Pé-direito = ambiente.props.peDireito ?? parametros.gerais.peDireito; null → alerta, sem AF/AQ.
 * - Esgoto (sob o piso, não depende do pé-direito):
 *     ramal  = rota ortogonal de cada ponto até a coluna do ambiente
 *              (+ trecho vertical = altura do ponto, só para aparelhos com saída acima do piso);
 *     tronco = rota ortogonal da coluna até a caixa de inspeção/saída.
 * - O tronco usa o MAIOR diâmetro entre os pontos do ambiente naquele sistema.
 * - Pontos fora de qualquer ambiente ligam direto ao reservatório / à caixa (sem tronco, sem tê).
 * - Havendo mais de um reservatório (ou caixa), usa-se o mais próximo da coluna/ponto.
 * - Um elemento 'tubo' com vinculos.alvoId = ponto, ou com uma extremidade a até
 *   TOLERANCIA_TUBO_PONTO_M de um ponto, substitui o RAMAL automático daquele ponto no sistema
 *   do tubo (horizontal = comprimento da polilinha). Tubos que não atendem ponto algum
 *   (e os pluviais, se parametros.hidraulica.pluvial) são somados como desenhados.
 *
 * CONEXÕES
 * - joelhos = mudanças de direção das rotas + 1 por transição horizontal → vertical de cada ponto;
 * - tês = ramais que saem da coluna − 1, por ambiente e sistema (no diâmetro do tronco);
 * - conexões diversas = % sobre (joelhos + tês), por sistema, arredondado para cima.
 *
 * CONFIRMADO × PENDENTE
 * A rede é calculada duas vezes: só com os elementos confirmados (→ linhas 'confirmado') e com
 * todos (confirmados + pendentes). As linhas 'pendente' são a diferença entre as duas, de modo que
 * sugestões pendentes nunca alteram as quantidades confirmadas.
 */
import type {
  Alerta,
  ElementoDe,
  GeometriaDerivada,
  LinhaQuantitativo,
  ParametrosHidraulica,
  Ponto,
  Projeto,
  ResultadoDisciplina,
  SistemaHidraulico,
  Status,
} from '@/core/model';
import {
  arredondar,
  centroidePoligono,
  comprimentoPolilinha,
  contarMudancasDirecao,
  distancia,
  escalaValida,
  formatarNumero,
  paraMetros,
  paraUnidades,
  pontoEmPoligono,
  rotaOrtogonal,
} from '@/core/calc';
import {
  CAIXAS_SIFONADAS_POR_AMBIENTE_COM_RALO,
  CASAS_COMPRIMENTO,
  CASAS_GUARDA,
  GRUPOS,
  JOELHOS_POR_TRANSICAO_VERTICAL,
  LIGACOES_APARELHO,
  LOUCAS_E_METAIS,
  MENSAGENS,
  NOME_APARELHO,
  NOME_SISTEMA,
  PREFIXO_ID,
  REGISTROS_GAVETA_POR_AMBIENTE,
  REGISTROS_PRESSAO,
  SIGLA_SISTEMA,
  SISTEMAS,
  TOLERANCIA_TUBO_PONTO_M,
} from './config';

type PontoH = ElementoDe<'ponto-hidraulico'>;
type Tubo = ElementoDe<'tubo'>;
type Ambiente = ElementoDe<'ambiente'>;
type Terminal = ElementoDe<'reservatorio'> | ElementoDe<'caixa-inspecao'>;
/** Sistemas com rede automática (pluvial só soma tubos desenhados). */
type SistemaRede = Exclude<SistemaHidraulico, 'pluvial'>;

const SISTEMAS_REDE: SistemaRede[] = ['AF', 'AQ', 'esgoto'];
const ORDEM_GRUPOS: string[] = Object.values(GRUPOS);

// ---------------------------------------------------------------- helpers de ponto

export function pontoTemSistema(ponto: PontoH, sistema: SistemaRede): boolean {
  if (sistema === 'AF') return ponto.props.aguaFria;
  if (sistema === 'AQ') return ponto.props.aguaQuente;
  return ponto.props.esgoto;
}

/** Diâmetro (mm) do ponto no sistema: valor próprio ou, se ausente, o dos parâmetros. */
export function diametroDoPonto(ponto: PontoH, sistema: SistemaRede, params: ParametrosHidraulica): number {
  if (sistema === 'AF') return ponto.props.diametroAF ?? params.diametroAFmm;
  if (sistema === 'AQ') return ponto.props.diametroAQ ?? params.diametroAQmm;
  return ponto.props.diametroEsgoto ?? params.diametroEsgotoMm[ponto.props.aparelho];
}

const detalheDiametro = (d: number): string => `Ø${d} mm`;

function posicao(el: PontoH | Terminal): Ponto | null {
  return el.geometria.tipo === 'ponto' ? el.geometria.ponto : null;
}

// ---------------------------------------------------------------- acumulador de quantidades

interface Item {
  chave: string;
  grupo: string;
  descricao: string;
  unidade: string;
  detalhe?: string;
  quantidade: number;
  ids: Set<string>;
}

type Acumulador = Map<string, Item>;
type Meta = Omit<Item, 'quantidade' | 'ids'>;

function somar(acc: Acumulador, meta: Meta, quantidade: number, ids: Iterable<string>): void {
  if (!(quantidade > 0)) return;
  let item = acc.get(meta.chave);
  if (!item) {
    item = { ...meta, quantidade: 0, ids: new Set() };
    acc.set(meta.chave, item);
  }
  item.quantidade += quantidade;
  for (const id of ids) item.ids.add(id);
}

const metaTubo = (sistema: SistemaHidraulico, d: number): Meta => ({
  chave: `tubo:${sistema}:${d}`,
  grupo: GRUPOS.tubos,
  descricao: `Tubo de ${NOME_SISTEMA[sistema]}`,
  unidade: 'm',
  detalhe: detalheDiametro(d),
});

const metaBarra = (sistema: SistemaHidraulico, d: number, barraM: number): Meta => ({
  chave: `barra:${sistema}:${d}`,
  grupo: GRUPOS.tubos,
  descricao: `Barra de ${formatarNumero(barraM, Number.isInteger(barraM) ? 0 : CASAS_COMPRIMENTO)} m — tubo de ${NOME_SISTEMA[sistema]}`,
  unidade: 'un',
  detalhe: detalheDiametro(d),
});

const metaConexao = (tipo: 'joelho' | 'te', sistema: SistemaHidraulico, d: number): Meta => ({
  chave: `${tipo}:${sistema}:${d}`,
  grupo: GRUPOS.conexoes,
  descricao: `${tipo === 'joelho' ? 'Joelho 90°' : 'Tê'} — ${NOME_SISTEMA[sistema]}`,
  unidade: 'un',
  detalhe: detalheDiametro(d),
});

const metaDiversas = (sistema: SistemaHidraulico): Meta => ({
  chave: `diversas:${sistema}`,
  grupo: GRUPOS.conexoes,
  descricao: `Conexões diversas — ${NOME_SISTEMA[sistema]}`,
  unidade: 'un',
});

// ---------------------------------------------------------------- rede de uma página

interface ContextoPagina {
  projeto: Projeto;
  pagina: number;
  escala: number;
  ambientes: Map<string, Ambiente>;
}

interface Saida {
  alertas: Alerta[];
  derivados: Map<string, GeometriaDerivada>;
}

function ambienteDoPonto(ponto: PontoH, ambientes: Map<string, Ambiente>): Ambiente | null {
  const vinculado = ponto.vinculos.ambienteId ? ambientes.get(ponto.vinculos.ambienteId) : undefined;
  if (vinculado) return vinculado;
  const p = posicao(ponto);
  if (!p) return null;
  for (const a of ambientes.values()) {
    if (a.geometria.tipo === 'poligono' && pontoEmPoligono(p, a.geometria.pontos)) return a;
  }
  return null;
}

function maisProximo<T extends PontoH | Terminal>(candidatos: T[], alvo: Ponto): T | null {
  let melhor: T | null = null;
  let menor = Infinity;
  for (const c of candidatos) {
    const p = posicao(c);
    if (!p) continue;
    const d = distancia(p, alvo);
    if (d < menor) {
      menor = d;
      melhor = c;
    }
  }
  return melhor;
}

/**
 * Liga cada tubo desenhado (AF/AQ/esgoto) ao ponto que ele atende: vinculos.alvoId ou extremidade
 * dentro da tolerância. Retorna os tubos por `${pontoId}|${sistema}` e os tubos avulsos.
 */
function associarTubos(
  tubos: Tubo[],
  pontos: PontoH[],
  escala: number,
): { porPonto: Map<string, Tubo[]>; avulsos: Tubo[] } {
  const tolerancia = paraUnidades(TOLERANCIA_TUBO_PONTO_M, escala);
  const porPonto = new Map<string, Tubo[]>();
  const avulsos: Tubo[] = [];
  for (const tubo of tubos) {
    if (tubo.geometria.tipo !== 'polilinha' || tubo.geometria.pontos.length < 2) continue;
    const sistema = tubo.props.sistema;
    let alvo: PontoH | null = null;
    if (sistema !== 'pluvial') {
      const candidatos = pontos.filter((p) => pontoTemSistema(p, sistema));
      alvo = candidatos.find((p) => p.id === tubo.vinculos.alvoId) ?? null;
      if (!alvo) {
        const pts = tubo.geometria.pontos;
        let menor = tolerancia;
        for (const extremidade of [pts[0]!, pts[pts.length - 1]!]) {
          const proximo = maisProximo(candidatos, extremidade);
          const p = proximo && posicao(proximo);
          if (proximo && p && distancia(p, extremidade) <= menor) {
            menor = distancia(p, extremidade);
            alvo = proximo;
          }
        }
      }
    }
    if (alvo) {
      const chave = `${alvo.id}|${sistema}`;
      porPonto.set(chave, [...(porPonto.get(chave) ?? []), tubo]);
    } else {
      avulsos.push(tubo);
    }
  }
  return { porPonto, avulsos };
}

/**
 * Acumula em `acc` as quantidades de uma página para o conjunto de elementos informado.
 * `saida` (alertas e rotas derivadas) só é preenchida no cálculo com todos os elementos.
 */
function acumularPagina(
  acc: Acumulador,
  ctx: ContextoPagina,
  pontos: PontoH[],
  tubos: Tubo[],
  reservatorios: Terminal[],
  caixas: Terminal[],
  saida: Saida | null,
): void {
  const { projeto, pagina, escala } = ctx;
  const params = projeto.parametros.hidraulica;
  const sufixoPagina = projeto.totalPaginas > 1 ? ` (página ${pagina})` : '';
  const alertados = new Set<string>();
  const alertar = (campo: string, mensagem: string, elementoId?: string): void => {
    const chave = `${campo}|${elementoId ?? ''}`;
    if (!saida || alertados.has(chave)) return;
    alertados.add(chave);
    saida.alertas.push({ disciplina: 'hidraulica', campo, mensagem: mensagem + sufixoPagina, elementoId });
  };
  const metros = (rota: Ponto[]): number => paraMetros(comprimentoPolilinha(rota), escala);

  // --- grupos: pontos por ambiente (null = fora de qualquer ambiente)
  const grupos = new Map<Ambiente | null, PontoH[]>();
  for (const p of pontos) {
    if (!posicao(p)) continue;
    const ambiente = ambienteDoPonto(p, ctx.ambientes);
    grupos.set(ambiente, [...(grupos.get(ambiente) ?? []), p]);
  }

  // --- contagens que não dependem da tubulação: pontos, louças, metais, registros, ralos
  for (const [ambiente, doGrupo] of grupos) {
    for (const p of doGrupo) {
      const { aparelho } = p.props;
      somar(
        acc,
        { chave: `ponto:${aparelho}`, grupo: GRUPOS.pontos, descricao: `Ponto hidráulico — ${NOME_APARELHO[aparelho].toLowerCase()}`, unidade: 'un' },
        1,
        [p.id],
      );
      for (const sistema of SISTEMAS_REDE) {
        if (!pontoTemSistema(p, sistema)) continue;
        somar(
          acc,
          { chave: `ponto-sistema:${sistema}`, grupo: GRUPOS.pontos, descricao: `Ponto de ${NOME_SISTEMA[sistema]}`, unidade: 'un' },
          1,
          [p.id],
        );
      }
      for (const peca of LOUCAS_E_METAIS[aparelho]) {
        somar(
          acc,
          { chave: `louca:${peca.descricao}`, grupo: GRUPOS.loucas, descricao: peca.descricao, unidade: 'un' },
          peca.quantidade,
          [p.id],
        );
      }
      const dAF = diametroDoPonto(p, 'AF', params);
      somar(
        acc,
        { chave: `registro-pressao:${dAF}`, grupo: GRUPOS.registros, descricao: 'Registro de pressão', unidade: 'un', detalhe: detalheDiametro(dAF) },
        REGISTROS_PRESSAO[aparelho] ?? 0,
        [p.id],
      );
      if (aparelho === 'ralo') {
        somar(acc, { chave: 'ralo', grupo: GRUPOS.registros, descricao: 'Ralo', unidade: 'un' }, 1, [p.id]);
      }
    }
    if (!ambiente) continue;
    const comAF = doGrupo.filter((p) => p.props.aguaFria);
    if (comAF.length > 0) {
      const d = Math.max(...comAF.map((p) => diametroDoPonto(p, 'AF', params)));
      somar(
        acc,
        { chave: `registro-gaveta:${d}`, grupo: GRUPOS.registros, descricao: 'Registro de gaveta', unidade: 'un', detalhe: detalheDiametro(d) },
        REGISTROS_GAVETA_POR_AMBIENTE,
        comAF.map((p) => p.id),
      );
    }
    const ralos = doGrupo.filter((p) => p.props.aparelho === 'ralo');
    if (ralos.length > 0) {
      somar(
        acc,
        { chave: 'caixa-sifonada', grupo: GRUPOS.registros, descricao: 'Caixa sifonada', unidade: 'un' },
        CAIXAS_SIFONADAS_POR_AMBIENTE_COM_RALO,
        ralos.map((p) => p.id),
      );
    }
  }
  for (const caixa of caixas) {
    somar(acc, { chave: 'caixa-inspecao', grupo: GRUPOS.registros, descricao: 'Caixa de inspeção', unidade: 'un' }, 1, [caixa.id]);
  }

  // --- tubos desenhados pelo usuário
  const { porPonto: tubosPorPonto, avulsos } = associarTubos(tubos, pontos, escala);
  const somarTuboDesenhado = (tubo: Tubo, d: number, ids: string[]): void => {
    if (tubo.geometria.tipo !== 'polilinha') return;
    const sistema = tubo.props.sistema;
    somar(acc, metaTubo(sistema, d), metros(tubo.geometria.pontos), ids);
    somar(acc, metaConexao('joelho', sistema, d), contarMudancasDirecao(tubo.geometria.pontos), ids);
  };
  for (const tubo of avulsos) {
    const sistema = tubo.props.sistema;
    if (sistema === 'pluvial' && !params.pluvial) continue;
    const d =
      tubo.props.diametroMm ??
      (sistema === 'AF' ? params.diametroAFmm : sistema === 'AQ' ? params.diametroAQmm : null);
    if (d === null) {
      alertar('diametroMm', `${MENSAGENS.diametroTubo} de ${NOME_SISTEMA[sistema]}`, tubo.id);
      continue;
    }
    somarTuboDesenhado(tubo, d, [tubo.id]);
  }

  // --- rede automática: tronco + ramais + verticais, por ambiente e sistema
  const derivar = (id: string, pontosRota: Ponto[], status: Status, elementoId: string, rotulo?: string): void => {
    if (!saida || pontosRota.length < 2) return;
    const existente = saida.derivados.get(id);
    if (!existente) {
      saida.derivados.set(id, { id, disciplina: 'hidraulica', pagina, pontos: pontosRota, status, elementoId, rotulo });
    } else if (rotulo) {
      // AQ segue o mesmo traçado do AF: uma única linha na planta, com os dois rótulos.
      existente.rotulo = existente.rotulo ? `${existente.rotulo} + ${rotulo}` : rotulo;
    }
  };

  for (const [ambiente, doGrupo] of grupos) {
    for (const sistema of SISTEMAS_REDE) {
      const participantes = doGrupo.filter((p) => pontoTemSistema(p, sistema));
      if (participantes.length === 0) continue;
      const agua = sistema !== 'esgoto';
      const terminais = agua ? reservatorios : caixas;
      if (terminais.length === 0) {
        if (agua) alertar('reservatorio', MENSAGENS.reservatorio);
        else alertar('caixa-inspecao', MENSAGENS.caixaInspecao);
        continue;
      }
      let peDireito: number | null = null;
      if (agua) {
        peDireito = ambiente?.props.peDireito ?? projeto.parametros.gerais.peDireito;
        if (peDireito === null || !Number.isFinite(peDireito)) {
          alertar('peDireito', MENSAGENS.peDireito);
          continue;
        }
      }
      const idsGrupo = participantes.map((p) => p.id);
      const geometriaId = agua ? 'agua' : 'esgoto';
      const coluna =
        ambiente && ambiente.geometria.tipo === 'poligono' ? centroidePoligono(ambiente.geometria.pontos) : null;

      if (ambiente && coluna) {
        const terminal = maisProximo(terminais, coluna);
        const pTerminal = terminal && posicao(terminal);
        if (!terminal || !pTerminal) continue;
        const dTronco = Math.max(...participantes.map((p) => diametroDoPonto(p, sistema, params)));
        const tronco = agua ? rotaOrtogonal(pTerminal, coluna) : rotaOrtogonal(coluna, pTerminal);
        somar(acc, metaTubo(sistema, dTronco), metros(tronco), idsGrupo);
        somar(acc, metaConexao('joelho', sistema, dTronco), contarMudancasDirecao(tronco), idsGrupo);
        somar(acc, metaConexao('te', sistema, dTronco), participantes.length - 1, idsGrupo);
        const confirmados = participantes.filter((p) => p.status === 'confirmado');
        const statusTronco: Status =
          confirmados.length > 0 && terminal.status === 'confirmado' ? 'confirmado' : 'pendente';
        derivar(
          `${PREFIXO_ID}:${geometriaId}:tronco:${ambiente.id}`,
          tronco,
          statusTronco,
          (confirmados[0] ?? participantes[0]!).id,
          `${SIGLA_SISTEMA[sistema]} ${detalheDiametro(dTronco)}`,
        );
      }

      for (const p of participantes) {
        const pPonto = posicao(p)!;
        const terminal = maisProximo(terminais, coluna ?? pPonto);
        const origem = coluna ?? (terminal && posicao(terminal));
        if (!terminal || !origem) continue;
        const d = diametroDoPonto(p, sistema, params);
        const { aparelho } = p.props;
        const redesenhados = tubosPorPonto.get(`${p.id}|${sistema}`);
        if (redesenhados) {
          for (const tubo of redesenhados) somarTuboDesenhado(tubo, tubo.props.diametroMm ?? d, [p.id, tubo.id]);
        } else {
          const ramal = agua ? rotaOrtogonal(origem, pPonto) : rotaOrtogonal(pPonto, origem);
          somar(acc, metaTubo(sistema, d), metros(ramal), [p.id]);
          somar(acc, metaConexao('joelho', sistema, d), contarMudancasDirecao(ramal), [p.id]);
          const status: Status = p.status === 'confirmado' && terminal.status === 'confirmado' ? 'confirmado' : 'pendente';
          derivar(`${PREFIXO_ID}:${geometriaId}:ramal:${p.id}`, ramal, status, p.id);
        }
        const altura = params.alturaPontoM[aparelho];
        const vertical = agua
          ? Math.max(0, (peDireito ?? 0) - altura)
          : LIGACOES_APARELHO[aparelho].esgotoElevado
            ? altura
            : 0;
        if (vertical > 0) {
          somar(acc, metaTubo(sistema, d), vertical, [p.id]);
          somar(acc, metaConexao('joelho', sistema, d), JOELHOS_POR_TRANSICAO_VERTICAL, [p.id]);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- finalização e linhas

/** Arredonda os comprimentos e acrescenta barras e conexões diversas (derivadas dos totais). */
function finalizar(acc: Acumulador, params: ParametrosHidraulica): Acumulador {
  const final: Acumulador = new Map();
  const conexoesPorSistema = new Map<SistemaHidraulico, { quantidade: number; ids: Set<string> }>();
  for (const item of acc.values()) {
    const [tipo, sistema, diametro] = item.chave.split(':') as [string, SistemaHidraulico, string];
    if (tipo === 'tubo') {
      const m = arredondar(item.quantidade, CASAS_COMPRIMENTO);
      if (!(m > 0)) continue;
      final.set(item.chave, { ...item, quantidade: m });
      if (params.comprimentoBarraM > 0) {
        somar(
          final,
          metaBarra(sistema, Number(diametro), params.comprimentoBarraM),
          Math.ceil(arredondar(m / params.comprimentoBarraM, CASAS_GUARDA)),
          item.ids,
        );
      }
      continue;
    }
    final.set(item.chave, { ...item, quantidade: Math.ceil(arredondar(item.quantidade, CASAS_GUARDA)) });
    if (tipo === 'joelho' || tipo === 'te') {
      const total = conexoesPorSistema.get(sistema) ?? { quantidade: 0, ids: new Set<string>() };
      total.quantidade += item.quantidade;
      for (const id of item.ids) total.ids.add(id);
      conexoesPorSistema.set(sistema, total);
    }
  }
  for (const sistema of SISTEMAS) {
    const total = conexoesPorSistema.get(sistema);
    if (!total) continue;
    const diversas = Math.ceil(arredondar((total.quantidade * params.percentualConexoesDiversas) / 100, CASAS_GUARDA));
    somar(final, metaDiversas(sistema), diversas, total.ids);
  }
  return final;
}

function linha(item: Item, quantidade: number, status: Status, ids: string[]): LinhaQuantitativo {
  return {
    id: `${PREFIXO_ID}:${item.chave}:${status}`,
    disciplina: 'hidraulica',
    grupo: item.grupo,
    descricao: item.descricao,
    unidade: item.unidade,
    quantidade,
    status,
    elementoIds: ids,
    ehMaterial: item.grupo !== GRUPOS.pontos,
    ...(item.detalhe ? { detalhe: item.detalhe } : {}),
  };
}

/** Reservatório (L) = consumo per capita × nº de pessoas × dias de reserva. null se faltar o nº de pessoas. */
export function capacidadeReservatorioL(projeto: Projeto): number | null {
  const pessoas = projeto.parametros.gerais.numeroPessoas;
  if (pessoas === null || !Number.isFinite(pessoas)) return null;
  const { consumoPerCapitaL, diasReserva } = projeto.parametros.hidraulica;
  return consumoPerCapitaL * pessoas * diasReserva;
}

export function calcularHidraulica(projeto: Projeto): ResultadoDisciplina {
  const params = projeto.parametros.hidraulica;
  const alertas: Alerta[] = [];
  const derivados = new Map<string, GeometriaDerivada>();
  const accConfirmado: Acumulador = new Map();
  const accTudo: Acumulador = new Map();

  const paginas = new Set<number>();
  for (const e of projeto.elementos) if (e.disciplina === 'hidraulica') paginas.add(e.pagina);

  for (const pagina of [...paginas].sort((a, b) => a - b)) {
    const escala = projeto.paginas[pagina]?.escala;
    if (!escalaValida(escala)) {
      const sufixo = projeto.totalPaginas > 1 ? ` (página ${pagina})` : '';
      alertas.push({ disciplina: 'hidraulica', campo: 'escala', mensagem: MENSAGENS.escala + sufixo });
      continue;
    }
    const daPagina = projeto.elementos.filter((e) => e.pagina === pagina);
    const pontos = daPagina.filter((e): e is PontoH => e.tipo === 'ponto-hidraulico');
    const tubos = daPagina.filter((e): e is Tubo => e.tipo === 'tubo');
    const reservatorios = daPagina.filter((e): e is ElementoDe<'reservatorio'> => e.tipo === 'reservatorio');
    const caixas = daPagina.filter((e): e is ElementoDe<'caixa-inspecao'> => e.tipo === 'caixa-inspecao');
    const ambientes = new Map<string, Ambiente>();
    for (const e of daPagina) if (e.tipo === 'ambiente') ambientes.set(e.id, e);
    const ctx: ContextoPagina = { projeto, pagina, escala, ambientes };
    const confirmado = <T extends { status: Status }>(lista: T[]): T[] => lista.filter((e) => e.status === 'confirmado');
    // Com todos os elementos, o terminal confirmado tem preferência (mesma rota do cálculo confirmado).
    const preferirConfirmados = <T extends { status: Status }>(lista: T[]): T[] =>
      confirmado(lista).length > 0 ? confirmado(lista) : lista;

    acumularPagina(accConfirmado, ctx, confirmado(pontos), confirmado(tubos), confirmado(reservatorios), confirmado(caixas), null);
    const accPagina: Acumulador = new Map();
    acumularPagina(accPagina, ctx, pontos, tubos, preferirConfirmados(reservatorios), preferirConfirmados(caixas), {
      alertas,
      derivados,
    });
    for (const item of accPagina.values()) somar(accTudo, item, item.quantidade, item.ids);
    // Caixas pendentes fora da rota (havendo confirmadas) ainda contam como elementos pendentes.
    for (const caixa of caixas) {
      if (!preferirConfirmados(caixas).includes(caixa)) {
        somar(accTudo, { chave: 'caixa-inspecao', grupo: GRUPOS.registros, descricao: 'Caixa de inspeção', unidade: 'un' }, 1, [caixa.id]);
      }
    }
  }

  const confirmadas = finalizar(accConfirmado, params);
  const todas = finalizar(accTudo, params);
  const linhas: LinhaQuantitativo[] = [];
  for (const item of confirmadas.values()) linhas.push(linha(item, item.quantidade, 'confirmado', [...item.ids]));
  for (const item of todas.values()) {
    const base = confirmadas.get(item.chave);
    const diferenca = arredondar(item.quantidade - (base?.quantidade ?? 0), CASAS_COMPRIMENTO);
    if (!(diferenca > 0)) continue;
    const novos = [...item.ids].filter((id) => !base?.ids.has(id));
    linhas.push(linha(item, diferenca, 'pendente', novos.length > 0 ? novos : [...item.ids]));
  }

  // --- reservatório (capacidade)
  const capacidade = capacidadeReservatorioL(projeto);
  if (capacidade === null) {
    alertas.push({ disciplina: 'hidraulica', campo: 'numeroPessoas', mensagem: MENSAGENS.numeroPessoas });
  } else if (capacidade > 0) {
    const reservatorios = projeto.elementos.filter((e) => e.tipo === 'reservatorio');
    const status: Status = reservatorios.some((e) => e.status === 'confirmado') ? 'confirmado' : 'pendente';
    linhas.push({
      id: `${PREFIXO_ID}:reservatorio:capacidade`,
      disciplina: 'hidraulica',
      grupo: GRUPOS.reservatorio,
      descricao: "Reservatório (caixa d'água) — capacidade",
      unidade: 'L',
      quantidade: arredondar(capacidade, CASAS_COMPRIMENTO),
      status,
      elementoIds: reservatorios.map((e) => e.id),
      ehMaterial: true,
    });
  }

  const ordem = (l: LinhaQuantitativo): number => ORDEM_GRUPOS.indexOf(l.grupo);
  linhas.sort((a, b) => ordem(a) - ordem(b));
  return { linhas, alertas, derivados: [...derivados.values()] };
}
