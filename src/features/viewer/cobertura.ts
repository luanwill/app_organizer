/** Geometria de desenho da cobertura (telhado/laje): cumeeira, espigões e hachura. Lógica pura. */
import type { Ponto, PropsCalha, PropsTelhado } from '@/core/model';
import { caixaEnvolvente } from '@/core/calc';

export interface Segmento {
  a: Ponto;
  b: Ponto;
}

/**
 * Cumeeira e espigões a partir da caixa envolvente do polígono (aproximação para polígonos não
 * retangulares; o desenho é recortado pelo polígono).
 * - 1 água: nenhuma linha;
 * - 2 águas: cumeeira no meio, na direção indicada;
 * - 4 águas: cumeeira encurtada + 4 espigões até os cantos (vira pirâmide se a cumeeira zerar).
 */
export function linhasCumeeira(pontos: Ponto[], aguas: PropsTelhado['aguas'], direcao: PropsTelhado['direcao']): Segmento[] {
  if (pontos.length < 3 || aguas === 1) return [];
  const c = caixaEnvolvente(pontos);
  const w = c.maxX - c.minX;
  const h = c.maxY - c.minY;
  const cx = (c.minX + c.maxX) / 2;
  const cy = (c.minY + c.maxY) / 2;
  const horizontal = direcao === 'horizontal';
  if (aguas === 2) {
    return [horizontal ? { a: { x: c.minX, y: cy }, b: { x: c.maxX, y: cy } } : { a: { x: cx, y: c.minY }, b: { x: cx, y: c.maxY } }];
  }
  const saida: Segmento[] = [];
  if (horizontal) {
    const meio = Math.max(0, (w - h) / 2);
    const e = { x: cx - meio, y: cy };
    const d = { x: cx + meio, y: cy };
    if (meio > 0) saida.push({ a: e, b: d });
    saida.push(
      { a: { x: c.minX, y: c.minY }, b: e },
      { a: { x: c.minX, y: c.maxY }, b: e },
      { a: { x: c.maxX, y: c.minY }, b: d },
      { a: { x: c.maxX, y: c.maxY }, b: d },
    );
  } else {
    const meio = Math.max(0, (h - w) / 2);
    const s = { x: cx, y: cy - meio };
    const i = { x: cx, y: cy + meio };
    if (meio > 0) saida.push({ a: s, b: i });
    saida.push(
      { a: { x: c.minX, y: c.minY }, b: s },
      { a: { x: c.maxX, y: c.minY }, b: s },
      { a: { x: c.minX, y: c.maxY }, b: i },
      { a: { x: c.maxX, y: c.maxY }, b: i },
    );
  }
  return saida;
}

/** Hachura diagonal (45°) cobrindo a caixa envolvente, com espaçamento `passo` (o desenho recorta pelo polígono). */
export function linhasHachura(pontos: Ponto[], passo: number): Segmento[] {
  if (pontos.length < 3 || !(passo > 0)) return [];
  const c = caixaEnvolvente(pontos);
  const w = c.maxX - c.minX;
  const h = c.maxY - c.minY;
  const saida: Segmento[] = [];
  // retas x − y = k, de k = −h a k = w (em coordenadas relativas à caixa)
  for (let k = -h + passo / 2; k < w; k += passo) {
    const y0 = Math.max(0, -k);
    const y1 = Math.min(h, w - k);
    saida.push({ a: { x: c.minX + k + y0, y: c.minY + y0 }, b: { x: c.minX + k + y1, y: c.minY + y1 } });
  }
  return saida;
}

/** Tracejado próprio da calha conforme a função (rufo tracejado; calha contínua). */
export function tracejadoCalha(funcao: PropsCalha['funcao'], tracejadoRufo: number[]): number[] | undefined {
  return funcao === 'rufo' ? tracejadoRufo : undefined;
}
