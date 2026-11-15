/**
 * Importação de JSON (função PURA): o envelope do próprio app devolve o projeto inteiro; um JSON
 * externo com dados parciais vira elementos pendentes + a lista do que falta preencher.
 */
import type {
  Elemento,
  ElementoDe,
  PatchParametros,
  Ponto,
  Projeto,
  TipoAmbiente,
  TipoEsquadria,
} from '@/core/model';
import { escalaValida, paraUnidades } from '@/core/calc';
import { novoId } from '@/core/store';
import { classificarAmbiente, normalizarTexto } from './ambientes';
import {
  FORMATO_APP,
  MINIMO_VERTICES_POLIGONO,
  TIPOS_AMBIENTE,
  TIPOS_AREA_MOLHADA,
  VERSAO_ENVELOPE,
  VERSAO_PROJETO,
} from './config';

export interface ContextoJSON {
  /** Página (1-based) que recebe as geometrias. */
  pagina: number;
  /** Metros por unidade da página; null = página não calibrada (geometrias não são geradas). */
  escala: number | null;
}

export type ResultadoJSON =
  | { tipo: 'projeto'; projeto: Projeto; pendencias: string[] }
  | { tipo: 'parcial'; elementos: Elemento[]; esquadrias: TipoEsquadria[]; parametros: PatchParametros; pendencias: string[] }
  | { tipo: 'erro'; mensagem: string };

export const PENDENCIA_SEM_ESCALA = 'Calibre a escala da página para importar geometrias';

type Registro = Record<string, unknown>;

const ehRegistro = (v: unknown): v is Registro => typeof v === 'object' && v !== null && !Array.isArray(v);
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const positivo = (v: unknown): number | null => {
  const n = numero(v);
  return n !== null && n > 0 ? n : null;
};
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Lê [[x, y], ...] em metros; null se algum ponto for inválido. */
function lerPontos(v: unknown): Ponto[] | null {
  if (!Array.isArray(v)) return null;
  const pontos: Ponto[] = [];
  for (const item of v) {
    if (!Array.isArray(item)) return null;
    const x = numero(item[0]);
    const y = numero(item[1]);
    if (x === null || y === null) return null;
    pontos.push({ x, y });
  }
  return pontos;
}

// ---------------------------------------------------------------- projeto (envelope do app)

function importarProjeto(envelope: Registro): ResultadoJSON {
  if (envelope.versao !== VERSAO_ENVELOPE) {
    return { tipo: 'erro', mensagem: `Versão do arquivo não suportada (${String(envelope.versao)}). Este app lê a versão ${VERSAO_ENVELOPE}.` };
  }
  const projeto = envelope.projeto;
  if (!ehRegistro(projeto)) return { tipo: 'erro', mensagem: 'Arquivo do app incompleto: falta o campo "projeto".' };
  if (projeto.versao !== VERSAO_PROJETO) {
    return { tipo: 'erro', mensagem: `Versão do projeto não suportada (${String(projeto.versao)}).` };
  }
  if (!Array.isArray(projeto.elementos)) return { tipo: 'erro', mensagem: 'Projeto inválido: a lista de elementos está ausente.' };
  if (!ehRegistro(projeto.parametros) || !ehRegistro(projeto.parametros.gerais)) {
    return { tipo: 'erro', mensagem: 'Projeto inválido: os parâmetros estão ausentes.' };
  }
  if (!ehRegistro(projeto.paginas) || !Array.isArray(projeto.esquadrias) || !ehRegistro(projeto.camadas)) {
    return { tipo: 'erro', mensagem: 'Projeto inválido: páginas, esquadrias ou camadas estão ausentes.' };
  }

  const p = projeto as unknown as Projeto;
  const pendencias: string[] = [];
  if (p.arquivoNome) pendencias.push(`A planta não faz parte do JSON: carregue novamente o arquivo "${p.arquivoNome}".`);
  const pendentes = p.elementos.filter((e) => e.status === 'pendente').length;
  if (pendentes > 0) pendencias.push(`${pendentes} elemento(s) pendente(s): aceite ou descarte na árvore.`);
  const { peDireito, espessuraParede, numeroPessoas } = p.parametros.gerais;
  if (peDireito === null) pendencias.push('Pé-direito não informado');
  if (espessuraParede === null) pendencias.push('Espessura das paredes não informada');
  if (numeroPessoas === null) pendencias.push('Número de pessoas não informado');
  return { tipo: 'projeto', projeto: p, pendencias };
}

