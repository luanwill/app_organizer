import { describe, expect, it } from 'vitest';
import { extrairVetores, paraEntradaDoReconhecimento, type PaginaPdf } from './pdfVetores';
import { reconhecerVetores } from './reconhecimento';

/** PDF vetorial mínimo (1 página, Helvetica) com o fluxo de conteúdo dado. Só ASCII. */
function gerarPdf(conteudo: string, largura: number, altura: number, rotacao = 0): Uint8Array {
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${largura} ${altura}] /Rotate ${rotacao} /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objetos.forEach((corpo, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${corpo}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Uint8Array.from(pdf, (c) => c.charCodeAt(0));
}

async function abrir(conteudo: string, largura = 600, altura = 500, rotacao = 0) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: gerarPdf(conteudo, largura, altura, rotacao), verbosity: 0 }).promise;
  const pagina = await doc.getPage(1);
  const vetores = await extrairVetores(pagina as unknown as PaginaPdf, pdfjs.OPS as unknown as Record<string, number>);
  return { vetores, viewport: pagina.getViewport({ scale: 1 }) };
}

const xy = (p: { x: number; y: number }): [number, number] => [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000];

describe('extrairVetores (pdfjs, sem canvas)', () => {
  it('linhas viram traços nas coordenadas da página (y para baixo), com cor e largura', async () => {
    const { vetores } = await abrir('1 0 0 RG 2 w 100 100 m 300 100 l S');
    expect(vetores.tracos).toHaveLength(1);
    const t = vetores.tracos[0]!;
    expect(xy(t.a)).toEqual([100, 400]); // 500 − 100
    expect(xy(t.b)).toEqual([300, 400]);
    expect(t).toMatchObject({ cor: '#ff0000', tracejado: false, soPreenchido: false });
    expect(t.largura).toBeCloseTo(2, 6);
  });

  it('aplica a matriz acumulada (cm) e respeita q/Q', async () => {
    const { vetores } = await abrir('q 2 0 0 2 10 20 cm 0 0 m 100 0 l S Q 0 0 m 50 0 l S');
    expect(vetores.tracos.map((t) => [xy(t.a), xy(t.b)])).toEqual([
      [[10, 480], [210, 480]],
      [[0, 500], [50, 500]],
    ]);
    expect(vetores.tracos[0]!.largura).toBeCloseTo(2, 6); // largura 1 × escala 2
  });

  it('retângulo e caminho fechado (h) geram todos os lados', async () => {
    const { vetores } = await abrir('50 50 30 20 re S 200 200 m 250 200 l 250 250 l h S');
    expect(vetores.tracos).toHaveLength(4 + 3);
    expect(vetores.tracos.slice(0, 4).map((t) => [xy(t.a), xy(t.b)])).toEqual([
      [[50, 450], [80, 450]],
      [[80, 450], [80, 430]],
      [[80, 430], [50, 430]],
      [[50, 430], [50, 450]],
    ]);
  });

  it('caminho de recorte (n) é descartado; tracejado e preenchimento são marcados; curvas são ignoradas', async () => {
    const { vetores } = await abrir(
      '0 0 100 100 re W n ' + // recorte
        '[3 3] 0 d 0 300 m 100 300 l S [] 0 d ' + // tracejado
        '10 10 20 20 re f ' + // só preenchido
        '100 100 m 150 150 200 150 250 100 c 300 100 l S', // curva + reta
    );
    expect(vetores.curvasIgnoradas).toBe(1);
    const tracejados = vetores.tracos.filter((t) => t.tracejado);
    expect(tracejados).toHaveLength(1);
    expect(vetores.tracos.filter((t) => t.soPreenchido)).toHaveLength(4);
    const solidos = vetores.tracos.filter((t) => !t.tracejado && !t.soPreenchido);
    expect(solidos.map((t) => [xy(t.a), xy(t.b)])).toEqual([[[250, 400], [300, 400]]]); // só o trecho reto depois da curva
    // o reconhecimento não recebe os tracejados e não dá prioridade de traço ao que é só preenchimento
    const entrada = paraEntradaDoReconhecimento(vetores);
    expect(entrada.segmentos).toHaveLength(vetores.tracos.length - 1);
    expect(entrada.larguras.filter((l) => l === 0)).toHaveLength(4);
  });

  it('áreas preenchidas vêm com a cor do preenchimento e os contornos; curvas fecham o contorno pela corda', async () => {
    const { vetores } = await abrir(
      '0.4 0.4 0.4 rg 0 0 1 RG 100 100 50 10 re B ' + // preenchido + contornado
        '0 1 0 rg 300 300 m 350 300 l 350 350 300 350 300 300 c f', // com uma curva
    );
    expect(vetores.preenchimentos).toHaveLength(2);
    const [parede, folhagem] = vetores.preenchimentos;
    expect(parede!.cor).toBe('#666666');
    expect(parede!.contornos[0]!.map(xy)).toEqual([[100, 400], [150, 400], [150, 390], [100, 390]]);
    expect(folhagem!.cor).toBe('#00ff00');
    expect(folhagem!.contornos[0]!.map(xy)).toEqual([[300, 200], [350, 200], [300, 200]]);
    // o contorno do retângulo saiu como traço azul
    expect(vetores.tracos.filter((t) => t.cor === '#0000ff' && !t.soPreenchido)).toHaveLength(4);
  });

  it('arcos contornados (giro de porta) vêm como cordas', async () => {
    const { vetores } = await abrir('100 100 m 100 155 145 200 200 200 c S');
    expect(vetores.arcos.map(([a, b]) => [xy(a), xy(b)])).toEqual([[[100, 400], [200, 300]]]);
    expect(vetores.tracos).toEqual([]);
  });

  it('página girada (/Rotate 90): os traços seguem o viewport que o visualizador usa', async () => {
    const { vetores, viewport } = await abrir('100 50 m 300 50 l S', 600, 500, 90);
    expect([viewport.width, viewport.height]).toEqual([500, 600]);
    const t = vetores.tracos[0]!;
    expect(xy(t.a)).toEqual(xy({ x: viewport.convertToViewportPoint(100, 50)[0]!, y: viewport.convertToViewportPoint(100, 50)[1]! }));
    expect(xy(t.b)).toEqual(xy({ x: viewport.convertToViewportPoint(300, 50)[0]!, y: viewport.convertToViewportPoint(300, 50)[1]! }));
  });

  it('textos vêm com o centro em coordenadas da página', async () => {
    const { vetores } = await abrir('BT /F1 20 Tf 100 300 Td (Sala) Tj ET');
    expect(vetores.textos).toHaveLength(1);
    const t = vetores.textos[0]!;
    expect(t.texto).toBe('Sala');
    expect(t.ponto.x).toBeGreaterThan(100);
    expect(t.ponto.x).toBeLessThan(160);
    expect(t.ponto.y).toBeGreaterThan(500 - 300 - 20);
    expect(t.ponto.y).toBeLessThan(500 - 300);
  });

  it('página em branco (sem traços) → o reconhecimento responde que o PDF não é vetorial', async () => {
    const { vetores } = await abrir('');
    expect(vetores.tracos).toEqual([]);
    expect(reconhecerVetores(paraEntradaDoReconhecimento(vetores), { pagina: 1, escala: 0.01 }).situacao).toBe('nao-vetorial');
  });

  it('ponta a ponta: cômodo de paredes duplas desenhado no PDF → 4 paredes + ambiente "Sala" de 12 m²', async () => {
    // 1 unidade = 1 cm: interno 400 × 300 a partir de (100, 100); externo a 15 de distância
    const { vetores } = await abrir('0.7 w 100 100 400 300 re S 85 85 430 330 re S BT /F1 12 Tf 280 240 Td (Sala) Tj ET');
    const r = reconhecerVetores(paraEntradaDoReconhecimento(vetores), { pagina: 1, escala: 0.01 });
    expect(r.situacao).toBe('ok');
    const paredes = r.elementos.filter((e) => e.tipo === 'parede');
    const ambientes = r.elementos.filter((e) => e.tipo === 'ambiente');
    expect(paredes).toHaveLength(4);
    expect(ambientes).toHaveLength(1);
    const sala = ambientes[0]!;
    expect(sala.tipo === 'ambiente' && sala.props.nome).toBe('Sala');
    if (sala.geometria.tipo !== 'poligono') throw new Error('esperado polígono');
    const xs = sala.geometria.pontos.map((p) => p.x);
    const ys = sala.geometria.pontos.map((p) => p.y);
    expect((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) * 0.0001).toBeCloseTo(12, 6);
  });
});
