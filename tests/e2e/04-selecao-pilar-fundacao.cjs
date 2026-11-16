/**
 * QA (S10) — e2e 04: dá para selecionar com o mouse um PILAR que tem FUNDAÇÃO no mesmo ponto?
 * (As sugestões de estrutura criam a sapata exatamente sobre o pilar.)
 */
const path = require('node:path');
const L = require('./_lib.cjs');

(async () => {
  const browser = await L.chromium.launch();
  const R = L.criarRelatorio('04-selecao-pilar-fundacao');
  const pdf = await L.gerarPdfDaPlanta(browser, path.join(L.SAIDA, 'planta-caso.pdf'));
  const { page, registro } = await L.abrirApp(browser);
  page.on('dialog', (d) => d.accept());
  await page.setInputFiles('.vz-barra input[type=file]', pdf);
  await page.waitForSelector('canvas.vz-pdf', { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const { useLevantamento } = await import('/src/core/store/index.ts');
    const caso = await import('/tests/caso-exemplo.ts');
    const s = useLevantamento.getState();
    const p = caso.comSugestoes(caso.casoBase(), 'estrutura');
    s.calibrarPagina(1, caso.ESCALA);
    s.atualizarParametros({ gerais: p.parametros.gerais });
    s.adicionarElementos(p.elementos);
    for (const d of ['arquitetura', 'eletrica', 'hidraulica']) s.definirCamada(d, false); // só a estrutura visível
    s.definirFerramenta({ modo: 'selecionar' });
  });
  await page.waitForTimeout(500);
  // dá zoom para facilitar o clique
  for (let i = 0; i < 3; i++) await page.getByTitle('Aumentar zoom').click();
  await page.waitForTimeout(500);
  const alvo = await L.estado(page, (s) => s.projeto.elementos.find((e) => e.id === 'est-1-P7').geometria.ponto);
  const centro = await L.telaDe(page, alvo);
  const tipos = {};
  for (let dy = -14; dy <= 14; dy += 2) {
    for (let dx = -14; dx <= 14; dx += 2) {
      await L.estado(page, (s) => s.selecionar([]));
      await page.mouse.click(centro.x + dx, centro.y + dy);
      const sel = await L.estado(page, (s) => s.selecaoIds.map((id) => s.projeto.elementos.find((e) => e.id === id).tipo));
      const k = sel.join('+') || '(nada)';
      tipos[k] = (tipos[k] || 0) + 1;
    }
  }
  await page.mouse.click(centro.x, centro.y);
  await page.waitForTimeout(200);
  await L.foto(page, '50-clique-no-pilar-com-sapata.png');
  R.info(`225 cliques numa grade de ±14 px em volta do pilar P7 (zoom ampliado) selecionaram: ${JSON.stringify(tipos)}`);
  R.ok((tipos.pilar || 0) > 0, '[ACHADO-V1] é possível selecionar com o mouse um pilar que tem sapata sugerida no mesmo ponto', JSON.stringify(tipos));
  R.ok(registro.erros.length === 0, 'nenhum erro de console / pageerror', registro.erros.slice(0, 3).join(' || '));
  const falhas = R.fim(registro);
  await browser.close();
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error('FALHA DO SCRIPT:', e);
  process.exit(2);
});
