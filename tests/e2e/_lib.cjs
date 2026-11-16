/**
 * QA (S10) — utilitários dos scripts e2e (Playwright + Vite dev em http://localhost:5199).
 * Rodar com:  bash tests/e2e/rodar.sh   (sobe o Vite, roda os scripts, encerra o Vite).
 */
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const URL_APP = process.env.URL_APP || 'http://localhost:5199/';
const SAIDA = path.join(__dirname, 'saida');
fs.mkdirSync(SAIDA, { recursive: true });

/** Planta do caso de exemplo: 1 unidade do PDF (pt) = 0,02 m; margem de 1 m; página 550 × 460 pt. */
const ESCALA = 0.02;
const ORIGEM = 1;
const PAGINA = { largura: 550, altura: 460 };
const pt = (x, y) => ({ x: (x + ORIGEM) / ESCALA, y: (y + ORIGEM) / ESCALA });
/** Cota de 3,07 m desenhada sob o quarto (y = 7,7 m), de x = 0,06 a x = 3,13 m. */
const COTA = { a: pt(0.06, 7.7), b: pt(3.13, 7.7), medida: '3,07' };

function svgDaPlanta() {
  const L = [[0, 0], [9, 0], [9, 4], [3.2, 4], [3.2, 7.2], [0, 7.2]].map(([x, y]) => pt(x, y));
  const P = (p) => `${p.x},${p.y}`;
  const texto = (x, y, t) => { const p = pt(x, y); return `<text x="${p.x}" y="${p.y}" font-size="9" text-anchor="middle" font-family="Arial">${t}</text>`; };
  const linha = (a, b, w = 1) => `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#000" stroke-width="${w}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGINA.largura}pt" height="${PAGINA.altura}pt" viewBox="0 0 ${PAGINA.largura} ${PAGINA.altura}">
  <rect width="100%" height="100%" fill="#fff"/>
  <polygon points="${L.map(P).join(' ')}" fill="none" stroke="#000" stroke-width="3"/>
  ${linha(pt(0, 4), pt(3.2, 4), 3)}
  ${linha(pt(3, 0), pt(3, 4), 0.5)} ${linha(pt(6.5, 0), pt(6.5, 4), 0.5)}
  ${texto(1.5, 2, 'SALA 3,00 x 4,00')} ${texto(4.75, 2, 'COZINHA')} ${texto(7.75, 2.4, 'BANHEIRO')} ${texto(1.6, 5.6, 'QUARTO 3,07 x 2,98')}
  ${linha(COTA.a, COTA.b, 0.7)}
  ${linha({ x: COTA.a.x, y: COTA.a.y - 5 }, { x: COTA.a.x, y: COTA.a.y + 5 }, 0.7)}
  ${linha({ x: COTA.b.x, y: COTA.b.y - 5 }, { x: COTA.b.x, y: COTA.b.y + 5 }, 0.7)}
  ${texto(1.6, 8.0, '3,07')}
  </svg>`;
}

/** Gera o PDF da planta (1 página de 550 × 460 pt) com page.pdf() de um SVG. */
async function gerarPdfDaPlanta(browser, destino) {
  const page = await browser.newPage();
  await page.setContent(`<html><body style="margin:0">${svgDaPlanta()}</body></html>`);
  await page.pdf({ path: destino, width: `${PAGINA.largura / 72}in`, height: `${PAGINA.altura / 72}in`, printBackground: true, pageRanges: '1' });
  await page.close();
  return destino;
}

/** Abre o app registrando erros de console, pageerror e requisições fora do localhost. */
async function abrirApp(browser, opcoes = {}) {
  const context = opcoes.context || (await browser.newContext({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true }));
  const page = await context.newPage();
  const registro = { erros: [], avisos: [], externas: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') registro.erros.push(`console.error: ${m.text()}`);
    if (m.type() === 'warning') registro.avisos.push(m.text());
  });
  page.on('pageerror', (e) => registro.erros.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    const u = r.url();
    if (!/^(http:\/\/localhost:5199|data:|blob:)/.test(u)) registro.externas.push(u);
  });
  await page.goto(URL_APP);
  await page.waitForSelector('.app', { timeout: 20000 });
  return { context, page, registro };
}

/** Coordenada do PDF → coordenada de tela (pelo retângulo do canvas do PDF). */
async function telaDe(page, p) {
  const r = await page.locator('canvas.vz-pdf').boundingBox();
  const dim = await page.evaluate(async () => {
    const { useLevantamento } = await import('/src/core/store/index.ts');
    const s = useLevantamento.getState();
    return s.projeto.paginas[s.paginaAtual];
  });
  return { x: r.x + (p.x / dim.largura) * r.width, y: r.y + (p.y / dim.altura) * r.height };
}

async function clicarNaPlanta(page, p, opcoes) {
  const t = await telaDe(page, p);
  await page.mouse.move(t.x, t.y);
  await page.mouse.click(t.x, t.y, opcoes);
}

const estado = (page, fn, arg) =>
  page.evaluate(
    async ([src, a]) => {
      const { useLevantamento } = await import('/src/core/store/index.ts');
      const { calcularLevantamento } = await import('/src/app/levantamento.ts');
      // eslint-disable-next-line no-new-func
      return new Function('s', 'calc', 'arg', `return (${src})(s, calc, arg)`)(useLevantamento.getState(), calcularLevantamento, a);
    },
    [fn.toString(), arg],
  );

/** Texto da linha da árvore (coluna direita) cuja descrição começa com `descricao`. */
async function linhaDaArvore(page, descricao) {
  return page.evaluate((d) => {
    const tr = [...document.querySelectorAll('.arvore-tabela tr')].find((r) => r.children[0]?.textContent?.trim().startsWith(d));
    return tr ? tr.children[1].textContent.trim().replace(/\s+/g, ' ') : null;
  }, descricao);
}

function criarRelatorio(nome) {
  const itens = [];
  return {
    ok(cond, descricao, detalhe = '') {
      itens.push({ ok: !!cond, descricao, detalhe });
      console.log(`${cond ? 'PASSOU' : 'FALHOU'} | ${descricao}${detalhe ? ` | ${detalhe}` : ''}`);
      return !!cond;
    },
    info(texto) {
      console.log(`INFO   | ${texto}`);
    },
    fim(registro) {
      const falhas = itens.filter((i) => !i.ok);
      console.log(`\n== ${nome}: ${itens.length - falhas.length} passaram, ${falhas.length} falharam`);
      if (registro) {
        console.log(`   erros de console/pageerror: ${registro.erros.length}; requisições externas: ${registro.externas.length}`);
        for (const e of registro.erros) console.log(`   ERRO: ${e}`);
        for (const e of registro.externas) console.log(`   EXTERNA: ${e}`);
      }
      fs.writeFileSync(path.join(SAIDA, `${nome}.json`), JSON.stringify({ itens, registro }, null, 2));
      return falhas.length;
    },
  };
}

const foto = (page, nome) => page.screenshot({ path: path.join(SAIDA, nome) });

module.exports = { chromium, URL_APP, SAIDA, ESCALA, ORIGEM, PAGINA, COTA, pt, gerarPdfDaPlanta, abrirApp, telaDe, clicarNaPlanta, estado, linhaDaArvore, criarRelatorio, foto };
