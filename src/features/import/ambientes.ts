/** Classificação de ambientes por palavras-chave (compartilhada entre DXF e JSON). Função pura. */
import type { Ponto, TipoAmbiente } from '@/core/model';
import { areaPoligono, pontoEmPoligono } from '@/core/calc';
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
