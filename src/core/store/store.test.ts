import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parametrosPadrao } from '@/core/model';
import type { Disciplina, Elemento, ElementoDe, Origem, Status, TipoEsquadria } from '@/core/model';
import { DEBOUNCE_SALVAMENTO_MS, LIMITE_HISTORICO } from './config';
import { criarPersistenciaMemoria } from './persistencia';
import type { Persistencia } from './persistencia';
import { criarStore, novoId } from './store';

function pilar(id: string, extra: Partial<ElementoDe<'pilar'>> = {}): Elemento {
  return {
    id,
    tipo: 'pilar',
    disciplina: 'estrutura',
    pagina: 1,
    geometria: { tipo: 'ponto', ponto: { x: 10, y: 20 } },
    vinculos: {},
    origem: 'desenhado',
    status: 'confirmado',
    props: { secaoB: 0.14, secaoH: 0.3 },
    ...extra,
  };
}

function parede(id: string, origem: Origem = 'desenhado', status: Status = 'confirmado', pagina = 1): Elemento {
  return {
    id,
    tipo: 'parede',
    disciplina: 'arquitetura',
    pagina,
    geometria: { tipo: 'polilinha', pontos: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
    vinculos: {},
    origem,
    status,
    props: { espessura: 0.15 },
  };
}

const sugestao = (id: string, pagina = 1, disciplina: Disciplina = 'estrutura') =>
  pilar(id, { origem: 'sugerido-auto', status: 'pendente', pagina, disciplina });

const ids = (els: Elemento[]) => els.map((e) => e.id);

async function storePronta(persistencia: Persistencia = criarPersistenciaMemoria()) {
  const store = criarStore(persistencia);
  await store.getState().inicializar();
  return store;
}

const aguardarSalvamento = () => vi.advanceTimersByTimeAsync(DEBOUNCE_SALVAMENTO_MS + 1);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('persistência', () => {
  it('levantamento persiste depois do reload', async () => {
    const persistencia = criarPersistenciaMemoria();
    const a = await storePronta(persistencia);
    const bytes = new Uint8Array([37, 80, 68, 70, 1, 2, 3]);
    a.getState().definirPdf('planta.pdf', bytes, 3);
    a.getState().definirNome('Casa 1');
    a.getState().definirDimensoesPagina(2, 800, 600);
    a.getState().calibrarPagina(2, 0.0125);
    a.getState().adicionarElementos([pilar('p1'), parede('w1')]);
    a.getState().atualizarParametros({ gerais: { peDireito: 2.8 } });
    a.getState().salvarEsquadria({ id: 'e1', codigo: 'P1', categoria: 'porta', largura: 0.8, altura: 2.1, peitoril: 0, quantidade: 2 });
    a.getState().definirPagina(2);
    a.getState().definirFerramenta({ modo: 'parede' });
    a.getState().selecionar(['p1']);
    await aguardarSalvamento();

    const b = criarStore(persistencia);
    expect(b.getState().carregado).toBe(false);
    await b.getState().inicializar();
    const sb = b.getState();
    expect(sb.carregado).toBe(true);
    expect(sb.projeto).toEqual(a.getState().projeto);
    expect(ids(sb.projeto.elementos)).toEqual(['p1', 'w1']);
    expect(sb.projeto.paginas[2]).toEqual({ escala: 0.0125, largura: 800, altura: 600 });
    expect(sb.projeto.parametros.gerais.peDireito).toBe(2.8);
    expect(sb.projeto.arquivoNome).toBe('planta.pdf');
    expect(sb.projeto.totalPaginas).toBe(3);
    expect(sb.pdfDados).toEqual(bytes);
    expect(sb.paginaAtual).toBe(2);
    // estado de UI não é persistido
    expect(sb.ferramenta).toEqual({ modo: 'selecionar' });
    expect(sb.selecaoIds).toEqual([]);
    expect(sb.podeDesfazer).toBe(false);
  });

  it('salva com debounce: várias mudanças seguidas geram uma gravação', async () => {
    const persistencia = criarPersistenciaMemoria();
    const salvar = vi.spyOn(persistencia, 'salvarProjeto');
    const store = await storePronta(persistencia);
    store.getState().adicionarElementos([pilar('p1')]);
    store.getState().adicionarElementos([pilar('p2')]);
    store.getState().definirNome('X');
    expect(salvar).not.toHaveBeenCalled();
    await aguardarSalvamento();
    expect(salvar).toHaveBeenCalledTimes(1);
    // mudança só de UI não grava
    store.getState().selecionar(['p1']);
    store.getState().definirFerramenta({ modo: 'pan' });
    await aguardarSalvamento();
    expect(salvar).toHaveBeenCalledTimes(1);
  });

  it('inicializar sem dados salvos → projeto vazio e carregado = true', async () => {
    const store = criarStore(criarPersistenciaMemoria());
    expect(store.getState().carregado).toBe(false);
    await store.getState().inicializar();
    const s = store.getState();
    expect(s.carregado).toBe(true);
    expect(s.projeto.elementos).toEqual([]);
    expect(s.projeto.arquivoNome).toBeNull();
    expect(s.projeto.parametros).toEqual(parametrosPadrao());
    expect(s.pdfDados).toBeNull();
    expect(s.paginaAtual).toBe(1);
    expect(s.ferramenta).toEqual({ modo: 'selecionar' });
  });

  it('persistência que lança erro não quebra: segue em memória', async () => {
    const falha = () => Promise.reject(new Error('IndexedDB indisponível'));
    const quebrada: Persistencia = { carregar: falha, salvarProjeto: falha, salvarPdf: falha, limpar: falha };
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = criarStore(quebrada);
    await expect(store.getState().inicializar()).resolves.toBeUndefined();
    expect(store.getState().carregado).toBe(true);
    store.getState().adicionarElementos([pilar('p1')]);
    store.getState().definirPdf('a.pdf', new Uint8Array([1]), 1);
    await aguardarSalvamento();
    expect(ids(store.getState().projeto.elementos)).toEqual(['p1']);
    await expect(store.getState().novoProjeto()).resolves.toBeUndefined();
    expect(store.getState().projeto.elementos).toEqual([]);
    expect(aviso).toHaveBeenCalled();
  });

  it('novoProjeto zera o projeto e o PDF persistidos', async () => {
    const persistencia = criarPersistenciaMemoria();
    const a = await storePronta(persistencia);
    const idAntigo = a.getState().projeto.id;
    a.getState().definirPdf('planta.pdf', new Uint8Array([1, 2]), 1);
    a.getState().adicionarElementos([pilar('p1')]);
    a.getState().selecionar(['p1']);
    await aguardarSalvamento();
    a.getState().adicionarElementos([pilar('p2')]); // gravação pendente é cancelada
    await a.getState().novoProjeto();
    await aguardarSalvamento();
    const sa = a.getState();
    expect(sa.projeto.id).not.toBe(idAntigo);
    expect(sa.projeto.elementos).toEqual([]);
    expect(sa.pdfDados).toBeNull();
    expect(sa.selecaoIds).toEqual([]);
    expect(sa.podeDesfazer).toBe(false);

    const b = await storePronta(persistencia);
    expect(b.getState().projeto.elementos).toEqual([]);
    expect(b.getState().projeto.arquivoNome).toBeNull();
    expect(b.getState().pdfDados).toBeNull();
  });

  it('carregarProjeto substitui o projeto inteiro e limpa histórico e seleção', async () => {
    const store = await storePronta();
    store.getState().adicionarElementos([pilar('p1')]);
    store.getState().selecionar(['p1']);
    const importado = { ...store.getState().projeto, id: 'importado', nome: 'Importado', elementos: [parede('w9')] };
    store.getState().carregarProjeto(importado);
    const s = store.getState();
    expect(s.projeto).toEqual(importado);
    expect(s.selecaoIds).toEqual([]);
    expect(s.podeDesfazer).toBe(false);
    expect(s.paginaAtual).toBe(1);
  });
});

describe('PDF, páginas e UI', () => {
  it('definirPdf troca o arquivo sem apagar páginas/elementos e volta para a página 1', async () => {
    const store = await storePronta();
    store.getState().definirPdf('a.pdf', new Uint8Array([1]), 5);
    store.getState().calibrarPagina(1, 0.01);
    store.getState().adicionarElementos([pilar('p1')]);
    store.getState().definirPagina(4);
    expect(store.getState().paginaAtual).toBe(4);
    const outro = new Uint8Array([9, 9]);
    store.getState().definirPdf('b.pdf', outro, 2);
    const s = store.getState();
    expect(s.projeto.arquivoNome).toBe('b.pdf');
    expect(s.projeto.totalPaginas).toBe(2);
    expect(s.pdfDados).toBe(outro);
    expect(s.paginaAtual).toBe(1);
    expect(s.projeto.paginas[1].escala).toBe(0.01);
    expect(ids(s.projeto.elementos)).toEqual(['p1']);
  });

  it('definirPagina limita ao intervalo de páginas', async () => {
    const store = await storePronta();
    store.getState().definirPdf('a.pdf', new Uint8Array([1]), 3);
    store.getState().definirPagina(99);
    expect(store.getState().paginaAtual).toBe(3);
    store.getState().definirPagina(0);
    expect(store.getState().paginaAtual).toBe(1);
  });

  it('definirDimensoesPagina e calibrarPagina criam a entrada da página', async () => {
    const store = await storePronta();
    store.getState().definirDimensoesPagina(1, 595, 842);
    expect(store.getState().projeto.paginas[1]).toEqual({ escala: null, largura: 595, altura: 842 });
    expect(store.getState().podeDesfazer).toBe(false);
    store.getState().calibrarPagina(2, 0.02);
    expect(store.getState().projeto.paginas[2]).toEqual({ escala: 0.02 });
    store.getState().calibrarPagina(1, 0.05);
    expect(store.getState().projeto.paginas[1]).toEqual({ escala: 0.05, largura: 595, altura: 842 });
  });

  it('definirNome, definirCamada, definirComposicoes, ferramenta e seleção', async () => {
    const store = await storePronta();
    const antes = store.getState().projeto;
    store.getState().definirNome('Sobrado');
    store.getState().definirCamada('eletrica', false);
    store.getState().definirComposicoes([{ id: 'c1', servico: 'concreto', insumos: [] }]);
    store.getState().definirFerramenta({ modo: 'ponto', alvo: { tipo: 'pilar', props: { secaoB: 0.2, secaoH: 0.2 } } });
    store.getState().selecionar(['a', 'b']);
    const s = store.getState();
    expect(s.projeto.nome).toBe('Sobrado');
    expect(s.projeto.camadas).toEqual({ ...antes.camadas, eletrica: false });
    expect(s.projeto.composicoes).toHaveLength(1);
    expect(s.ferramenta.modo).toBe('ponto');
    expect(s.selecaoIds).toEqual(['a', 'b']);
    // imutável: o objeto anterior não foi alterado
    expect(antes.nome).toBe('Novo levantamento');
    expect(antes.camadas.eletrica).toBe(true);
    store.getState().definirComposicoes(null);
    expect(store.getState().projeto.composicoes).toBeNull();
  });

  it('toda alteração do projeto atualiza atualizadoEm', async () => {
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
    const store = await storePronta();
    vi.setSystemTime(new Date('2026-01-01T11:00:00Z'));
    store.getState().adicionarElementos([pilar('p1')]);
    expect(store.getState().projeto.atualizadoEm).toBe('2026-01-01T11:00:00.000Z');
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    store.getState().atualizarParametros({ gerais: { numeroPessoas: 4 } });
    expect(store.getState().projeto.atualizadoEm).toBe('2026-01-01T12:00:00.000Z');
    expect(store.getState().projeto.criadoEm).toBe('2026-01-01T10:00:00.000Z');
  });
});

describe('elementos', () => {
  it('adiciona, atualiza (merge raso de props) e remove', async () => {
    const store = await storePronta();
    store.getState().adicionarElementos([pilar('p1'), pilar('p2'), parede('w1')]);
    const antes = store.getState().projeto.elementos;
    store.getState().atualizarElemento('p1', { rotulo: 'P1', props: { secaoB: 0.2 } });
    const p1 = store.getState().projeto.elementos[0];
    expect(p1).toMatchObject({ id: 'p1', tipo: 'pilar', rotulo: 'P1', props: { secaoB: 0.2, secaoH: 0.3 } });
    // imutabilidade: novo array, elemento alterado é novo, os demais mantêm a referência
    expect(store.getState().projeto.elementos).not.toBe(antes);
    expect(antes[0]).toMatchObject({ props: { secaoB: 0.14 } });
    expect(antes[0].rotulo).toBeUndefined();
    expect(store.getState().projeto.elementos[1]).toBe(antes[1]);

    store.getState().atualizarElemento('p2', { status: 'pendente', manuais: { altura: 3 } });
    expect(store.getState().projeto.elementos[1]).toMatchObject({ status: 'pendente', manuais: { altura: 3 }, props: { secaoB: 0.14, secaoH: 0.3 } });

    store.getState().selecionar(['p1', 'w1']);
    store.getState().removerElementos(['p1', 'inexistente']);
    expect(ids(store.getState().projeto.elementos)).toEqual(['p2', 'w1']);
    expect(store.getState().selecaoIds).toEqual(['w1']);
  });

  it('ações sem efeito não criam passo no histórico', async () => {
    const store = await storePronta();
    store.getState().adicionarElementos([]);
    store.getState().atualizarElemento('nao-existe', { rotulo: 'x' });
    store.getState().removerElementos(['nao-existe']);
    store.getState().confirmarPendentes();
    store.getState().descartarPendentes();
    store.getState().substituirSugestoes('estrutura', []);
    expect(store.getState().podeDesfazer).toBe(false);
  });

  it('confirmarElementos: pendente → confirmado somente nos ids pedidos', async () => {
    const store = await storePronta();
    store.getState().adicionarElementos([sugestao('s1'), sugestao('s2'), pilar('p1')]);
    store.getState().confirmarElementos(['s1', 'p1']);
    expect(store.getState().projeto.elementos.map((e) => e.status)).toEqual(['confirmado', 'pendente', 'confirmado']);
    expect(store.getState().projeto.elementos[0].origem).toBe('sugerido-auto');
  });

  it('confirmarPendentes com e sem disciplina', async () => {
    const store = await storePronta();
    store.getState().adicionarElementos([sugestao('s1'), parede('w1', 'importado', 'pendente'), sugestao('s2')]);
    store.getState().confirmarPendentes('estrutura');
    expect(store.getState().projeto.elementos.map((e) => e.status)).toEqual(['confirmado', 'pendente', 'confirmado']);
    store.getState().confirmarPendentes();
    expect(store.getState().projeto.elementos.every((e) => e.status === 'confirmado')).toBe(true);
  });

  it('descartarPendentes com e sem disciplina', async () => {
    const store = await storePronta();
    const base = [sugestao('s1'), parede('w1', 'importado', 'pendente'), pilar('p1'), parede('w2')];
    store.getState().adicionarElementos(base);
    store.getState().selecionar(['s1', 'p1']);
    store.getState().descartarPendentes('estrutura');
    expect(ids(store.getState().projeto.elementos)).toEqual(['w1', 'p1', 'w2']);
    expect(store.getState().selecaoIds).toEqual(['p1']);
    store.getState().descartarPendentes();
    expect(ids(store.getState().projeto.elementos)).toEqual(['p1', 'w2']);
  });

  it('substituirSugestoes remove só os sugerido-auto pendentes da disciplina', async () => {
    const store = await storePronta();
    store.getState().adicionarElementos([
      sugestao('auto-pend-p1', 1),
      sugestao('auto-pend-p2', 2),
      pilar('auto-conf', { origem: 'sugerido-auto', status: 'confirmado' }),
      pilar('desenhado'),
      pilar('desenhado-pend', { status: 'pendente' }),
      pilar('importado-pend', { origem: 'importado', status: 'pendente' }),
      parede('arq-auto-pend', 'sugerido-auto', 'pendente'),
    ]);
    store.getState().substituirSugestoes('estrutura', [sugestao('novo1'), sugestao('novo2', 2)]);
    expect(ids(store.getState().projeto.elementos)).toEqual([
      'auto-conf',
      'desenhado',
      'desenhado-pend',
      'importado-pend',
      'arq-auto-pend',
      'novo1',
      'novo2',
    ]);
    // um único passo de histórico
    store.getState().desfazer();
    expect(ids(store.getState().projeto.elementos)).toContain('auto-pend-p1');
    expect(ids(store.getState().projeto.elementos)).not.toContain('novo1');
  });

  it('substituirSugestoes com página só troca as sugestões daquela página', async () => {
    const store = await storePronta();
    store.getState().adicionarElementos([sugestao('a1', 1), sugestao('a2', 2), parede('w', 'sugerido-auto', 'pendente', 2)]);
    store.getState().substituirSugestoes('estrutura', [sugestao('b2', 2)], 2);
    expect(ids(store.getState().projeto.elementos)).toEqual(['a1', 'w', 'b2']);
    store.getState().substituirSugestoes('estrutura', [], 1);
    expect(ids(store.getState().projeto.elementos)).toEqual(['w', 'b2']);
  });
});

describe('desfazer / refazer', () => {
  it('restaura elementos e calibração, com as flags corretas', async () => {
    const store = await storePronta();
    const s = () => store.getState();
    expect([s().podeDesfazer, s().podeRefazer]).toEqual([false, false]);

    s().adicionarElementos([pilar('p1')]);
    s().calibrarPagina(1, 0.01);
    s().adicionarElementos([pilar('p2')]);
    s().atualizarElemento('p1', { props: { secaoB: 0.25 } });
    expect([s().podeDesfazer, s().podeRefazer]).toEqual([true, false]);

    s().desfazer(); // atualização
    expect(s().projeto.elementos[0]).toMatchObject({ props: { secaoB: 0.14 } });
    expect([s().podeDesfazer, s().podeRefazer]).toEqual([true, true]);
    s().desfazer(); // p2
    expect(ids(s().projeto.elementos)).toEqual(['p1']);
    expect(s().projeto.paginas[1].escala).toBe(0.01);
    s().desfazer(); // calibração
    expect(s().projeto.paginas[1].escala).toBeNull();
    s().desfazer(); // p1
    expect(s().projeto.elementos).toEqual([]);
    expect([s().podeDesfazer, s().podeRefazer]).toEqual([false, true]);
    s().desfazer(); // nada a desfazer
    expect(s().projeto.elementos).toEqual([]);

    s().refazer();
    s().refazer();
    expect(ids(s().projeto.elementos)).toEqual(['p1']);
    expect(s().projeto.paginas[1].escala).toBe(0.01);
    s().refazer();
    s().refazer();
    expect(ids(s().projeto.elementos)).toEqual(['p1', 'p2']);
    expect(s().projeto.elementos[0]).toMatchObject({ props: { secaoB: 0.25 } });
    expect([s().podeDesfazer, s().podeRefazer]).toEqual([true, false]);
    s().refazer(); // nada a refazer
    expect(ids(s().projeto.elementos)).toEqual(['p1', 'p2']);
  });

  it('uma nova ação limpa a pilha de refazer', async () => {
    const store = await storePronta();
    store.getState().adicionarElementos([pilar('p1')]);
    store.getState().adicionarElementos([pilar('p2')]);
    store.getState().desfazer();
    expect(store.getState().podeRefazer).toBe(true);
    store.getState().adicionarElementos([pilar('p3')]);
    expect(store.getState().podeRefazer).toBe(false);
    store.getState().refazer();
    expect(ids(store.getState().projeto.elementos)).toEqual(['p1', 'p3']);
  });

  it('desfazer tira da seleção o que deixou de existir e preserva dimensões e o resto do projeto', async () => {
    const store = await storePronta();
    store.getState().calibrarPagina(1, 0.01);
    store.getState().adicionarElementos([pilar('p1')]);
    store.getState().selecionar(['p1']);
    store.getState().definirDimensoesPagina(1, 595, 842);
    store.getState().definirNome('Mantido');
    store.getState().desfazer();
    const s = store.getState();
    expect(s.projeto.elementos).toEqual([]);
    expect(s.selecaoIds).toEqual([]);
    expect(s.projeto.paginas[1]).toEqual({ escala: 0.01, largura: 595, altura: 842 });
    expect(s.projeto.nome).toBe('Mantido');
  });

  it('o histórico respeita o limite configurado', async () => {
    const store = await storePronta();
    for (let i = 0; i < LIMITE_HISTORICO + 5; i++) store.getState().adicionarElementos([pilar(`p${i}`)]);
    for (let i = 0; i < LIMITE_HISTORICO + 5; i++) store.getState().desfazer();
    expect(store.getState().projeto.elementos).toHaveLength(5);
    expect(store.getState().podeDesfazer).toBe(false);
  });
});

describe('cadastros e parâmetros', () => {
  it('atualizarParametros faz deep merge', async () => {
    const store = await storePronta();
    const antes = store.getState().projeto.parametros;
    store.getState().atualizarParametros({ estrutura: { pilar: { secaoB: 0.2 } } });
    store.getState().atualizarParametros({
      gerais: { peDireito: 2.7 },
      eletrica: { potenciaTUE: { chuveiro: 7500 } },
      estrutura: { aco: { detalhado: { bitolaEstriboMm: 6.3 } } },
    });
    const esperado = parametrosPadrao();
    esperado.estrutura.pilar.secaoB = 0.2;
    esperado.gerais.peDireito = 2.7;
    esperado.eletrica.potenciaTUE.chuveiro = 7500;
    esperado.estrutura.aco.detalhado.bitolaEstriboMm = 6.3;
    expect(store.getState().projeto.parametros).toEqual(esperado);
    expect(store.getState().projeto.parametros.estrutura.pilar).toEqual({ secaoB: 0.2, secaoH: 0.3 });
    // imutável, e o que não mudou mantém a referência
    expect(antes).toEqual(parametrosPadrao());
    expect(store.getState().projeto.parametros.hidraulica).toBe(antes.hidraulica);
    // null é um valor válido (volta a "dado faltante")
    store.getState().atualizarParametros({ gerais: { peDireito: null } });
    expect(store.getState().projeto.parametros.gerais).toEqual({ peDireito: null, espessuraParede: null, numeroPessoas: null });
  });

  it('salvarEsquadria insere e atualiza; removerEsquadria remove', async () => {
    const store = await storePronta();
    const p1: TipoEsquadria = { id: 'e1', codigo: 'P1', categoria: 'porta', largura: 0.8, altura: 2.1, peitoril: 0, quantidade: 3 };
    const j1: TipoEsquadria = { id: 'e2', codigo: 'J1', categoria: 'janela', largura: 1.2, altura: 1, peitoril: 1.1, quantidade: 2 };
    store.getState().salvarEsquadria(p1);
    store.getState().salvarEsquadria(j1);
    expect(store.getState().projeto.esquadrias).toEqual([p1, j1]);
    store.getState().salvarEsquadria({ ...p1, largura: 0.9 });
    expect(store.getState().projeto.esquadrias).toEqual([{ ...p1, largura: 0.9 }, j1]);
    store.getState().removerEsquadria('e1');
    expect(store.getState().projeto.esquadrias).toEqual([j1]);
  });
});

describe('novoId', () => {
  it('gera ids únicos', () => {
    const gerados = new Set(Array.from({ length: 200 }, () => novoId()));
    expect(gerados.size).toBe(200);
  });
});

describe('compatibilidade com projetos antigos (parâmetros novos)', () => {
  /** Projeto como era salvo antes de existir parametros.estrutura.cobertura. */
  function projetoAntigo() {
    const projeto = structuredClone(criarStore(criarPersistenciaMemoria()).getState().projeto);
    projeto.atualizadoEm = '2025-05-05T05:05:05.000Z';
    projeto.parametros.gerais.espessuraParede = 0.15; // salvo
    projeto.parametros.estrutura.pilar.secaoB = 0.2; // salvo
    delete (projeto.parametros.estrutura as Partial<typeof projeto.parametros.estrutura>).cobertura;
    return projeto;
  }

  function conferir(parametros: ReturnType<typeof parametrosPadrao>) {
    const padrao = parametrosPadrao();
    expect(parametros.estrutura.cobertura).toEqual(padrao.estrutura.cobertura);
    expect(parametros.estrutura.pilar).toEqual({ secaoB: 0.2, secaoH: 0.3 });
    expect(parametros.gerais).toEqual({ peDireito: null, espessuraParede: 0.15, numeroPessoas: null });
  }

  it('inicializar completa os parâmetros sem marcar o projeto como alterado', async () => {
    const persistencia = criarPersistenciaMemoria();
    const salvar = vi.spyOn(persistencia, 'salvarProjeto');
    const antigo = projetoAntigo();
    await persistencia.salvarProjeto(antigo, 1);
    salvar.mockClear();
    const store = await storePronta(persistencia);
    const { projeto } = store.getState();
    conferir(projeto.parametros);
    expect(projeto.atualizadoEm).toBe(antigo.atualizadoEm);
    expect(projeto.elementos).toEqual(antigo.elementos);
    await aguardarSalvamento();
    expect(salvar).not.toHaveBeenCalled();
  });

  it('carregarProjeto completa os parâmetros de um JSON antigo', async () => {
    const store = await storePronta();
    const antigo = projetoAntigo();
    store.getState().carregarProjeto(antigo);
    conferir(store.getState().projeto.parametros);
    expect(store.getState().projeto.atualizadoEm).toBe(antigo.atualizadoEm);
    expect(antigo.parametros.estrutura.cobertura).toBeUndefined(); // entrada não é mutada
  });

  it('valores salvos em cobertura vencem o padrão', async () => {
    const store = await storePronta();
    const projeto = structuredClone(store.getState().projeto);
    projeto.parametros.estrutura.cobertura.beiral = 1;
    projeto.parametros.estrutura.cobertura.alturaCondutor = 3;
    store.getState().carregarProjeto(projeto);
    expect(store.getState().projeto.parametros.estrutura.cobertura).toMatchObject({ beiral: 1, alturaCondutor: 3 });
  });
});
