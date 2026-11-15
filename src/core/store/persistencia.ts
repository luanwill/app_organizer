import Dexie from 'dexie';
import type { Projeto } from '@/core/model';
import { CHAVE_ATUAL, NOME_BANCO, TABELA_ARQUIVOS, TABELA_PROJETOS, VERSAO_BANCO } from './config';

export interface DadosSalvos {
  projeto: Projeto;
  paginaAtual: number;
  pdf: Uint8Array | null;
}

/** Camada de persistência do levantamento (um único projeto "atual" + o PDF dele). */
export interface Persistencia {
  /** null quando não há projeto salvo. */
  carregar(): Promise<DadosSalvos | null>;
  salvarProjeto(projeto: Projeto, paginaAtual: number): Promise<void>;
  salvarPdf(dados: Uint8Array): Promise<void>;
  /** Apaga o projeto e o PDF salvos. */
  limpar(): Promise<void>;
}

interface RegistroProjeto {
  chave: string;
  projeto: Projeto;
  paginaAtual: number;
}

interface RegistroArquivo {
  chave: string;
  dados: Uint8Array;
}

/** Implementação IndexedDB (Dexie). O banco só é aberto no primeiro uso. */
export function criarPersistenciaDexie(nomeBanco: string = NOME_BANCO): Persistencia {
  let banco: Dexie | null = null;
  const abrir = (): Dexie => {
    if (!banco) {
      banco = new Dexie(nomeBanco);
      banco.version(VERSAO_BANCO).stores({ [TABELA_PROJETOS]: 'chave', [TABELA_ARQUIVOS]: 'chave' });
    }
    return banco;
  };
  const projetos = () => abrir().table<RegistroProjeto, string>(TABELA_PROJETOS);
  const arquivos = () => abrir().table<RegistroArquivo, string>(TABELA_ARQUIVOS);

  return {
    async carregar() {
      const registro = await projetos().get(CHAVE_ATUAL);
      if (!registro) return null;
      const arquivo = await arquivos().get(CHAVE_ATUAL);
      return { projeto: registro.projeto, paginaAtual: registro.paginaAtual, pdf: arquivo?.dados ?? null };
    },
    async salvarProjeto(projeto, paginaAtual) {
      await projetos().put({ chave: CHAVE_ATUAL, projeto, paginaAtual });
    },
    async salvarPdf(dados) {
      // Cópia síncrona: o buffer original pode ser transferido depois (ex.: para o worker do pdf.js).
      const copia = dados.slice();
      await arquivos().put({ chave: CHAVE_ATUAL, dados: copia });
    },
    async limpar() {
      await projetos().delete(CHAVE_ATUAL);
      await arquivos().delete(CHAVE_ATUAL);
    },
  };
}

/** Implementação em memória (testes). Clona os dados, como o IndexedDB faz. */
export function criarPersistenciaMemoria(): Persistencia {
  let registro: { projeto: Projeto; paginaAtual: number } | null = null;
  let pdf: Uint8Array | null = null;
  return {
    async carregar() {
      if (!registro) return null;
      return { ...structuredClone(registro), pdf: pdf ? pdf.slice() : null };
    },
    async salvarProjeto(projeto, paginaAtual) {
      registro = structuredClone({ projeto, paginaAtual });
    },
    async salvarPdf(dados) {
      pdf = dados.slice();
    },
    async limpar() {
      registro = null;
      pdf = null;
    },
  };
}
