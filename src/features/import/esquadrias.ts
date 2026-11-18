/**
 * Evidências de abertura num vão (funções PURAS, em metros):
 *  - esquadria: janelas e portas de correr são desenhadas como linhas paralelas DENTRO da faixa da parede
 *    (caixilho, vidro, folhas). Um vão maior que uma porta comum só é fechado com essa evidência — uma
 *    passagem livre entre ambientes integrados fica aberta;
 *  - porta: folha aberta (retângulo fino — dois traços paralelos bem próximos — quase perpendicular ao vão,
 *    do tamanho do vão, saindo de um dos batentes) ou o arco do giro (corda ≈ vão × √2, partindo de um
 *    batente). Exigir o retângulo fino evita confundir a folha com as juntas do piso junto da parede. Sem isso, a ponta de uma parede não é
 *    levada até a parede da frente — um corredor aberto para o quarto não vira porta.
 */
import type { Ponto } from '@/core/model';
import { distancia } from '@/core/calc';
import { RECONHECIMENTO_PDF } from './config';

/** O trecho a→b (eixo do vão), numa parede de `espessura`, tem a evidência? */
export type TemEvidencia = (a: Ponto, b: Ponto, espessura: number) => boolean;

export interface EvidenciasDeVao {
  esquadria: TemEvidencia;
  porta: TemEvidencia;
}

const C = RECONHECIMENTO_PDF;
const E = RECONHECIMENTO_PDF.esquadria;
const PORTA = RECONHECIMENTO_PDF.porta;
const SENO_PARALELO = Math.sin((C.parede.toleranciaAngularGraus * Math.PI) / 180);
const SENO_PERPENDICULAR = Math.sin((PORTA.anguloMinGraus * Math.PI) / 180);

export const SEM_EVIDENCIA: TemEvidencia = () => false;
export const SEM_EVIDENCIAS: EvidenciasDeVao = { esquadria: SEM_EVIDENCIA, porta: SEM_EVIDENCIA };

/** Grade de busca: ids dos segmentos cuja caixa toca a caixa pedida. */
function criarGrade(segmentos: [Ponto, Ponto][]): (minX: number, minY: number, maxX: number, maxY: number) => Set<number> {
  const celula = E.celulaIndiceM;
  const grade = new Map<string, number[]>();
  segmentos.forEach(([a, b], i) => {
    const x0 = Math.floor(Math.min(a.x, b.x) / celula);
    const x1 = Math.floor(Math.max(a.x, b.x) / celula);
    const y0 = Math.floor(Math.min(a.y, b.y) / celula);
    const y1 = Math.floor(Math.max(a.y, b.y) / celula);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const chave = `${x},${y}`;
        const lista = grade.get(chave);
        if (lista) lista.push(i);
        else grade.set(chave, [i]);
      }
    }
  });
  return (minX, minY, maxX, maxY) => {
    const ids = new Set<number>();
    for (let x = Math.floor(minX / celula); x <= Math.floor(maxX / celula); x++) {
      for (let y = Math.floor(minY / celula); y <= Math.floor(maxY / celula); y++) {
        for (const i of grade.get(`${x},${y}`) ?? []) ids.add(i);
      }
    }
    return ids;
  };
}

/** Fração de [0, total] coberta pela união dos trechos. */
function cobertura(trechos: [number, number][], total: number): number {
  const ordenados = [...trechos].sort((p, q) => p[0] - q[0]);
  let coberto = 0;
  let fim = -Infinity;
  for (const [s0, s1] of ordenados) {
    if (s1 <= fim) continue;
    coberto += s1 - Math.max(s0, fim);
    fim = s1;
  }
  return coberto / total;
}

