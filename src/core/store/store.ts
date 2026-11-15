import { create } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';
import { projetoVazio } from '@/core/model';
import type {
  Disciplina,
  Elemento,
  LevantamentoStore,
  PaginaInfo,
  Parametros,
  PatchParametros,
  Projeto,
} from '@/core/model';
import { DEBOUNCE_SALVAMENTO_MS, LIMITE_HISTORICO, PAGINA_INICIAL } from './config';
import type { Persistencia } from './persistencia';

export function novoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

const agora = (): string => new Date().toISOString();

type Paginas = Record<number, PaginaInfo>;

/** Passo do histórico: o que as ações de elementos e a calibração alteram. */
interface Snapshot {
  elementos: Elemento[];
  paginas: Paginas;
}

function ehObjetoSimples(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** Mescla profunda imutável; arrays e valores simples são substituídos, `undefined` é ignorado. */
function mesclarProfundo<T>(base: T, patch: unknown): T {
  if (!ehObjetoSimples(base) || !ehObjetoSimples(patch)) return base;
  const resultado: Record<string, unknown> = { ...base };
  for (const [chave, valor] of Object.entries(patch)) {
    if (valor === undefined) continue;
    const atual = resultado[chave];
    resultado[chave] = ehObjetoSimples(atual) && ehObjetoSimples(valor) ? mesclarProfundo(atual, valor) : valor;
  }
  return resultado as T;
}

/** Restaura as escalas do snapshot sem perder dimensões de página medidas depois dele. */
function restaurarPaginas(atuais: Paginas, salvas: Paginas): Paginas {
  const resultado: Paginas = {};
  for (const chave of new Set([...Object.keys(atuais), ...Object.keys(salvas)])) {
    const pagina = Number(chave);
    resultado[pagina] = { ...salvas[pagina], ...atuais[pagina], escala: salvas[pagina]?.escala ?? null };
  }
  return resultado;
}

export function criarStore(persistencia: Persistencia): UseBoundStore<StoreApi<LevantamentoStore>> {
  let passado: Snapshot[] = [];
  let futuro: Snapshot[] = [];
  let temporizador: ReturnType<typeof setTimeout> | null = null;

  const avisar = (erro: unknown) => console.warn('[store] falha na persistência; seguindo em memória.', erro);

  const useStore = create<LevantamentoStore>()((set, get) => {
    const flags = () => ({ podeDesfazer: passado.length > 0, podeRefazer: futuro.length > 0 });

    const limparHistorico = () => {
      passado = [];
      futuro = [];
    };

    /** Alteração do projeto fora do histórico. */
    const alterarProjeto = (patch: Partial<Projeto>) =>
      set((s) => ({ projeto: { ...s.projeto, ...patch, atualizadoEm: agora() } }));

    /** Alteração de elementos/páginas que entra no histórico. */
    const alterarComHistorico = (patch: Partial<Snapshot>) => {
      const { projeto, selecaoIds } = get();
      passado = [...passado, { elementos: projeto.elementos, paginas: projeto.paginas }].slice(-LIMITE_HISTORICO);
      futuro = [];
      const novo: Projeto = { ...projeto, ...patch, atualizadoEm: agora() };
      set({ projeto: novo, selecaoIds: filtrarSelecao(selecaoIds, novo.elementos), ...flags() });
    };

    const filtrarSelecao = (selecaoIds: string[], elementos: Elemento[]): string[] => {
      const existentes = new Set(elementos.map((e) => e.id));
      return selecaoIds.every((id) => existentes.has(id)) ? selecaoIds : selecaoIds.filter((id) => existentes.has(id));
    };

    /** Aplica `fn` aos elementos; se nada mudar (mesma referência), não cria passo no histórico. */
    const alterarElementos = (fn: (elementos: Elemento[]) => Elemento[]) => {
      const atuais = get().projeto.elementos;
      const novos = fn(atuais);
      if (novos !== atuais) alterarComHistorico({ elementos: novos });
    };

    const confirmarOnde = (deve: (e: Elemento) => boolean) =>
      alterarElementos((els) =>
        els.some((e) => e.status === 'pendente' && deve(e))
          ? els.map((e) => (e.status === 'pendente' && deve(e) ? { ...e, status: 'confirmado' as const } : e))
          : els,
      );

    const removerOnde = (deve: (e: Elemento) => boolean) =>
      alterarElementos((els) => (els.some(deve) ? els.filter((e) => !deve(e)) : els));

    const paginaOuNova = (pagina: number): PaginaInfo => get().projeto.paginas[pagina] ?? { escala: null };

    /** Aplica um snapshot do histórico ao projeto. */
    const restaurar = (snapshot: Snapshot) => {
      const { projeto, selecaoIds } = get();
      const novo: Projeto = {
        ...projeto,
        elementos: snapshot.elementos,
        paginas: restaurarPaginas(projeto.paginas, snapshot.paginas),
        atualizadoEm: agora(),
      };
      set({ projeto: novo, selecaoIds: filtrarSelecao(selecaoIds, novo.elementos), ...flags() });
    };

    return {
      projeto: projetoVazio(novoId(), agora()),
      pdfDados: null,
      carregado: false,
      paginaAtual: PAGINA_INICIAL,
      ferramenta: { modo: 'selecionar' },
      selecaoIds: [],
      podeDesfazer: false,
      podeRefazer: false,

      // --- ciclo de vida / persistência
      async inicializar() {
        try {
          const salvo = await persistencia.carregar();
          if (salvo) {
            limparHistorico();
            set({
              projeto: salvo.projeto,
              pdfDados: salvo.pdf,
              paginaAtual: salvo.paginaAtual ?? PAGINA_INICIAL,
              selecaoIds: [],
              ...flags(),
            });
          }
        } catch (erro) {
          avisar(erro);
        }
        set({ carregado: true });
      },

      async novoProjeto() {
        cancelarSalvamento();
        try {
          await persistencia.limpar();
        } catch (erro) {
          avisar(erro);
        }
        limparHistorico();
        set({
          projeto: projetoVazio(novoId(), agora()),
          pdfDados: null,
          paginaAtual: PAGINA_INICIAL,
          ferramenta: { modo: 'selecionar' },
          selecaoIds: [],
          ...flags(),
        });
      },

      carregarProjeto(projeto) {
        limparHistorico();
        set({ projeto, paginaAtual: PAGINA_INICIAL, selecaoIds: [], ...flags() });
      },

      definirPdf(nome, dados, totalPaginas) {
        // Só troca o arquivo: páginas e elementos existentes nunca são apagados automaticamente.
        set((s) => ({
          projeto: { ...s.projeto, arquivoNome: nome, totalPaginas, atualizadoEm: agora() },
          pdfDados: dados,
          paginaAtual: PAGINA_INICIAL,
        }));
        if (get().carregado) persistencia.salvarPdf(dados).catch(avisar);
      },

      definirNome(nome) {
        alterarProjeto({ nome });
      },

      // --- navegação / UI
      definirPagina(pagina) {
        const total = get().projeto.totalPaginas;
        const limitada = Math.max(PAGINA_INICIAL, total > 0 ? Math.min(pagina, total) : pagina);
        set({ paginaAtual: limitada });
      },

      definirDimensoesPagina(pagina, largura, altura) {
        const atual = paginaOuNova(pagina);
        if (atual.largura === largura && atual.altura === altura) return;
        alterarProjeto({ paginas: { ...get().projeto.paginas, [pagina]: { ...atual, largura, altura } } });
      },

      definirFerramenta(ferramenta) {
        set({ ferramenta });
      },

      selecionar(ids) {
        set({ selecaoIds: ids });
      },

      definirCamada(disciplina, visivel) {
        alterarProjeto({ camadas: { ...get().projeto.camadas, [disciplina]: visivel } });
      },

      // --- escala
      calibrarPagina(pagina, escala) {
        const atual = paginaOuNova(pagina);
        alterarComHistorico({ paginas: { ...get().projeto.paginas, [pagina]: { ...atual, escala } } });
      },

      // --- elementos
      adicionarElementos(elementos) {
        alterarElementos((els) => (elementos.length > 0 ? [...els, ...elementos] : els));
      },

      atualizarElemento(id, patch) {
        alterarElementos((els) => {
          if (!els.some((e) => e.id === id)) return els;
          const { props, ...resto } = patch;
          return els.map((e) =>
            e.id === id
              ? ({ ...e, ...resto, id: e.id, tipo: e.tipo, props: props ? { ...e.props, ...props } : e.props } as Elemento)
              : e,
          );
        });
      },

      removerElementos(ids) {
        const alvo = new Set(ids);
        removerOnde((e) => alvo.has(e.id));
      },

      confirmarElementos(ids) {
        const alvo = new Set(ids);
        confirmarOnde((e) => alvo.has(e.id));
      },

      confirmarPendentes(disciplina?: Disciplina) {
        confirmarOnde((e) => !disciplina || e.disciplina === disciplina);
      },

      descartarPendentes(disciplina?: Disciplina) {
        removerOnde((e) => e.status === 'pendente' && (!disciplina || e.disciplina === disciplina));
      },

      substituirSugestoes(disciplina, novos, pagina) {
        const ehSugestaoAntiga = (e: Elemento) =>
          e.disciplina === disciplina &&
          e.origem === 'sugerido-auto' &&
          e.status === 'pendente' &&
          (pagina === undefined || e.pagina === pagina);
        alterarElementos((els) =>
          novos.length > 0 || els.some(ehSugestaoAntiga) ? [...els.filter((e) => !ehSugestaoAntiga(e)), ...novos] : els,
        );
      },

      desfazer() {
        const snapshot = passado[passado.length - 1];
        if (!snapshot) return;
        const { projeto } = get();
        passado = passado.slice(0, -1);
        futuro = [...futuro, { elementos: projeto.elementos, paginas: projeto.paginas }];
        restaurar(snapshot);
      },

      refazer() {
        const snapshot = futuro[futuro.length - 1];
        if (!snapshot) return;
        const { projeto } = get();
        futuro = futuro.slice(0, -1);
        passado = [...passado, { elementos: projeto.elementos, paginas: projeto.paginas }];
        restaurar(snapshot);
      },

      // --- cadastros e parâmetros
      salvarEsquadria(tipo) {
        const atuais = get().projeto.esquadrias;
        const esquadrias = atuais.some((t) => t.id === tipo.id)
          ? atuais.map((t) => (t.id === tipo.id ? tipo : t))
          : [...atuais, tipo];
        alterarProjeto({ esquadrias });
      },

      removerEsquadria(id) {
        alterarProjeto({ esquadrias: get().projeto.esquadrias.filter((t) => t.id !== id) });
      },

      atualizarParametros(patch: PatchParametros) {
        alterarProjeto({ parametros: mesclarProfundo<Parametros>(get().projeto.parametros, patch) });
      },

      definirComposicoes(composicoes) {
        alterarProjeto({ composicoes });
      },
    };
  });

  // --- salvamento automático (debounce)
  function cancelarSalvamento() {
    if (temporizador !== null) clearTimeout(temporizador);
    temporizador = null;
  }

  function salvarAgora() {
    if (temporizador === null) return;
    cancelarSalvamento();
    const { projeto, paginaAtual } = useStore.getState();
    persistencia.salvarProjeto(projeto, paginaAtual).catch(avisar);
  }

  useStore.subscribe((estado, anterior) => {
    // Antes de `inicializar` terminar nada é gravado, para não sobrescrever o que está salvo.
    if (!estado.carregado || !anterior.carregado) return;
    if (estado.projeto === anterior.projeto && estado.paginaAtual === anterior.paginaAtual) return;
    cancelarSalvamento();
    temporizador = setTimeout(salvarAgora, DEBOUNCE_SALVAMENTO_MS);
  });

  // Ao sair/recarregar a página, grava o que ainda estava aguardando o debounce.
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', salvarAgora);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') salvarAgora();
    });
  }

  return useStore;
}
