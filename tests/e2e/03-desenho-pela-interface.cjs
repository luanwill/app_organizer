/**
 * QA (S10) — e2e 03: monta o caso SÓ com mouse/teclado (paredes, ambientes, esquadrias, quadro,
 * reservatório, caixa de inspeção), aceita/descarta sugestões individualmente e exporta o PDF.
 */
const path = require('node:path');
const L = require('./_lib.cjs');

(async () => {
  const browser = await L.chromium.launch();
  const R = L.criarRelatorio('03-desenho-pela-interface');
  const pdf = await L.gerarPdfDaPlanta(browser, path.join(L.SAIDA, 'planta-caso.pdf'));
  const { page, registro } = await L.abrirApp(browser);
  page.on('dialog', (d) => d.accept());
  const etapa = (t) => page.locator('.etapas button', { hasText: t }).click();
  const aba = (t) => page.locator('.abas button', { hasText: t }).click();
  const els = (tipo) => L.estado(page, (s, c, t) => s.projeto.elementos.filter((e) => e.tipo === t), tipo);

  await page.setInputFiles('.vz-barra input[type=file]', pdf);
  await page.waitForSelector('canvas.vz-pdf', { timeout: 20000 });
  await page.waitForTimeout(600);

  // calibração pela interface
  await page.getByRole('button', { name: 'Calibrar escala' }).click();
  await L.clicarNaPlanta(page, L.COTA.a);
  await L.clicarNaPlanta(page, L.COTA.b);
  await page.fill('.vz-calibracao input', '3,07');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const escala = await L.estado(page, (s) => s.projeto.paginas[1].escala);
  R.ok(Math.abs(escala - 0.02) / 0.02 < 0.01, 'calibração (Enter aplica)', String(escala));
  const txtEscala = await page.locator('.conteudo-etapa').innerText();
  R.ok(/0,0\d+ m/.test(txtEscala), 'etapa 1 mostra a escala com vírgula decimal', (txtEscala.match(/Escala:.*/) || [''])[0]);

  // dados essenciais
  await etapa('Dados essenciais');
  const campos = page.locator('.conteudo-etapa label.campo input');
  for (const [i, v] of [[0, '2,80'], [1, '0,15'], [2, '4']]) { await campos.nth(i).fill(v); await campos.nth(i).press('Enter'); }
  // valores inválidos são recusados
  await campos.nth(0).fill('abc'); await campos.nth(0).press('Enter');
  await campos.nth(2).fill('2,5'); await campos.nth(2).press('Enter');
  const g = await L.estado(page, (s) => s.projeto.parametros.gerais);
  R.ok(g.peDireito === 2.8 && g.numeroPessoas === 4, 'entradas inválidas ("abc", pessoas "2,5") são recusadas e o valor anterior fica', JSON.stringify(g));

  // ------------------------------------------------------------ paredes com o mouse (painel Arquitetura → Parede)
  await etapa('O que medir');
  await aba('Arquitetura');
  const L6 = [[0, 0], [9, 0], [9, 4], [3.2, 4], [3.2, 7.2], [0, 7.2]];
  for (let i = 0; i < L6.length; i++) {
    await page.locator('.conteudo-etapa').getByRole('button', { name: 'Parede', exact: true }).click();
    const a = L.pt(...L6[i]);
    const b = L.pt(...L6[(i + 1) % L6.length]);
    await L.clicarNaPlanta(page, a);
    await L.clicarNaPlanta(page, b);
    await page.keyboard.press('Enter'); // conclui o modo aberto
    await page.waitForTimeout(80);
  }
  await page.locator('.conteudo-etapa').getByRole('button', { name: 'Parede', exact: true }).click();
  await L.clicarNaPlanta(page, L.pt(0, 4));
  await L.clicarNaPlanta(page, L.pt(3.2, 4));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const paredes = await els('parede');
  R.ok(paredes.length === 7 && paredes.every((p) => p.props.espessura === 0.15 && p.geometria.pontos.length === 2), '7 paredes desenhadas com o mouse, espessura padrão 0,15', `${paredes.length} paredes`);
  const comp = await L.estado(page, (s, calc) => calc(s.projeto).arquitetura.linhas.filter((l) => l.grupo === 'Paredes' && l.unidade === 'm').reduce((a, l) => a + l.quantidade, 0));
  R.ok(Math.abs(comp - 35.6) < 0.2, 'comprimento total das paredes desenhadas ≈ 35,60 m (snap nos vértices)', comp.toFixed(3));
  // snap: o fim de uma parede coincide exatamente com o começo da seguinte?
  const snap = paredes.slice(0, 5).every((p, i) => Math.hypot(p.geometria.pontos[1].x - paredes[i + 1].geometria.pontos[0].x, p.geometria.pontos[1].y - paredes[i + 1].geometria.pontos[0].y) < 1e-6);
  R.ok(snap, 'snap a vértice: paredes consecutivas compartilham exatamente o mesmo ponto');

  // ------------------------------------------------------------ ambientes (retângulo) com o mouse
  const ambientes = [['Sala', 'sala', [0, 0, 3, 4]], ['Cozinha', 'cozinha', [3, 0, 6.5, 4]], ['Banheiro', 'banheiro', [6.5, 0, 9, 4]], ['Quarto', 'quarto', [0.06, 4.1, 3.13, 7.08]]];
  for (const [, , [x0, y0, x1, y1]] of ambientes) {
    await page.getByRole('button', { name: 'Ambiente (retângulo)' }).click();
    // segura Alt? não: clica dentro para evitar snap em vértices de parede quando não coincide
    await L.clicarNaPlanta(page, L.pt(x0, y0));
    await L.clicarNaPlanta(page, L.pt(x1, y1));
    await page.waitForTimeout(120);
  }
  let ambs = await els('ambiente');
  R.ok(ambs.length === 4, '4 ambientes desenhados (retângulo, 2 cliques)', ambs.map((a) => a.props.nome).join(', '));
  // editar nome/tipo do ambiente selecionado pelo painel
  await L.foto(page, '40-ambientes-desenhados.png');
  const painel = await page.locator('.conteudo-etapa').innerText();
  R.info(`painel Arquitetura após desenhar: ${painel.replace(/\n+/g, ' | ').slice(0, 500)}`);
  // define tipos pela store (o teste do formulário de edição é feito abaixo para 1 ambiente)
  const idBanheiro = ambs[2].id;
  await L.estado(page, (s) => s.selecionar([]));
  await page.locator('.conteudo-etapa button', { hasText: ambs[2].props.nome }).first().click();
  await page.waitForTimeout(200);
  const sel = await L.estado(page, (s) => s.selecaoIds);
  R.ok(sel[0] === idBanheiro, 'clicar no ambiente na lista do painel seleciona-o', JSON.stringify(sel));
  const selects = page.locator('.conteudo-etapa select');
  const nSel = await selects.count();
  let trocou = false;
  for (let i = 0; i < nSel; i++) {
    const ops = await selects.nth(i).evaluate((e) => [...e.options].map((o) => o.value));
    if (ops.includes('banheiro')) { await selects.nth(i).selectOption('banheiro'); trocou = true; break; }
  }
  await page.waitForTimeout(150);
  const ban = (await els('ambiente')).find((a) => a.id === idBanheiro);
  R.ok(trocou && ban.props.tipoAmbiente === 'banheiro' && ban.props.areaMolhada === true, 'trocar o tipo para "banheiro" no painel marca área molhada automaticamente', JSON.stringify(ban.props));
  await L.foto(page, '41-ambiente-selecionado.png');
  // restante dos nomes/tipos pela store
  await L.estado(page, (s, c, lista) => {
    const a = s.projeto.elementos.filter((e) => e.tipo === 'ambiente');
    lista.forEach(([nome, tipo], i) => s.atualizarElemento(a[i].id, { rotulo: nome, props: { nome, tipoAmbiente: tipo, areaMolhada: ['cozinha', 'banheiro'].includes(tipo) } }));
    s.selecionar([]);
  }, ambientes.map((a) => [a[0], a[1]]));
  const medidas = await L.estado(page, (s, calc) => Object.fromEntries(calc(s.projeto).arquitetura.linhas.filter((l) => /— (área|perímetro)$/.test(l.descricao)).map((l) => [l.descricao, +l.quantidade.toFixed(2)])));
  R.ok(Math.abs(medidas['Sala — área'] - 12) / 12 < 0.01 && Math.abs(medidas['Sala — perímetro'] - 14) / 14 < 0.01, 'Sala desenhada com o mouse (snap nos vértices das paredes): 12 m² / 14 m ±1%', JSON.stringify(medidas));
  R.info(`Quarto (cliques a 6–10 cm dos vértices das paredes): o snap puxou os cantos para os vértices → ${medidas['Quarto — área']} m² / ${medidas['Quarto — perímetro']} m (esperado sem snap: 9,15 / 12,10)`);

  // ------------------------------------------------------------ esquadrias: cadastro + posicionar na parede
  await page.getByRole('button', { name: '+ Porta' }).click();
  await page.getByRole('button', { name: '+ Janela' }).click();
  await page.waitForTimeout(150);
  const cad = await L.estado(page, (s) => s.projeto.esquadrias);
  R.ok(cad.length === 2 && cad[0].codigo === 'P1' && cad[0].largura === 0.8 && cad[0].altura === 2.1 && cad[1].codigo === 'J1' && cad[1].largura === 1.2 && cad[1].altura === 1, 'cadastro: "+ Porta" cria P1 0,80 × 2,10 e "+ Janela" cria J1 1,20 × 1,00', JSON.stringify(cad.map((t) => [t.codigo, t.largura, t.altura])));
  const posicionar = page.getByRole('button', { name: 'Posicionar', exact: true });
  await posicionar.nth(0).click();
  await L.clicarNaPlanta(page, L.pt(1, 0.2)); // 20 cm fora do eixo: deve projetar na parede
  await page.waitForTimeout(150);
  await posicionar.nth(0).click();
  await L.clicarNaPlanta(page, L.pt(1.6, 4));
  await page.waitForTimeout(150);
  await posicionar.nth(1).click();
  await L.clicarNaPlanta(page, L.pt(4.75, 0));
  await page.waitForTimeout(150);
  // clique longe de qualquer parede não pode criar esquadria
  await posicionar.nth(1).click();
  await L.clicarNaPlanta(page, L.pt(6, 6.5));
  await page.waitForTimeout(150);
  const esq = await els('esquadria');
  R.ok(esq.length === 3, 'esquadrias posicionadas com clique na parede (clique longe de parede não cria)', `${esq.length} esquadrias`);
  const y0 = paredes[0].geometria.pontos[0].y; // eixo da parede do topo, como foi desenhada
  R.ok(esq[0] && Math.abs(esq[0].geometria.ponto.y - y0) < 1e-6 && esq[0].vinculos.paredeId === paredes[0].id, 'esquadria clicada a 20 cm do eixo é projetada no eixo da parede e vinculada a ela', JSON.stringify(esq[0] && { p: esq[0].geometria.ponto, v: esq[0].vinculos }));
  const txtArq = await page.locator('.conteudo-etapa').innerText();
  R.ok(/posicionadas 2 de 1/.test(txtArq), 'cadastro mostra a divergência "posicionadas 2 de 1"', (txtArq.match(/posicionadas.*/g) || []).join(' | '));
  await L.estado(page, (s) => s.definirFerramenta({ modo: 'selecionar' }));

  // ------------------------------------------------------------ quadro, reservatório e caixa de inspeção
  await aba('Elétrica');
  await page.getByRole('button', { name: 'Posicionar quadro' }).click();
  await L.clicarNaPlanta(page, L.pt(0.3, 0.3));
  await aba('Hidráulica');
  await page.getByRole('button', { name: 'Posicionar reservatório' }).click();
  await L.clicarNaPlanta(page, L.pt(7.75, 2));
  await page.getByRole('button', { name: 'Posicionar caixa de inspeção' }).click();
  await L.clicarNaPlanta(page, L.pt(8.5, 5));
  await page.waitForTimeout(200);
  const fixos = await L.estado(page, (s) => s.projeto.elementos.filter((e) => ['quadro', 'reservatorio', 'caixa-inspecao'].includes(e.tipo)).map((e) => [e.tipo, e.status, e.vinculos.ambienteId ? 'em-ambiente' : 'fora']));
  R.ok(fixos.length === 3 && fixos.every((f) => f[1] === 'confirmado'), 'quadro, reservatório e caixa de inspeção posicionados com clique (confirmados)', JSON.stringify(fixos));
  R.ok(fixos[0][2] === 'em-ambiente' && fixos[2][2] === 'fora', 'ponto dentro de ambiente ganha vinculos.ambienteId; fora, não', JSON.stringify(fixos));

  // ------------------------------------------------------------ sugestões pelos botões + aceitar/descartar individual
  await aba('Estrutura');
  await page.getByRole('button', { name: /Sugerir estrutura/ }).click();
  await aba('Elétrica');
  await page.getByRole('button', { name: /Sugerir pontos \(NBR 5410\)/ }).click();
  await aba('Hidráulica');
  await page.getByRole('button', { name: /Sugerir pontos hidráulicos/ }).click();
  await page.waitForTimeout(400);
  const sug = await L.estado(page, (s) => {
    const c = {};
    for (const e of s.projeto.elementos) if (e.origem === 'sugerido-auto') c[`${e.tipo}/${e.status}`] = (c[`${e.tipo}/${e.status}`] || 0) + 1;
    return c;
  });
  const nPil = sug['pilar/pendente'];
  const vaos = await L.estado(page, (s, calc) => calc(s.projeto).estrutura.linhas.filter((l) => l.grupo === 'Vigas baldrame' && l.unidade === 'm').map((l) => +l.quantidade.toFixed(3)));
  const totalVB = vaos.reduce((a, b) => a + b, 0);
  R.ok(nPil >= 10 && Math.abs(totalVB - comp) < 0.01, 'CRITÉRIOS 3 e 4 com paredes desenhadas pelo mouse: pilares nos cantos/T/intermediários e baldrame = 100% das paredes', `${nPil} pilares; baldrame ${totalVB.toFixed(2)} m × paredes ${comp.toFixed(2)} m`);
  // ACHADO-S2: aceito por decisão (regra literal "vão acima de 4,00 m") — fica só como informação.
  R.info(`[ACHADO-S2, aceito por decisão] ${nPil} pilares com paredes/calibração feitas pelo mouse (10 com medidas exatas); trechos de baldrame (m): ${vaos.join(', ')}`);
  R.ok(sug['ponto-hidraulico/pendente'] === 6 && sug['ponto-eletrico/pendente'] >= 17, 'sugestões elétricas e hidráulicas geradas sobre os ambientes desenhados', JSON.stringify(sug));
  await L.foto(page, '42-caso-pelo-mouse.png');
  // seleciona um pilar pendente pela store e usa os botões Aceitar / Descartar do painel
  await aba('Estrutura');
  const pil = await L.estado(page, (s) => s.projeto.elementos.filter((e) => e.tipo === 'pilar').map((e) => e.id));
  await L.estado(page, (s, c, id) => s.selecionar([id]), pil[0]);
  await page.waitForTimeout(200);
  await page.locator('.conteudo-etapa').getByRole('button', { name: 'Aceitar', exact: true }).click();
  await L.estado(page, (s, c, id) => s.selecionar([id]), pil[1]);
  await page.waitForTimeout(200);
  await page.locator('.conteudo-etapa').getByRole('button', { name: 'Descartar', exact: true }).click();
  await page.waitForTimeout(200);
  const stPil = await L.estado(page, (s) => s.projeto.elementos.filter((e) => e.tipo === 'pilar').map((e) => e.status));
  R.ok(stPil.filter((x) => x === 'confirmado').length === 1 && stPil.length === nPil - 1, 'painel Estrutura: "Aceitar" confirma 1 pilar e "Descartar" remove 1 pilar', JSON.stringify(stPil));
  const arvPil = await L.linhaDaArvore(page, 'Pilares (un)');
  R.ok(arvPil === `1,00 un+ ${nPil - 2},00 un pend.`, 'árvore: Pilares = 1 confirmado + (n − 2) pendentes', String(arvPil));

  // teclado: Delete remove o selecionado; Ctrl+Z desfaz
  await L.estado(page, (s, c, id) => s.selecionar([id]), pil[2]);
  await page.locator('.vz-area').hover();
  await page.keyboard.press('Delete');
  await page.waitForTimeout(150);
  const aposDel = (await els('pilar')).length;
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  const aposUndo = (await els('pilar')).length;
  R.ok(aposDel === nPil - 2 && aposUndo === nPil - 1, 'tecla Delete remove o selecionado e Ctrl+Z desfaz', `${aposDel} → ${aposUndo}`);

  // arrastar um ponto elétrico pendente (ajustar posição) — move e mantém o vínculo de ambiente
  const tug = await L.estado(page, (s) => { const e = s.projeto.elementos.find((x) => x.tipo === 'ponto-eletrico' && x.props.tipoPonto === 'tug'); return { id: e.id, p: e.geometria.ponto, amb: e.vinculos.ambienteId }; });
  await page.locator('.vz-barra').getByRole('button', { name: 'Selecionar' }).click();
  const de = await L.telaDe(page, tug.p);
  await page.mouse.move(de.x, de.y);
  await page.mouse.down();
  await page.mouse.move(de.x + 20, de.y + 30, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const tug2 = await L.estado(page, (s, c, id) => { const e = s.projeto.elementos.find((x) => x.id === id); return { p: e.geometria.ponto, amb: e.vinculos.ambienteId, status: e.status }; }, tug.id);
  R.ok(Math.hypot(tug2.p.x - tug.p.x, tug2.p.y - tug.p.y) > 5, 'arrastar um ponto sugerido na planta move o elemento', `${JSON.stringify(tug.p)} → ${JSON.stringify(tug2.p)}`);

  // "Aceitar todas" global da árvore
  await page.locator('.aviso-pendentes').getByRole('button', { name: 'Aceitar todas' }).click();
  await page.waitForTimeout(300);
  const pend = await L.estado(page, (s) => s.projeto.elementos.filter((e) => e.status === 'pendente').length);
  R.ok(pend === 0 && (await page.locator('.aviso-pendentes').count()) === 0, '"Aceitar todas" (árvore) confirma tudo e o aviso de pendentes some', `${pend} pendentes`);
  await L.foto(page, '43-tudo-aceito.png');

  // exportar PDF da planta (impressão): não pode dar erro; o capturador devolve uma imagem
  await aba('Materiais');
  await page.evaluate(() => {
    window.__iframes = 0;
    const original = document.body.appendChild.bind(document.body);
    document.body.appendChild = (n) => { if (n.tagName === 'IFRAME') window.__iframes += 1; return original(n); };
  });
  const img = await page.evaluate(async () => { const v = await import('/src/features/viewer/index.ts'); const d = await v.capturarPlantaComCamadas(); return d ? d.slice(0, 30) + '…' + d.length : null; });
  R.ok(img && /^data:image\/png/.test(img), 'capturarPlantaComCamadas devolve PNG da planta com as camadas', String(img));
  await page.getByRole('button', { name: 'Exportar PDF da planta' }).click();
  await page.waitForTimeout(1200);
  const iframes = await page.evaluate(() => window.__iframes);
  R.ok(iframes >= 1, '"Exportar PDF da planta" monta o documento de impressão (iframe)', `${iframes} iframe(s)`);

  // vista 3D com o caso feito pelo mouse
  await page.locator('.topo').getByRole('button', { name: '3D', exact: true }).click();
  await page.waitForTimeout(1500);
  await L.foto(page, '44-3d-caso-pelo-mouse.png');
  await page.locator('.topo').getByRole('button', { name: 'Planta', exact: true }).click();

  R.ok(registro.erros.length === 0, 'nenhum erro de console / pageerror', registro.erros.slice(0, 5).join(' || '));
  R.ok(registro.externas.length === 0, 'nenhuma requisição de rede fora do localhost', registro.externas.slice(0, 5).join(' || '));
  const falhas = R.fim(registro);
  await browser.close();
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error('FALHA DO SCRIPT:', e);
  process.exit(2);
});
