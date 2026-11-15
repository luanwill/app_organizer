/** Arquitetura (S4): constantes, tolerâncias e textos. Sem números mágicos nas regras. */
import type { Disciplina, GrupoArquitetura, TipoAmbiente, TipoEsquadria } from '@/core/model';

export const DISCIPLINA: Disciplina = 'arquitetura';

export const GRUPO = {
  ambientes: 'Ambientes',
  esquadrias: 'Esquadrias',
  paredes: 'Paredes',
  acabamentos: 'Acabamentos',
  medicoes: 'Medições',
} as const satisfies Record<string, GrupoArquitetura>;

/**
 * Uma esquadria pertence a um ambiente quando está a até esta distância (m) da borda do polígono
 * do ambiente. Cobre meia espessura de parede com folga (ambiente desenhado pela face interna,
 * esquadria no eixo da parede).
 */
export const TOLERANCIA_ESQUADRIA_AMBIENTE_M = 0.3;

/** Chaves aceitas em `Elemento.manuais`. */
export const MANUAL_AREA = 'area';
export const MANUAL_PERIMETRO = 'perimetro';
export const MANUAL_COMPRIMENTO = 'comprimento';

export const UNIDADE = { m: 'm', m2: 'm²', un: 'un' } as const;

export const ROTULO_TIPO_AMBIENTE: Record<TipoAmbiente, string> = {
  sala: 'Sala',
  quarto: 'Quarto',
  cozinha: 'Cozinha',
  'area-servico': 'Área de serviço',
  banheiro: 'Banheiro',
  circulacao: 'Circulação',
  varanda: 'Varanda',
  garagem: 'Garagem',
  outro: 'Outro',
};

/** Tipos que marcam "área molhada" automaticamente ao serem escolhidos (o usuário pode desmarcar). */
export const TIPOS_AREA_MOLHADA: readonly TipoAmbiente[] = ['banheiro', 'cozinha', 'area-servico'];

export const NOME_AMBIENTE_PADRAO = 'Ambiente';
export const NOME_PAREDE_PADRAO = 'Parede';
export const DESCRICAO_MEDICAO_PADRAO = 'Medição';
export const DESCRICAO_CONTAGEM_PADRAO = 'Contagem';

export const ROTULO_CATEGORIA: Record<TipoEsquadria['categoria'], string> = { porta: 'Porta', janela: 'Janela' };
export const PREFIXO_CODIGO: Record<TipoEsquadria['categoria'], string> = { porta: 'P', janela: 'J' };

/** Valores iniciais (visíveis e editáveis) de um novo tipo no cadastro de esquadrias. */
export const ESQUADRIA_NOVA: Record<TipoEsquadria['categoria'], Omit<TipoEsquadria, 'id' | 'codigo'>> = {
  porta: { categoria: 'porta', largura: 0.8, altura: 2.1, peitoril: 0, quantidade: 1 },
  janela: { categoria: 'janela', largura: 1.2, altura: 1.0, peitoril: 1.1, quantidade: 1 },
};

export const DEMAOS_MINIMO = 1;