// ---------------------------------------------------------------- dados parciais (JSON externo)

const CHAVES_PARCIAIS = ['parametros', 'ambientes', 'paredes', 'esquadrias'] as const;

function importarParcial(dados: Registro, contexto: ContextoJSON): ResultadoJSON {
  const pendencias: string[] = [];
  const elementos: Elemento[] = [];
  const esquadrias: TipoEsquadria[] = [];
  const escala = escalaValida(contexto.escala) ? contexto.escala : null;
  let geometriaSemEscala = false;
  const base = { pagina: contexto.pagina, vinculos: {}, origem: 'importado', status: 'pendente' } as const;
  const paraPagina = (pontos: Ponto[], esc: number): Ponto[] =>
    pontos.map((p) => ({ x: paraUnidades(p.x, esc), y: paraUnidades(p.y, esc) }));

  // --- parâmetros gerais
  const entrada = ehRegistro(dados.parametros) ? dados.parametros : {};
  const gerais: NonNullable<PatchParametros['gerais']> = {};
  const lerParametro = (chave: 'peDireito' | 'espessuraParede' | 'numeroPessoas', rotulo: string): void => {
    if (entrada[chave] === undefined || entrada[chave] === null) {
      pendencias.push(`${rotulo}: não informado`);
      return;
    }
    const valor = positivo(entrada[chave]);
    if (valor === null) pendencias.push(`${rotulo}: valor inválido (${JSON.stringify(entrada[chave])})`);
    else gerais[chave] = valor;
  };
  lerParametro('peDireito', 'Pé-direito');
  lerParametro('espessuraParede', 'Espessura das paredes');
  lerParametro('numeroPessoas', 'Número de pessoas');
  const parametros: PatchParametros = Object.keys(gerais).length > 0 ? { gerais } : {};

  // --- ambientes
  lista(dados.ambientes).forEach((item, i) => {
    if (!ehRegistro(item)) {
      pendencias.push(`Ambiente ${i + 1}: item inválido — ignorado`);
      return;
    }
    const nomeLido = texto(item.nome);
    const nome = nomeLido ?? `Ambiente ${i + 1}`;
    if (nomeLido === null) pendencias.push(`${nome} sem nome`);

    // tipo: valor do contrato, palavra-chave no campo "tipo" ou, por último, dedução pelo nome
    let tipoAmbiente: TipoAmbiente = 'outro';
    const tipoLido = texto(item.tipo);
    const tipoNormalizado = tipoLido === null ? null : normalizarTexto(tipoLido).replace(/\s+/g, '-');
    const doContrato = TIPOS_AMBIENTE.find((t) => t === tipoNormalizado);
    const porPalavra = tipoLido === null ? null : classificarAmbiente(tipoLido);
    if (doContrato) tipoAmbiente = doContrato;
    else if (porPalavra) tipoAmbiente = porPalavra.tipo;
    else {
      const peloNome = nomeLido === null ? null : classificarAmbiente(nomeLido);
      if (peloNome) {
        tipoAmbiente = peloNome.tipo;
        pendencias.push(`${nome}: tipo do ambiente deduzido do nome — confira`);
      } else {
        pendencias.push(tipoLido === null ? `${nome}: falta o tipo do ambiente` : `${nome}: tipo "${tipoLido}" não reconhecido`);
      }
    }

    // geometria (metros): pontos ou retângulo largura × comprimento a partir de (x, y)
    let pontosM: Ponto[] | null = null;
    if (item.pontos !== undefined) {
      const lidos = lerPontos(item.pontos);
      if (lidos === null || lidos.length < MINIMO_VERTICES_POLIGONO) {
        pendencias.push(`${nome}: pontos inválidos (são necessários ao menos ${MINIMO_VERTICES_POLIGONO} pares [x, y])`);
        return;
      }
      pontosM = lidos;
    } else {
      const largura = positivo(item.largura);
      const comprimento = positivo(item.comprimento);
      if (largura !== null && comprimento !== null) {
        const x = numero(item.x) ?? 0;
        const y = numero(item.y) ?? 0;
        pontosM = [
          { x, y },
          { x: x + largura, y },
          { x: x + largura, y: y + comprimento },
          { x, y: y + comprimento },
        ];
      }
    }
    if (pontosM === null) {
      pendencias.push(`${nome}: falta a geometria`);
      return;
    }
    if (escala === null) {
      geometriaSemEscala = true;
      return;
    }
    const ambiente: ElementoDe<'ambiente'> = {
      ...base,
      id: novoId(),
      tipo: 'ambiente',
      disciplina: 'arquitetura',
      geometria: { tipo: 'poligono', pontos: paraPagina(pontosM, escala) },
      rotulo: nome,
      props: { nome, tipoAmbiente, areaMolhada: TIPOS_AREA_MOLHADA.includes(tipoAmbiente), coberto: true },
    };
    elementos.push(ambiente);
  });

  // --- paredes
  lista(dados.paredes).forEach((item, i) => {
    const nome = `Parede ${i + 1}`;
    if (!ehRegistro(item)) {
      pendencias.push(`${nome}: item inválido — ignorado`);
      return;
    }
    const pontosM = lerPontos(item.pontos);
    if (pontosM === null || pontosM.length < 2) {
      pendencias.push(`${nome}: falta a geometria`);
      return;
    }
    // sem espessura própria vale a espessura padrão informada NO MESMO arquivo; senão fica em branco
    const espessura = positivo(item.espessura) ?? gerais.espessuraParede ?? null;
    if (espessura === null) pendencias.push(`${nome}: falta a espessura`);
    if (escala === null) {
      geometriaSemEscala = true;
      return;
    }
    const parede: ElementoDe<'parede'> = {
      ...base,
      id: novoId(),
      tipo: 'parede',
      disciplina: 'arquitetura',
      geometria: { tipo: 'polilinha', pontos: paraPagina(pontosM, escala) },
      props: { espessura },
    };
    elementos.push(parede);
  });

  // --- esquadrias (cadastro de tipos)
  lista(dados.esquadrias).forEach((item, i) => {
    if (!ehRegistro(item)) {
      pendencias.push(`Esquadria ${i + 1}: item inválido — ignorada`);
      return;
    }
    const codigo = texto(item.codigo);
    const nome = `Esquadria ${codigo ?? i + 1}`;
    const inicial = codigo?.charAt(0).toUpperCase();
    const categoria =
      item.categoria === 'porta' || item.categoria === 'janela'
        ? item.categoria
        : inicial === 'P'
          ? 'porta'
          : inicial === 'J'
            ? 'janela'
            : null;
    if (categoria === null) {
      pendencias.push(`${nome}: falta a categoria (porta ou janela) — não importada`);
      return;
    }
    if (codigo === null) pendencias.push(`${nome}: falta o código`);
    const faltas: string[] = [];
    const dimensao = (chave: string, rotulo: string, aceitaZero = false): number => {
      const n = numero(item[chave]);
      if (n !== null && (n > 0 || (aceitaZero && n === 0))) return n;
      faltas.push(rotulo);
      return 0;
    };
    const largura = dimensao('largura', 'largura');
    const altura = dimensao('altura', 'altura');
    const peitoril = categoria === 'porta' && item.peitoril === undefined ? 0 : dimensao('peitoril', 'peitoril', true);
    const quantidade = dimensao('quantidade', 'quantidade', true);
    if (faltas.length > 0) pendencias.push(`${nome}: falta ${faltas.join(', ')} (ficou 0 — preencha no cadastro de esquadrias)`);
    esquadrias.push({ id: novoId(), codigo: codigo ?? `${categoria === 'porta' ? 'P' : 'J'}?${i + 1}`, categoria, largura, altura, peitoril, quantidade });
  });

  if (geometriaSemEscala) pendencias.unshift(PENDENCIA_SEM_ESCALA);
  return { tipo: 'parcial', elementos, esquadrias, parametros, pendencias };
}

// ---------------------------------------------------------------- entrada

export function importarJSON(textoJson: string, contexto: ContextoJSON): ResultadoJSON {
  let dados: unknown;
  try {
    dados = JSON.parse(textoJson);
  } catch {
    return { tipo: 'erro', mensagem: 'JSON inválido: o arquivo não pôde ser lido. Confira se é um .json bem formado.' };
  }
  if (!ehRegistro(dados)) return { tipo: 'erro', mensagem: 'JSON inválido: o conteúdo deve ser um objeto.' };
  if (dados.formato === FORMATO_APP) return importarProjeto(dados);
  if (!CHAVES_PARCIAIS.some((chave) => chave in dados)) {
    return {
      tipo: 'erro',
      mensagem: 'JSON não reconhecido: esperado um arquivo exportado por este app ou os campos "parametros", "ambientes", "paredes" e "esquadrias".',
    };
  }
  return importarParcial(dados, contexto);
}
