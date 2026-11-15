/** Classificação de ambientes por palavras-chave (compartilhada entre DXF e JSON). Função pura. */
import type { TipoAmbiente } from '@/core/model';
import { PALAVRAS_CHAVE_AMBIENTE } from './config';

/** Minúsculas e sem acentos. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Tipo sugerido pelo texto (nome do ambiente), ou null se nenhuma palavra-chave casar. */
export function classificarAmbiente(texto: string): { tipo: TipoAmbiente; areaMolhada: boolean } | null {
  const t = normalizarTexto(texto);
  for (const regra of PALAVRAS_CHAVE_AMBIENTE) {
    if (regra.palavras.some((p) => t.includes(p))) return { tipo: regra.tipo, areaMolhada: regra.areaMolhada };
  }
  return null;
}
