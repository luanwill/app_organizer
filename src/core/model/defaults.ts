/**
 * CONTRATO — CONGELADO. Valores padrão dos parâmetros configuráveis e identidade visual das disciplinas.
 * Dados essenciais (pé-direito, espessura de parede, nº de pessoas) nascem null de propósito:
 * o usuário precisa informar; enquanto isso, o sistema mostra "dado faltante".
 */
import type { Disciplina, Parametros, Projeto } from './types';

export const DISCIPLINAS: Disciplina[] = ['arquitetura', 'estrutura', 'eletrica', 'hidraulica', 'materiais'];

export const ROTULO_DISCIPLINA: Record<Disciplina, string> = {
  arquitetura: 'Arquitetura',
  estrutura: 'Estrutura',
  eletrica: 'Elétrica',
  hidraulica: 'Hidráulica',
  materiais: 'Materiais',
};

export const COR_DISCIPLINA: Record<Disciplina, string> = {
  arquitetura: '#4da3ff',
  estrutura: '#ff8a3d',
  eletrica: '#ffd23d',
  hidraulica: '#3ddc97',
  materiais: '#c58bff',
};

/** Cor de destaque dos elementos pendentes (sugestões ainda não aceitas). */
export const COR_PENDENTE = '#ff5fa2';

export const AVISO_ESTRUTURA =
  'Estimativa para orçamento. Não substitui projeto estrutural por engenheiro responsável.';
export const AVISO_COMPOSICOES = 'Coeficientes de referência — confira com sua composição (SINAPI/TCPO)';

export function parametrosPadrao(): Parametros {
  return {
    gerais: { peDireito: null, espessuraParede: null, numeroPessoas: null },
    arquitetura: {
      modoDescontoVao: 'acima-do-limite',
      limiteDescontoVaoM2: 2,
      subidaImpermeabilizacao: 0.3,
      demaosPintura: 2,
    },
    estrutura: {
      vaoMaximo: 4,
      distanciaFusao: 0.5,
      pilar: { secaoB: 0.14, secaoH: 0.3 },
      baldrame: { secaoB: 0.14, secaoH: 0.3 },
      vigaSuperior: { ativa: true, secaoB: 0.14, secaoH: 0.3 },
      fck: 25,
      cobrimento: 0.025,
      aco: {
        modo: 'taxa',
        taxaPilar: 100,
        taxaViga: 90,
        taxaLaje: 60,
        taxaFundacao: 70,
        detalhado: {
          barrasLongitudinais: 4,
          bitolaLongitudinalMm: 10,
          bitolaEstriboMm: 5,
          espacamentoEstribo: 0.15,
        },
      },
      laje: { tipo: 'trelicada-eps', modo: 'por-ambiente', espessura: 0.12, intereixo: 0.42 },
      fundacao: {
        tipo: 'sapata',
        sapata: { ladoA: 0.8, ladoB: 0.8, altura: 0.3, profundidade: 1 },
        bloco: {
          ladoA: 0.6,
          ladoB: 0.6,
          altura: 0.4,
          estacasPorBloco: 1,
          diametroEstaca: 0.25,
          comprimentoEstaca: 4,
        },
        radier: { espessura: 0.12 },
        espessuraLastro: 0.05,
      },
    },
    eletrica: {
      limiteVAPorCircuito: 1270,
      tensao: 127,
      alturas: { baixa: 0.3, media: 1.1, alta: 2.2, interruptor: 1.1 },
      potenciaTUG: 100,
      potenciaTUE: {
        chuveiro: 5500,
        'micro-ondas': 1500,
        'ar-condicionado': 1400,
        'forno-eletrico': 2500,
        'maquina-lavar': 1000,
        'torneira-eletrica': 5000,
      },
      secoes: {
        iluminacao: 1.5,
        tug: 2.5,
        tue: {
          chuveiro: 6,
          'micro-ondas': 2.5,
          'ar-condicionado': 2.5,
          'forno-eletrico': 2.5,
          'maquina-lavar': 2.5,
          'torneira-eletrica': 6,
        },
      },
      condutores: { iluminacao: 2, tug: 3, tue: 3 },
      diametroEletrodutoMm: 25,
    },
    hidraulica: {
      diametroAFmm: 25,
      diametroAQmm: 22,
      diametroEsgotoMm: {
        vaso: 100,
        lavatorio: 40,
        chuveiro: 40,
        ralo: 40,
        pia: 50,
        filtro: 40,
        tanque: 50,
        'maquina-lavar': 50,
      },
      alturaPontoM: {
        vaso: 0.2,
        lavatorio: 0.6,
        chuveiro: 2.1,
        ralo: 0,
        pia: 0.6,
        filtro: 1.1,
        tanque: 0.9,
        'maquina-lavar': 0.9,
      },
      consumoPerCapitaL: 200,
      diasReserva: 2,
      percentualConexoesDiversas: 10,
      pluvial: false,
      comprimentoBarraM: 6,
    },
  };
}

export function projetoVazio(id: string, agoraISO: string): Projeto {
  return {
    id,
    nome: 'Novo levantamento',
    versao: 1,
    criadoEm: agoraISO,
    atualizadoEm: agoraISO,
    arquivoNome: null,
    totalPaginas: 0,
    paginas: {},
    elementos: [],
    esquadrias: [],
    parametros: parametrosPadrao(),
    composicoes: null,
    camadas: { arquitetura: true, estrutura: true, eletrica: true, hidraulica: true, materiais: true },
  };
}