export function indiceDeVaos(segmentos: [Ponto, Ponto][], arcos: [Ponto, Ponto][] = []): EvidenciasDeVao {
  const buscarSegmentos = criarGrade(segmentos);
  const buscarArcos = criarGrade(arcos);

  const esquadria: TemEvidencia = (a, b, espessura) => {
    const comprimento = distancia(a, b);
    if (!(comprimento > 0)) return false;
    const ux = (b.x - a.x) / comprimento;
    const uy = (b.y - a.y) / comprimento;
    const meiaFaixa = espessura / 2 - E.margemFaceM;
    if (meiaFaixa <= 0) return false;

    // trechos cobertos ao longo do vão, agrupados pela posição lateral da linha
    const porLinha = new Map<number, [number, number][]>();
    const ids = buscarSegmentos(Math.min(a.x, b.x) - espessura, Math.min(a.y, b.y) - espessura, Math.max(a.x, b.x) + espessura, Math.max(a.y, b.y) + espessura);
    for (const i of ids) {
      const [p, q] = segmentos[i]!;
      const l = distancia(p, q);
      if (!(l > 0)) continue;
      if (Math.abs((ux * (q.y - p.y)) / l - (uy * (q.x - p.x)) / l) > SENO_PARALELO) continue;
      const lateral = (r: Ponto): number => -(r.x - a.x) * uy + (r.y - a.y) * ux;
      const lp = lateral(p);
      const lq = lateral(q);
      if (Math.abs(lp) >= meiaFaixa || Math.abs(lq) >= meiaFaixa) continue;
      const ao_longo = (r: Ponto): number => (r.x - a.x) * ux + (r.y - a.y) * uy;
      const s0 = Math.max(0, Math.min(ao_longo(p), ao_longo(q)));
      const s1 = Math.min(comprimento, Math.max(ao_longo(p), ao_longo(q)));
      if (s1 <= s0) continue;
      const chave = Math.round((lp + lq) / 2 / E.agrupamentoLateralM);
      const lista = porLinha.get(chave) ?? [];
      lista.push([s0, s1]);
      porLinha.set(chave, lista);
    }
    // união de tudo o que corre dentro da faixa + quantas linhas distintas atravessam um trecho relevante
    if (cobertura([...porLinha.values()].flat(), comprimento) < E.coberturaMin) return false;
    let linhas = 0;
    for (const trechos of porLinha.values()) if (cobertura(trechos, comprimento) >= E.coberturaLinhaMin) linhas++;
    return linhas >= E.linhasMin;
  };

  const porta: TemEvidencia = (a, b, espessura) => {
    const vao = distancia(a, b);
    if (!(vao > 0)) return false;
    const ux = (b.x - a.x) / vao;
    const uy = (b.y - a.y) / vao;
    const folga = espessura + PORTA.folgaBatenteM;
    const alcance = vao * Math.SQRT2 * PORTA.fracaoMaxima + folga;
    const caixa = [Math.min(a.x, b.x) - alcance, Math.min(a.y, b.y) - alcance, Math.max(a.x, b.x) + alcance, Math.max(a.y, b.y) + alcance] as const;
    const noBatente = (p: Ponto, q: Ponto): boolean => Math.min(distancia(p, a), distancia(p, b), distancia(q, a), distancia(q, b)) <= folga;

    /** O traço tem um "par" paralelo, do mesmo tamanho, a uma espessura de folha de distância? */
    const ehFolha = (i: number, p: Ponto, q: Ponto, l: number): boolean => {
      const vx = (q.x - p.x) / l;
      const vy = (q.y - p.y) / l;
      const d = PORTA.espessuraFolhaMaxM;
      for (const j of buscarSegmentos(Math.min(p.x, q.x) - d, Math.min(p.y, q.y) - d, Math.max(p.x, q.x) + d, Math.max(p.y, q.y) + d)) {
        if (j === i) continue;
        const [r, t] = segmentos[j]!;
        const lr = distancia(r, t);
        // o par tem o mesmo tamanho (os dois lados longos do retângulo da folha)
        if (lr < l * PORTA.sobreposicaoFolha || lr > l / PORTA.sobreposicaoFolha) continue;
        if (Math.abs((vx * (t.y - r.y)) / lr - (vy * (t.x - r.x)) / lr) > SENO_PARALELO) continue;
        const lateral = Math.abs(-((r.x + t.x) / 2 - p.x) * vy + ((r.y + t.y) / 2 - p.y) * vx);
        if (lateral < PORTA.espessuraFolhaMinM || lateral > PORTA.espessuraFolhaMaxM) continue;
        const ao_longo = (z: Ponto): number => (z.x - p.x) * vx + (z.y - p.y) * vy;
        const s0 = Math.max(0, Math.min(ao_longo(r), ao_longo(t)));
        const s1 = Math.min(l, Math.max(ao_longo(r), ao_longo(t)));
        if (s1 - s0 >= l * PORTA.sobreposicaoFolha) return true;
      }
      return false;
    };

    // folha aberta: quase perpendicular ao vão, do tamanho do vão, saindo de um batente
    for (const i of buscarSegmentos(...caixa)) {
      const [p, q] = segmentos[i]!;
      const l = distancia(p, q);
      if (l < vao * PORTA.fracaoMinima || l > vao * PORTA.fracaoMaxima) continue;
      if (Math.abs((ux * (q.y - p.y)) / l - (uy * (q.x - p.x)) / l) < SENO_PERPENDICULAR) continue;
      if (noBatente(p, q) && ehFolha(i, p, q, l)) return true;
    }
    // giro: corda do arco ≈ vão × √2, partindo de um batente
    for (const i of buscarArcos(...caixa)) {
      const [p, q] = arcos[i]!;
      const l = distancia(p, q);
      if (l < vao * Math.SQRT2 * PORTA.fracaoMinima || l > vao * Math.SQRT2 * PORTA.fracaoMaxima) continue;
      if (noBatente(p, q)) return true;
    }
    return false;
  };

  return { esquadria, porta };
}
