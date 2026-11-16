/**
 * QA (S10) — e2e 02: persistência após reload (IndexedDB real), Excel × painel, JSON reimportável, DXF mínimo.
 * Critérios 9 e 10 no navegador.
 */
const path = require('node:path');
const fs = require('node:fs');
const XLSX = require(path.join(__dirname, '../../node_modules/xlsx'));
const L = require('./_lib.cjs');

/** Lê a árvore (coluna direita) como Map "Disciplina|Grupo|Descrição" → { confirmado, pendente } (textos pt-BR). */
async function lerArvore(page) {
  // abre o ramo Materiais se estiver fechado
  const mat = page.locator('.arvore > .ramo > .ramo-titulo', { hasText: 'Materiais' });
  if ((await mat.getAttribute('aria-expanded')) === 'false') await mat.click();
  await page.waitForTimeout(200);
  return page.evaluate(() => {
    const num = (t) => Number(t.replace(/\./g, '').replace(',', '.'));
    const saida = {};
    for (const ramo of document.querySelectorAll('.arvore > .ramo')) {
      const disciplina = ramo.querySelector(':scope > .ramo-titulo .ramo-nome').textContent.trim();
      const ler = (tabela, grupo) => {
        for (const tr of tabela.querySelectorAll('tr')) {
          const descricao = tr.children[0].childNodes[0].textContent.trim();
          const celula = tr.children[1];
          const pendEl = celula.querySelector('.pendente');
          const confTxt = [...celula.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
          const m = confTxt.match(/^([\d.,]+) (.+)$/);
          const p = pendEl ? pendEl.textContent.trim().match(/^\+ ([\d.,]+) (.+) pend\.$/) : null;
          const unidade = m ? m[2] : p ? p[2] : '';
          saida[`${disciplina}|${grupo}|${descricao}|${unidade}`] = { confirmado: m ? num(m[1]) : 0, pendente: p ? num(p[1]) : 0 };
        }
      };
      const grupos = ramo.querySelectorAll(':scope > .ramo-filhos > .ramo');
      if (grupos.length === 0) {
        const t = ramo.querySelector(':scope > .ramo-filhos > table');
        if (t) ler(t, '');
      }
      for (const g of grupos) ler(g.querySelector('table'), g.querySelector('.ramo-nome').textContent.trim());
    }
    return saida;
  });
}

(async () => {
  const browser = await L.chromium.launch();
  const R = L.criarRelatorio('02-persistencia-export-import');
  const pdf = await L.gerarPdfDaPlanta(browser, path.join(L.SAIDA, 'planta-caso.pdf'));
  const { context, page, registro } = await L.abrirApp(browser);
  page.on('dialog', (d) => d.accept());

  // ------------------------------------------------------------ monta o caso de exemplo completo
  await page.setInputFiles('.vz-barra input[type=file]', pdf);
  await page.waitForSelector('canvas.vz-pdf', { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const { useLevantamento } = await import('/src/core/store/index.ts');
    const caso = await import('/tests/caso-exemplo.ts');
    const s = useLevantamento.getState();
    const p = caso.casoExemplo();
    s.calibrarPagina(1, caso.ESCALA);
    s.atualizarParametros({ gerais: p.parametros.gerais });
    for (const t of p.esquadrias) s.salvarEsquadria(t);
    s.adicionarElementos(p.elementos);
    s.definirNome(p.nome);
    s.definirCamada('hidraulica', false);
  });
  await page.locator('.etapas button', { hasText: 'O que medir' }).click();
  await page.waitForTimeout(1200); // > debounce do salvamento (400 ms)
  const resumo = (pg) =>
    L.estado(pg, (s, calc) => {
      const lev = calc(s.projeto);
      const cont = {};
      for (const e of s.projeto.elementos) cont[`${e.tipo}/${e.status}`] = (cont[`${e.tipo}/${e.status}`] || 0) + 1;
      return {
        nome: s.projeto.nome,
        arquivoNome: s.projeto.arquivoNome,
        totalPaginas: s.projeto.totalPaginas,
        escala: s.projeto.paginas[1] && s.projeto.paginas[1].escala,
        gerais: s.projeto.parametros.gerais,
        esquadrias: s.projeto.esquadrias.map((t) => t.codigo),
        camadas: s.projeto.camadas,
        elementos: cont,
        nElementos: s.projeto.elementos.length,
        temPdf: s.pdfDados ? s.pdfDados.length : 0,
        linhas: ['arquitetura', 'estrutura', 'eletrica', 'hidraulica'].flatMap((d) => lev[d].linhas.map((l) => `${l.id}|${l.status}|${l.quantidade.toFixed(6)}`)),
        materiais: lev.materiais.map((m) => `${m.id}|${m.quantidade.toFixed(6)}`),
      };
    });
  const antes = await resumo(page);
  R.ok(antes.nElementos > 80 && antes.temPdf > 0 && antes.escala === 0.02, 'caso de exemplo montado no navegador', `${antes.nElementos} elementos, PDF ${antes.temPdf} bytes, escala ${antes.escala}`);
  await L.foto(page, '30-caso-antes-do-reload.png');
  const arvoreAntes = await lerArvore(page);

  // ------------------------------------------------------------ CRITÉRIO 10: reload
  await page.reload();
  await page.waitForSelector('.app', { timeout: 20000 });
  await page.waitForSelector('canvas.vz-pdf', { timeout: 20000 });
  await page.waitForTimeout(800);
  const depois = await resumo(page);
  R.ok(depois.nome === antes.nome, 'CRITÉRIO 10: nome do projeto persiste', depois.nome);
  R.ok(depois.nElementos === antes.nElementos && JSON.stringify(depois.elementos) === JSON.stringify(antes.elementos), 'CRITÉRIO 10: elementos (tipos e status pendente/confirmado) persistem', JSON.stringify(depois.elementos));
  R.ok(depois.escala === antes.escala, 'CRITÉRIO 10: escala persiste', String(depois.escala));
  R.ok(JSON.stringify(depois.gerais) === JSON.stringify(antes.gerais), 'CRITÉRIO 10: parâmetros (pé-direito, espessura, pessoas) persistem', JSON.stringify(depois.gerais));
  R.ok(JSON.stringify(depois.esquadrias) === JSON.stringify(antes.esquadrias), 'CRITÉRIO 10: cadastro de esquadrias persiste', JSON.stringify(depois.esquadrias));
  R.ok(depois.temPdf === antes.temPdf && depois.arquivoNome === antes.arquivoNome && depois.totalPaginas === 1, 'CRITÉRIO 10: planta (bytes do PDF, nome, páginas) persiste', `${depois.arquivoNome}, ${depois.temPdf} bytes`);
  R.ok(JSON.stringify(depois.camadas) === JSON.stringify(antes.camadas) && depois.camadas.hidraulica === false, 'CRITÉRIO 10: camadas ligadas/desligadas persistem', JSON.stringify(depois.camadas));
  R.ok(JSON.stringify(depois.linhas) === JSON.stringify(antes.linhas) && JSON.stringify(depois.materiais) === JSON.stringify(antes.materiais), 'CRITÉRIO 10: levantamento recalculado idêntico após o reload', `${depois.linhas.length} linhas, ${depois.materiais.length} materiais`);
  const pintado = await page.evaluate(() => {
    const c = document.querySelector('canvas.vz-pdf');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let escuros = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 80 && d[i + 1] < 80 && d[i + 2] < 80 && d[i + 3] > 200) escuros++;
    return escuros;
  });
  R.ok(pintado > 500, 'CRITÉRIO 10: a planta é redesenhada após o reload (pixels escuros no canvas do PDF)', `${pintado} px`);
  await page.locator('.etapas button', { hasText: 'O que medir' }).click();
  await L.estado(page, (s) => s.definirCamada('hidraulica', true));
  await page.waitForTimeout(400);
  await L.foto(page, '31-caso-depois-do-reload.png');
  const arvoreDepois = await lerArvore(page);
  R.ok(JSON.stringify(arvoreDepois) === JSON.stringify(arvoreAntes), 'CRITÉRIO 10: árvore (painel) idêntica após o reload', `${Object.keys(arvoreDepois).length} linhas`);
  // desfazer não deve apagar o projeto recém-carregado
  R.ok((await L.estado(page, (s) => s.podeDesfazer)) === false, 'após o reload o histórico de desfazer começa vazio');
  // segunda aba/contexto do mesmo navegador também enxerga o projeto (IndexedDB compartilhado)
  const outra = await L.abrirApp(browser, { context });
  await outra.page.waitForTimeout(800);
  R.ok((await resumo(outra.page)).nElementos === antes.nElementos, 'nova aba do mesmo navegador carrega o mesmo levantamento');
  await outra.page.close();

  // ------------------------------------------------------------ CRITÉRIO 9: Excel baixado pela interface × painel
  await page.locator('.abas button', { hasText: 'Materiais' }).click();
  const [dlX] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exportar Excel/ }).click()]);
  const arqX = path.join(L.SAIDA, dlX.suggestedFilename());
  await dlX.saveAs(arqX);
  R.ok(/\.xlsx$/.test(arqX), 'download do Excel', path.basename(arqX));
  let livro = null;
  try {
    livro = XLSX.read(fs.readFileSync(arqX), { type: 'buffer' });
  } catch (e) {
    R.ok(false, 'CRITÉRIO 9: Excel abre sem erro', e.message);
  }
  if (livro) {
    R.ok(true, 'CRITÉRIO 9: Excel abre sem erro (relido com a lib xlsx)', `${fs.statSync(arqX).size} bytes`);
    R.ok(JSON.stringify(livro.SheetNames) === JSON.stringify(['Resumo', 'Ambientes', 'Esquadrias', 'Paredes', 'Acabamentos', 'Estrutura', 'Elétrica', 'Hidráulica', 'Materiais']), 'CRITÉRIO 9: 9 abas na ordem', livro.SheetNames.join(', '));
    const m = XLSX.utils.sheet_to_json(livro.Sheets.Resumo, { header: 1, defval: null });
    const ini = m.findIndex((r) => r[0] === 'Disciplina');
    const excel = {};
    for (const r of m.slice(ini + 1)) {
      if (!r[0]) continue;
      const desc = r[3] ? `${r[2]} (${r[3]})` : String(r[2]);
      excel[`${r[0]}|${r[1] || ''}|${desc}|${r[4]}`] = { confirmado: Number(r[5] || 0), pendente: Number(r[6] || 0) };
    }
    const painel = await lerArvore(page);
    const chavesP = Object.keys(painel).sort();
    const chavesE = Object.keys(excel).sort();
    const soPainel = chavesP.filter((k) => !(k in excel));
    const soExcel = chavesE.filter((k) => !(k in painel));
    R.ok(soPainel.length === 0 && soExcel.length === 0, 'CRITÉRIO 9: Resumo tem exatamente as mesmas linhas do painel (DOM da árvore)', `painel ${chavesP.length}, excel ${chavesE.length}; só painel: ${soPainel.slice(0, 3).join(' ; ')}; só excel: ${soExcel.slice(0, 3).join(' ; ')}`);
    const dif = chavesP.filter((k) => excel[k] && (Math.abs(excel[k].confirmado - painel[k].confirmado) > 0.00501 || Math.abs(excel[k].pendente - painel[k].pendente) > 0.00501));
    R.ok(dif.length === 0, 'CRITÉRIO 9: totais do Resumo batem com o painel (confirmado e pendente, a 2 casas)', dif.slice(0, 3).map((k) => `${k}: excel ${JSON.stringify(excel[k])} painel ${JSON.stringify(painel[k])}`).join(' ; '));
    const cab = Object.fromEntries(m.slice(0, 5).map((r) => [r[0], r[1]]));
    R.ok(cab.Levantamento === 'Caso de exemplo QA' && cab['Pé-direito (m)'] === 2.8 && cab['Nº de pessoas'] === 4, 'Resumo: cabeçalho (nome, pé-direito, pessoas)', JSON.stringify(cab));
    const fmt = livro.Sheets.Resumo[XLSX.utils.encode_cell({ r: ini + 1, c: 5 })];
    R.info(`formato da 1ª célula de quantidade: t=${fmt && fmt.t} z=${fmt && fmt.z} w=${fmt && fmt.w}`);
  }

  // ------------------------------------------------------------ JSON exportado → reimportado
  const [dlJ] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar JSON' }).click()]);
  const arqJ = path.join(L.SAIDA, dlJ.suggestedFilename());
  await dlJ.saveAs(arqJ);
  const env = JSON.parse(fs.readFileSync(arqJ, 'utf8'));
  R.ok(env.formato === 'bim-leve' && env.projeto && env.projeto.elementos.length === antes.nElementos, 'JSON exportado: envelope com o projeto completo', `${env.projeto.elementos.length} elementos`);
  // novo levantamento (confirm aceito) → vazio
  await page.getByRole('button', { name: 'Novo levantamento' }).click();
  await page.waitForTimeout(600);
  const vazio = await resumo(page);
  R.ok(vazio.nElementos === 0 && vazio.temPdf === 0 && vazio.gerais.peDireito === null, '"Novo levantamento" zera elementos, planta e dados essenciais', JSON.stringify({ n: vazio.nElementos, pdf: vazio.temPdf, gerais: vazio.gerais }));
  await L.foto(page, '32-novo-levantamento.png');
  await page.locator('.etapas button', { hasText: 'O que medir' }).click();
  await page.locator('.abas button', { hasText: 'Importar' }).click();
  await page.setInputFiles('input[aria-label="Arquivo JSON"]', arqJ);
  await page.getByRole('button', { name: 'Importar JSON' }).click();
  await page.waitForTimeout(800);
  const reimp = await resumo(page);
  R.ok(reimp.nElementos === antes.nElementos && JSON.stringify(reimp.linhas) === JSON.stringify(antes.linhas), 'JSON do próprio app é reimportável: mesmos elementos e mesmo levantamento', `${reimp.nElementos} elementos, ${reimp.linhas.length} linhas`);
  R.ok(reimp.escala === 0.02 && reimp.gerais.peDireito === 2.8 && reimp.esquadrias.length === 3, 'JSON reimportado: escala, parâmetros e esquadrias', JSON.stringify({ e: reimp.escala, g: reimp.gerais, q: reimp.esquadrias }));
  const txtImp = await page.locator('.conteudo-etapa').innerText();
  R.ok(/carregue novamente o arquivo/.test(txtImp), 'importação avisa que a planta (PDF) não faz parte do JSON', (txtImp.match(/.*carregue novamente.*/) || [''])[0]);
  await page.waitForTimeout(400);
  await L.foto(page, '33-json-reimportado.png');
  const semPlanta = await L.estado(page, (s) => ({ pdf: s.pdfDados ? s.pdfDados.length : 0, arquivo: s.projeto.arquivoNome, paginas: s.projeto.totalPaginas }));
  R.info(`após reimportar o JSON sem planta: ${JSON.stringify(semPlanta)}; canvas do PDF visível: ${await page.locator('canvas.vz-pdf').count()}`);
  const centro = await page.locator('.vz-area').innerText().catch(() => '');
  R.info(`texto da área da planta após reimportar: ${centro.replace(/\n/g, ' / ').slice(0, 200)}`);
  // recarrega a planta e confere que os elementos aparecem sobre ela
  await page.setInputFiles('.vz-barra input[type=file]', pdf);
  await page.waitForSelector('canvas.vz-pdf', { timeout: 20000 });
  await page.waitForTimeout(800);
  const aposPdf = await resumo(page);
  R.ok(aposPdf.nElementos === antes.nElementos && aposPdf.escala === 0.02, 'recarregar o PDF depois do JSON mantém elementos e escala', `${aposPdf.nElementos} elementos, escala ${aposPdf.escala}`);
  await L.foto(page, '34-json-reimportado-com-planta.png');

  // ------------------------------------------------------------ DXF mínimo (projeto novo, sem planta)
  await page.getByRole('button', { name: 'Novo levantamento' }).click();
  await page.waitForTimeout(600);
  const dxf = ['0', 'SECTION', '2', 'ENTITIES',
    '0', 'LWPOLYLINE', '8', 'AMBIENTES', '90', '4', '70', '1', '10', '0', '20', '0', '10', '4', '20', '0', '10', '4', '20', '3', '10', '0', '20', '3',
    '0', 'TEXT', '8', 'TEXTOS', '10', '2', '20', '1.5', '40', '0.2', '1', 'Sala',
    '0', 'LINE', '8', 'PAREDES', '10', '0', '20', '-0.075', '11', '4', '21', '-0.075',
    '0', 'LINE', '8', 'PAREDES', '10', '0', '20', '0.075', '11', '4', '21', '0.075',
    '0', 'ENDSEC', '0', 'EOF', ''].join('\n');
  const arqD = path.join(L.SAIDA, 'minimo.dxf');
  fs.writeFileSync(arqD, dxf);
  await page.locator('.etapas button', { hasText: 'O que medir' }).click();
  await page.locator('.abas button', { hasText: 'Importar' }).click();
  await page.setInputFiles('input[aria-label="Arquivo DXF"]', arqD);
  const botaoDxf = page.getByRole('button', { name: 'Importar DXF' });
  R.ok(await botaoDxf.isDisabled(), 'DXF: sem escolher a unidade, o botão fica desabilitado (unidade não é presumida)');
  await page.locator('.conteudo-etapa select').first().selectOption({ index: 1 });
  const unidade = await page.locator('.conteudo-etapa select').first().evaluate((e) => e.options[e.selectedIndex].textContent);
  // escolhe "metros" se existir
  const opcoes = await page.locator('.conteudo-etapa select').first().evaluate((e) => [...e.options].map((o) => [o.value, o.textContent]));
  const metros = opcoes.find((o) => /^m$|metro/i.test(o[0]) || /metro/i.test(o[1]));
  if (metros) await page.locator('.conteudo-etapa select').first().selectOption(metros[0]);
  await botaoDxf.click();
  await page.waitForTimeout(1500);
  const txtDxf = await page.locator('.conteudo-etapa').innerText();
  const impDxf = await L.estado(page, (s, calc) => ({
    elementos: s.projeto.elementos.map((e) => `${e.tipo}/${e.status}/${e.origem}`),
    escala: s.projeto.paginas[1] && s.projeto.paginas[1].escala,
    pdf: s.pdfDados ? s.pdfDados.length : 0,
    linhas: calc(s.projeto).arquitetura.linhas.map((l) => `${l.descricao}=${l.quantidade.toFixed(2)} ${l.unidade} (${l.status})`),
  }));
  R.info(`DXF: unidades disponíveis ${JSON.stringify(opcoes)}; usada ${metros ? metros[1] : unidade}`);
  R.info(`DXF: ${(txtDxf.match(/Importado:.*/) || txtDxf.match(/.*(erro|não foi).*/i) || [''])[0]}`);
  R.ok(impDxf.elementos.some((e) => e.startsWith('ambiente/pendente/importado')), 'DXF mínimo: polilinha fechada vira ambiente pendente (origem "importado")', JSON.stringify(impDxf.elementos));
  R.ok(impDxf.elementos.every((e) => /\/pendente\/importado$/.test(e)), 'DXF: tudo o que foi importado nasce pendente', JSON.stringify(impDxf.elementos));
  R.ok(impDxf.elementos.some((e) => e.startsWith('parede/')), 'DXF mínimo: par de linhas paralelas vira parede', JSON.stringify(impDxf.elementos));
  R.ok(impDxf.linhas.some((l) => /Sala — área=12\.00 m²/.test(l)), 'DXF mínimo: ambiente "Sala" de 4 × 3 m = 12,00 m² (texto vira nome, escala do DXF)', impDxf.linhas.slice(0, 4).join(' | '));
  R.ok(impDxf.pdf > 0 && impDxf.escala > 0, 'DXF sem planta: cria planta em branco calibrada', `pdf ${impDxf.pdf} bytes, escala ${impDxf.escala}`);
  await page.waitForTimeout(500);
  await L.foto(page, '35-dxf-importado.png');

  R.ok(registro.erros.length === 0, 'nenhum erro de console / pageerror', registro.erros.slice(0, 5).join(' || '));
  R.ok(registro.externas.length === 0, 'nenhuma requisição de rede fora do localhost', registro.externas.slice(0, 5).join(' || '));
  const falhas = R.fim(registro);
  await browser.close();
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error('FALHA DO SCRIPT:', e);
  process.exit(2);
});
