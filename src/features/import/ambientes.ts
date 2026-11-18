/** Classificação de ambientes por palavras-chave (compartilhada entre DXF e JSON). Função pura. */
import type { Ponto, TipoAmbiente } from '@/core/model';
import { areaPoligono, pontoEmPoligono } from '@/core/calc';
import { PALAVRAS_CHAVE_AMBIENTE, TEXTOS_NAO_AMBIENTE } from './config';

/** Minúsculas e sem acentos. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export interface Classificacao {
  tipo: TipoAmbiente;
  areaMolhada: boolean;
  /** A área ficou molhada por causa de um termo secundário do nome ("SALA E COZINHA"): vale conferir. */
  molhadaPorTermoSecundario: boolean;
}

/**
 * Tipo sugerido pelo nome do ambiente, ou null se nenhuma palavra-chave casar. Cada palavra-chave casa só no
 * INÍCIO de uma palavra. Nome composto: o tipo é o do termo que aparece primeiro ("SALA TV/ COZINHA" → sala;
 * "WC SUÍTE" → banheiro) e a área é molhada se qualquer termo for de área molhada.
 */
export function classificarAmbiente(texto: string): Classificacao | null {
  const palavras = normalizarTexto(texto).split(/[^a-z0-9.]+/).filter((p) => p !== '');
  if (palavras.length === 0 || TEXTOS_NAO_AMBIENTE.some((n) => palavras[0]!.startsWith(n))) return null;
  const achados = palavras.flatMap((palavra) =>
    PALAVRAS_CHAVE_AMBIENTE.filter((regra) => regra.palavras.some((chave) => palavra.startsWith(chave))).slice(0, 1),
  );
  const principal = achados[0];
  if (!principal) return null;
  const areaMolhada = achados.some((r) => r.areaMolhada);
  return { tipo: principal.tipo, areaMolhada, molhadaPorTermoSecundario: areaMolhada && !principal.areaMolhada };
}

/** O texto não pode ser nome de ambiente (título, escala, entorno)? */
export function naoEhNomeDeAmbiente(texto: string): boolean {
  const primeira = normalizarTexto(texto).split(/[^a-z0-9.]+/).find((p) => p !== '');
  return primeira !== undefined && TEXTOS_NAO_AMBIENTE.some((n) => primeira.startsWith(n));
}

export interface TextoPosicionado {
  texto: string;
  ponto: Ponto;
}

/** Distribui os textos pelos polígonos: cada texto vai para o MENOR polígono que o contém. */
export function atribuirTextos(poligonos: Ponto[][], textos: TextoPosicionado[]): { porPoligono: string[][]; soltos: number } {
  const areas = poligonos.map(areaPoligono);
  const porPoligono: string[][] = poligonos.map(() => []);
  let soltos = 0;
  for (const t of textos) {
    let alvo = -1;
    poligonos.forEach((pol, i) => {
      if (!pontoEmPoligono(t.ponto, pol)) return;
      if (alvo === -1 || areas[i]! < areas[alvo]!) alvo = i;
    });
    if (alvo === -1) soltos++;
    else porPoligono[alvo]!.push(t.texto);
  }
  return { porPoligono, soltos };
}

/** Nome do ambiente entre os textos internos: o que indica o tipo; senão o primeiro com letras (ignora cotas/áreas). */
export function escolherNome(textos: string[]): string | undefined {
  return textos.find((t) => classificarAmbiente(t) !== null) ?? textos.find((t) => /\p{L}/u.test(t));
}
