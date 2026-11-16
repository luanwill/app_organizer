/**
 * QA (S10) — e2e 01: fluxo guiado pela INTERFACE (3 etapas, abas, sugestões, camadas, 3D, pé-direito ao vivo).
 * Critérios 1, 2, 5, 7 e 8 no navegador + verificações de interface.
 */
const path = require('node:path');
const L = require('./_lib.cjs');

(async () => {
  const browser = await L.chromium.launch();
  const R = L.criarRelatorio('01-fluxo');
  const pdf = await L.gerarPdfDaPlanta(browser, path.join(L.SAIDA, 'planta-caso.pdf'));
  const { page, registro } = await L.abrirApp(browser);
  page.on('dialog', (d) => d.accept());

  // ------------------------------------------------------------ estado vazio / 3 colunas / pt-BR
  await L.foto(page, '01-vazio.png');
  const colunas = await page.evaluate(() => ['.coluna.esquerda', '.centro', '.coluna.direita'].map((s) => {
    const r = document.querySelector(s)?.getBoundingClientRect();
    return r ? { x: Math.round(r.x), w: Math.round(r.width) } : null;
  }));
  R.ok(colunas.every(Boolean) && colunas[0].x < colunas[1].x && colunas[1].x < colunas[2].x, '3 colunas (etapas | planta | árvore)', JSON.stringify(colunas));
  R.ok((await page.getAttribute('html', 'lang')) === 'pt-BR', 'html lang="pt-BR"', String(await page.getAttribute('html', 'lang')));
  const desabilitadas = await page.evaluate(() => [...document.querySelectorAll('.vz-barra button')].filter((b) => b.disabled).map((b) => b.textContent.trim()));
  R.ok(['Distância', 'Polilinha', 'Polígono', 'Retângulo', 'Contagem', 'Parede'].every((t) => desabilitadas.includes(t)), 'sem planta: ferramentas de medição desabilitadas', desabilitadas.join(', '));

  // ------------------------------------------------------------ abrir a planta
  await page.setInputFiles('.vz-barra input[type=file]', pdf);
  await page.waitForSelector('canvas.vz-pdf', { timeout: 20000 });
  await page.waitForTimeout(800);
  R.ok((await L.estado(page, (s) => s.projeto.totalPaginas)) === 1, 'PDF aberto: 1 página');
  const dim = await L.estado(page, (s) => s.projeto.paginas[1]);
  R.ok(Math.abs(dim.largura - L.PAGINA.largura) < 1 && Math.abs(dim.altura - L.PAGINA.altura) < 1, 'dimensões da página em unidades do PDF', JSON.stringify(dim));

  // ------------------------------------------------------------ medições bloqueadas sem calibração
  const textoEtapa1 = await page.locator('.conteudo-etapa').innerText();
  R.ok(/Medições bloqueadas/.test(textoEtapa1), 'etapa 1 avisa "Medições bloqueadas" sem calibração', textoEtapa1.split('\n').slice(0, 3).join(' / '));
  const bloqueio = await page.evaluate(() => [...document.querySelectorAll('.vz-barra button')].filter((b) => b.disabled).map((b) => `${b.textContent.trim()}: ${b.title}`));
  R.ok(bloqueio.filter((t) => /Calibre a escala/.test(t)).length >= 6, 'sem escala: Distância/Polilinha/Polígono/Retângulo/Contagem/Parede desabilitadas com dica', bloqueio.join(' | '));
  await L.foto(page, '02-sem-escala.png');
  // tentativa de forçar a ferramenta pela store: o clique na planta não pode criar medição
  await L.estado(page, (s) => s.definirFerramenta({ modo: 'distancia' }));
  await L.clicarNaPlanta(page, L.COTA.a);
  await L.clicarNaPlanta(page, L.COTA.b);
  R.ok((await L.estado(page, (s) => s.projeto.elementos.length)) === 0, 'sem escala: clicar com a ferramenta Distância forçada não cria medição');
  await L.estado(page, (s) => s.definirFerramenta({ modo: 'selecionar' }));

  // ------------------------------------------------------------ critério 1: calibração pela interface
  await page.getByRole('button', { name: 'Calibrar escala' }).click();
  await L.clicarNaPlanta(page, L.COTA.a);
  await L.clicarNaPlanta(page, L.COTA.b);
  await page.waitForSelector('.vz-calibracao input');
  await page.fill('.vz-calibracao input', L.COTA.medida);
  await L.foto(page, '03-calibrando.png');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  const escala = await L.estado(page, (s) => s.projeto.paginas[1].escala);
  R.ok(escala && Math.abs(escala - L.ESCALA) / L.ESCALA < 0.01, 'calibração pela interface: escala ≈ 0,02 m/unidade (±1%)', String(escala));
  await page.waitForTimeout(200);
  // medir a mesma cota com a ferramenta Distância
  await page.locator('.vz-barra').getByRole('button', { name: 'Distância' }).click();
  await L.clicarNaPlanta(page, L.COTA.a);
  await L.clicarNaPlanta(page, L.COTA.b);
  await page.waitForTimeout(200);
  const medido = await L.estado(page, (s, calc) => calc(s.projeto).arquitetura.linhas.filter((l) => l.grupo === 'Medições').map((l) => l.quantidade));
  R.ok(medido.length === 1 && Math.abs(medido[0] - 3.07) / 3.07 < 0.01, 'CRITÉRIO 1: linha sobre a cota de 3,07 m mede 3,07 m ±1%', JSON.stringify(medido));
  const arvoreMed = await page.locator('.arvore').innerText();
  R.ok(/3,07 m/.test(arvoreMed), 'árvore mostra "3,07 m" (vírgula decimal)', (arvoreMed.match(/.*3,07 m.*/) || [''])[0]);
  await L.foto(page, '04-medido-3-07.png');

  // ------------------------------------------------------------ critério 2 pela interface: retângulo 3,07 × 2,98
  await page.locator('.vz-barra').getByRole('button', { name: 'Retângulo' }).click();
  await L.clicarNaPlanta(page, L.pt(0.06, 4.1));
  await L.clicarNaPlanta(page, L.pt(3.13, 7.08));
  await page.waitForTimeout(200);
  const ret = await L.estado(page, (s, calc) => calc(s.projeto).arquitetura.linhas.filter((l) => l.grupo === 'Medições' && /área|perímetro/.test(l.descricao)).map((l) => [l.descricao, l.quantidade]));
  const area = ret.find((r) => /área/.test(r[0]))?.[1];
  const per = ret.find((r) => /perímetro/.test(r[0]))?.[1];
  R.ok(area && Math.abs(area - 9.15) < 0.1 && per && Math.abs(per - 12.1) < 0.06, 'CRITÉRIO 2 (desenhado com o mouse): retângulo 3,07 × 2,98 ≈ 9,15 m² e 12,10 m (tolerância de clique)', JSON.stringify(ret));
  const arv2 = await page.locator('.arvore').innerText();
  R.info(`árvore após o retângulo: ${(arv2.match(/.*(área|perímetro).*\n?.*/g) || []).join(' | ').replace(/\n/g, ' ')}`);

  // parede pela interface (2 cliques + duplo clique) — sem espessura informada ainda → alerta
  await page.locator('.vz-barra').getByRole('button', { name: 'Parede' }).click();
  await L.clicarNaPlanta(page, L.pt(0, 0));
  const fim = await L.telaDe(page, L.pt(9, 0));
  await page.mouse.move(fim.x, fim.y);
  await page.mouse.dblclick(fim.x, fim.y);
  await page.waitForTimeout(300);
  const paredesUI = await L.estado(page, (s) => s.projeto.elementos.filter((e) => e.tipo === 'parede').map((e) => ({ n: e.geometria.pontos.length, esp: e.props.espessura })));
  R.ok(paredesUI.length === 1 && paredesUI[0].n === 2, 'parede desenhada com o mouse (clique + duplo clique) tem 2 vértices', JSON.stringify(paredesUI));
  R.ok(paredesUI[0]?.esp === null, 'parede desenhada sem espessura padrão informada nasce com espessura null (nada assumido)', JSON.stringify(paredesUI));
  const alertasArv = await page.locator('.arvore .alertas').allInnerTexts();
  R.ok(alertasArv.join(' ').includes('Dado faltante') && /Espessura/.test(alertasArv.join(' ')) && /(pé-direito|Altura)/i.test(alertasArv.join(' ')), 'árvore mostra "Dado faltante" (espessura e pé-direito/altura)', alertasArv.join(' ').replace(/\n/g, ' ').slice(0, 300));
  await L.foto(page, '05-dado-faltante.png');

  // ------------------------------------------------------------ etapa 2: dados essenciais
  await page.locator('.etapas button', { hasText: 'Dados essenciais' }).click();
  const t2 = await page.locator('.conteudo-etapa').innerText();
  R.ok((t2.match(/Dado faltante/g) || []).length === 3, 'etapa 2: 3 avisos "Dado faltante" com os campos vazios', `${(t2.match(/Dado faltante/g) || []).length} avisos`);
  const vazios = await page.locator('.conteudo-etapa label.campo input').evaluateAll((els) => els.slice(0, 3).map((e) => e.value));
  R.ok(vazios.every((v) => v === ''), 'etapa 2: campos essenciais nascem vazios (sem valor assumido)', JSON.stringify(vazios));
  await L.foto(page, '06-etapa2-vazia.png');
  const campos = page.locator('.conteudo-etapa label.campo input');
  await campos.nth(0).fill('2,80'); await campos.nth(0).press('Enter');
  await campos.nth(1).fill('0,15'); await campos.nth(1).press('Enter');
  await campos.nth(2).fill('4'); await campos.nth(2).press('Enter');
  const gerais = await L.estado(page, (s) => s.projeto.parametros.gerais);
  R.ok(gerais.peDireito === 2.8 && gerais.espessuraParede === 0.15 && gerais.numeroPessoas === 4, 'etapa 2: "2,80" / "0,15" / "4" aceitos com vírgula decimal', JSON.stringify(gerais));
  const mostrado = await campos.nth(0).inputValue();
  R.ok(mostrado === '2,80' || mostrado === '2,8', 'campo mostra o valor com vírgula decimal', mostrado);
  await L.foto(page, '07-etapa2-preenchida.png');

  // ------------------------------------------------------------ montar o caso de exemplo (fábrica de tests/caso-exemplo.ts)
  await page.evaluate(async () => {
    const { useLevantamento } = await import('/src/core/store/index.ts');
    const caso = await import('/tests/caso-exemplo.ts');
    const s = useLevantamento.getState();
    s.removerElementos(s.projeto.elementos.map((e) => e.id));
    s.calibrarPagina(1, caso.ESCALA);
    const base = caso.casoBase();
    for (const t of base.esquadrias) s.salvarEsquadria(t);
    s.adicionarElementos(base.elementos);
    s.definirNome(base.nome);
    s.definirFerramenta({ modo: 'selecionar' });
  });
  await page.waitForTimeout(400);
  await page.locator('.etapas button', { hasText: 'O que medir' }).click();

  // ------------------------------------------------------------ aba Arquitetura
  await page.locator('.abas button', { hasText: 'Arquitetura' }).click();
  await page.waitForTimeout(300);
  await L.foto(page, '08-aba-arquitetura.png');
  const arq = await page.locator('.conteudo-etapa').innerText();
  R.ok(/Quarto/.test(arq) && /9,15 m²/.test(arq), 'aba Arquitetura lista o Quarto com 9,15 m²', (arq.match(/.*9,15.*/) || [''])[0]);
  R.ok((await L.linhaDaArvore(page, 'Quarto — área')) === '9,15 m²', 'CRITÉRIO 2 na árvore: Quarto — área = 9,15 m²', String(await L.linhaDaArvore(page, 'Quarto — área')));
  R.ok((await L.linhaDaArvore(page, 'Quarto — perímetro')) === '12,10 m', 'CRITÉRIO 2 na árvore: Quarto — perímetro = 12,10 m', String(await L.linhaDaArvore(page, 'Quarto — perímetro')));

  // ------------------------------------------------------------ aba Estrutura
  await page.locator('.abas button', { hasText: 'Estrutura' }).click();
  const est = await page.locator('.conteudo-etapa').innerText();
  R.ok(est.includes('Estimativa para orçamento. Não substitui projeto estrutural por engenheiro responsável.'), 'aviso fixo da estrutura presente');
  await page.getByRole('button', { name: /Sugerir estrutura/ }).click();
  await page.waitForTimeout(400);
  const cont = await L.estado(page, (s) => {
    const c = {};
    for (const e of s.projeto.elementos) if (e.disciplina === 'estrutura') c[`${e.tipo}/${e.status}`] = (c[`${e.tipo}/${e.status}`] || 0) + 1;
    return c;
  });
  R.ok(cont['pilar/pendente'] === 10 && cont['viga-baldrame/pendente'] === 11, 'botão "Sugerir estrutura": 10 pilares e 11 trechos de baldrame, todos pendentes', JSON.stringify(cont));
  await L.foto(page, '09-aba-estrutura-sugerida.png');
  R.ok(/pend\./.test(await page.locator('.arvore').innerText()), 'árvore mostra pendentes em separado ("pend.")');
  R.ok((await L.linhaDaArvore(page, 'Pilares (un)')) === '+ 10,00 un pend.', 'árvore: Pilares = só pendente ("+ 10,00 un pend."), nada confirmado', String(await L.linhaDaArvore(page, 'Pilares (un)')));

  // ------------------------------------------------------------ aba Elétrica
  await page.locator('.abas button', { hasText: 'Elétrica' }).click();
  const ele = await page.locator('.conteudo-etapa').innerText();
  R.ok(/confira|conferir/i.test(ele) && /seç(ão|ões)/i.test(ele), 'aviso para conferir as seções dos condutores', (ele.match(/.*(confira|conferir).*/i) || [''])[0]);
  await page.getByRole('button', { name: /Sugerir pontos \(NBR 5410\)/ }).click();
  await page.waitForTimeout(400);
  const sala = await L.estado(page, (s) => s.projeto.elementos.filter((e) => e.tipo === 'ponto-eletrico' && e.vinculos.ambienteId === 'amb-sala').map((e) => [e.props.tipoPonto, e.props.potenciaVA, e.status]));
  const luz = sala.filter((p) => p[0] === 'luz').reduce((a, p) => a + p[1], 0);
  R.ok(luz === 160 && sala.filter((p) => p[0] === 'tug').length === 3, 'CRITÉRIO 5 pelo botão "Sugerir pontos (NBR 5410)": sala = 160 VA de luz e 3 TUGs', JSON.stringify(sala));
  R.ok(sala.every((p) => p[2] === 'pendente'), 'sugestões elétricas nascem pendentes');
  await L.foto(page, '10-aba-eletrica-sugerida.png');
  const ele2 = await page.locator('.conteudo-etapa').innerText();
  R.info(`painel elétrica (resumo por ambiente): ${(ele2.match(/Sala.*\n?.*/) || [''])[0].replace(/\n/g, ' ')}`);

  // ------------------------------------------------------------ aba Hidráulica
  await page.locator('.abas button', { hasText: 'Hidráulica' }).click();
  await page.getByRole('button', { name: /Sugerir pontos hidráulicos/ }).click();
  await page.waitForTimeout(400);
  const ban = await L.estado(page, (s) => s.projeto.elementos.filter((e) => e.tipo === 'ponto-hidraulico' && e.vinculos.ambienteId === 'amb-banheiro').map((e) => e.props.aparelho).sort());
  R.ok(JSON.stringify(ban) === JSON.stringify(['chuveiro', 'lavatorio', 'ralo', 'vaso']), 'CRITÉRIO 6 pelo botão "Sugerir pontos hidráulicos": vaso, lavatório, chuveiro e ralo', JSON.stringify(ban));
  await L.foto(page, '11-aba-hidraulica-sugerida.png');
  const tubos = await page.evaluate(() => [...document.querySelectorAll('.arvore-tabela tr')].map((r) => r.innerText.replace(/\s+/g, ' ')).filter((t) => /^Tubo de/.test(t)));
  R.ok(tubos.some((t) => /esgoto \(Ø100 mm\)/.test(t)) && tubos.some((t) => /esgoto \(Ø40 mm\)/.test(t)) && tubos.some((t) => /água fria \(Ø25 mm\)/.test(t)), 'CRITÉRIO 6 na árvore: tubos separados por diâmetro (Ø100, Ø40, Ø25)', tubos.join(' | '));

  // ------------------------------------------------------------ critério 8 na interface: pendentes fora dos confirmados
  const antes = { pil: await L.linhaDaArvore(page, 'Pilares (un)'), cim: null };
  await page.locator('.arvore .ramo-titulo', { hasText: 'Materiais' }).click();
  await page.waitForTimeout(200);
  antes.cim = await L.linhaDaArvore(page, 'Cimento');
  R.ok(/^\+ .* pend\.$/.test(antes.cim || ''), 'CRITÉRIO 8: materiais — Cimento só como pendente enquanto a estrutura está pendente', String(antes.cim));
  const avisoPend = await page.locator('.aviso-pendentes').innerText();
  R.ok(/sugestões pendentes — fora dos totais confirmados/.test(avisoPend), 'aviso "N sugestões pendentes — fora dos totais confirmados"', avisoPend.split('\n')[0]);
  // aceitar só a estrutura pela árvore
  const ramoEst = page.locator('.arvore > .ramo', { has: page.locator('.ramo-nome', { hasText: /^Estrutura$/ }) });
  await ramoEst.getByRole('button', { name: 'Aceitar pendentes' }).click();
  await page.waitForTimeout(300);
  const depoisPil = await L.linhaDaArvore(page, 'Pilares (un)');
  R.ok(depoisPil === '10,00 un', 'CRITÉRIO 8: "Aceitar pendentes" (Estrutura) move pilares de pendente para confirmado', `${antes.pil} → ${depoisPil}`);
  const cim2 = await L.linhaDaArvore(page, 'Cimento');
  R.ok(/^[\d.,]+ kg$/.test(cim2 || ''), 'CRITÉRIO 8: materiais — Cimento passa a confirmado', `${antes.cim} → ${cim2}`);
  // descartar a hidráulica pela árvore e sugerir de novo
  const ramoHid = page.locator('.arvore > .ramo', { has: page.locator('.ramo-nome', { hasText: /^Hidráulica$/ }) });
  await ramoHid.getByRole('button', { name: 'Descartar' }).click();
  await page.waitForTimeout(300);
  R.ok((await L.estado(page, (s) => s.projeto.elementos.filter((e) => e.tipo === 'ponto-hidraulico').length)) === 0, 'botão "Descartar" (Hidráulica) remove os pendentes');
  await page.getByRole('button', { name: /Sugerir pontos hidráulicos/ }).click();
  await page.waitForTimeout(300);
  // desfazer / refazer
  await page.getByRole('button', { name: /Desfazer/ }).click();
  const nDesf = await L.estado(page, (s) => s.projeto.elementos.filter((e) => e.tipo === 'ponto-hidraulico').length);
  await page.getByRole('button', { name: /Refazer/ }).click();
  const nRef = await L.estado(page, (s) => s.projeto.elementos.filter((e) => e.tipo === 'ponto-hidraulico').length);
  R.ok(nDesf === 0 && nRef === 6, 'Desfazer/Refazer da sugestão hidráulica', `${nDesf} → ${nRef}`);
  // parte aceita, parte pendente (como o caso de exemplo): elétrica da sala e hidráulica do banheiro
  await L.estado(page, (s) => s.confirmarElementos(s.projeto.elementos.filter((e) => e.status === 'pendente' && ((e.disciplina === 'eletrica' && e.vinculos.ambienteId === 'amb-sala') || (e.disciplina === 'hidraulica' && e.vinculos.ambienteId === 'amb-banheiro'))).map((e) => e.id)));
  await page.waitForTimeout(300);
  const tug = await L.linhaDaArvore(page, 'Tomada de uso geral (TUG)');
  R.ok(/^3,00 un ?\+ 9,00 un pend\.$/.test(tug || ''), 'árvore: TUG = 3,00 un confirmadas + 9,00 un pend.', String(tug));
  await L.foto(page, '12-parcial-aceito.png');

  // ------------------------------------------------------------ critério 7: pé-direito ao vivo
  const chaves = ['Parede 1 — alvenaria', 'Sala — pintura de parede', 'Concreto — pilares', 'Forma — pilares', 'Eletroduto', 'Tubo de água fria', 'Bloco cerâmico', 'Tinta acrílica', 'Cimento', 'Fio / cabo de cobre (1.5'];
  const ler = async () => Object.fromEntries(await Promise.all(chaves.map(async (c) => [c, await L.linhaDaArvore(page, c)])));
  const a280 = await ler();
  await page.locator('.etapas button', { hasText: 'Dados essenciais' }).click();
  const pe = page.locator('.conteudo-etapa label.campo input').nth(0);
  await pe.fill('3,00');
  await pe.press('Enter');
  await page.waitForTimeout(400);
  const a300 = await ler();
  for (const c of chaves) R.ok(a280[c] && a300[c] && a280[c] !== a300[c], `CRITÉRIO 7 (árvore ao vivo, sem recarregar): "${c}" muda com o pé-direito 2,80 → 3,00`, `${a280[c]} → ${a300[c]}`);
  R.ok(a300['Parede 1 — alvenaria'] === '27,00 m²', 'Parede 1 (9 m) — alvenaria = 27,00 m² com pé-direito 3,00', String(a300['Parede 1 — alvenaria']));
  await L.foto(page, '13-pe-direito-3-00.png');
  // esvaziar o pé-direito → alertas, quantidades somem
  await pe.fill('');
  await pe.press('Enter');
  await page.waitForTimeout(400);
  const semPe = await ler();
  R.ok(semPe['Parede 1 — alvenaria'] === null && semPe['Concreto — pilares'] === null && semPe['Eletroduto'] === null && semPe['Tubo de água fria'] === null, 'pé-direito vazio: alvenaria, concreto de pilares, eletroduto e tubo de água somem (nada assumido)', JSON.stringify(semPe));
  const alertas = await page.locator('.arvore .alertas').allInnerTexts();
  R.ok(alertas.length >= 4, 'pé-direito vazio: alertas "Dado faltante" nas 4 disciplinas', `${alertas.length} blocos de alerta`);
  await L.foto(page, '14-pe-direito-vazio.png');
  await pe.fill('2,80');
  await pe.press('Enter');
  await page.waitForTimeout(300);
  const volta = await ler();
  R.ok(JSON.stringify(volta) === JSON.stringify(a280), 'voltar a 2,80 restaura exatamente as quantidades');

  // ------------------------------------------------------------ camadas
  await page.locator('.etapas button', { hasText: 'O que medir' }).click();
  const camadas = await page.locator('.vz-camadas .vz-camada').allInnerTexts();
  R.ok(['Arquitetura', 'Estrutura', 'Elétrica', 'Hidráulica'].every((c) => camadas.map((t) => t.trim()).includes(c)), 'botões de camada por disciplina', camadas.join(', '));
  const nos = () => page.evaluate(async () => {
    const K = (await import('/node_modules/.vite/deps/konva.js').catch(() => null));
    return document.querySelectorAll('.vz-stage canvas').length;
  });
  const pixels = async () => (await page.locator('.vz-area').screenshot()).length;
  const comTudo = await pixels();
  for (const c of ['Estrutura', 'Elétrica', 'Hidráulica']) await page.locator('.vz-camadas .vz-camada', { hasText: c }).click();
  await page.waitForTimeout(300);
  const estCam = await L.estado(page, (s) => s.projeto.camadas);
  R.ok(estCam.estrutura === false && estCam.eletrica === false && estCam.hidraulica === false && estCam.arquitetura === true, 'liga/desliga de camadas altera o estado', JSON.stringify(estCam));
  await L.foto(page, '15-so-arquitetura.png');
  const soArq = await pixels();
  R.ok(soArq !== comTudo, 'ocultar camadas muda o desenho da planta', `${comTudo} → ${soArq} bytes de PNG`);
  for (const c of ['Estrutura', 'Elétrica', 'Hidráulica']) await page.locator('.vz-camadas .vz-camada', { hasText: c }).click();
  await page.waitForTimeout(300);
  await L.foto(page, '16-todas-camadas.png');
  void nos;

  // ------------------------------------------------------------ selecionar pela árvore e pela planta
  await page.locator('.arvore-tabela tr', { hasText: 'Quarto — área' }).first().click();
  R.ok(JSON.stringify(await L.estado(page, (s) => s.selecaoIds)) === '["amb-quarto"]', 'clicar numa linha da árvore seleciona o elemento na planta');
  await L.estado(page, (s) => s.selecionar([]));
  const pil = await L.estado(page, (s) => s.projeto.elementos.find((e) => e.id === 'est-1-P4').geometria.ponto);
  await L.clicarNaPlanta(page, pil);
  await page.waitForTimeout(200);
  const sel = await L.estado(page, (s) => s.selecaoIds);
  R.ok(sel.length === 1, 'clicar num pilar na planta (ferramenta Selecionar) seleciona 1 elemento', JSON.stringify(sel));

  // ------------------------------------------------------------ abas Materiais e Importar
  await page.locator('.abas button', { hasText: 'Materiais' }).click();
  await page.waitForTimeout(300);
  const mat = await page.locator('.conteudo-etapa').innerText();
  R.ok(mat.includes('Coeficientes de referência — confira com sua composição (SINAPI/TCPO)'), 'selo fixo de materiais presente');
  await L.foto(page, '17-aba-materiais.png');
  await page.locator('.abas button', { hasText: 'Importar' }).click();
  await page.waitForTimeout(200);
  const ia = page.getByRole('button', { name: /Analisar recorte/ });
  R.ok(await ia.isDisabled(), 'botão "Recortes IA" desabilitado');
  const dicaIA = (await ia.getAttribute('title')) || '';
  R.ok(/em breve/i.test(dicaIA), 'botão "Recortes IA" com a dica "em breve"', dicaIA);
  await L.foto(page, '18-aba-importar.png');

  // ------------------------------------------------------------ vista 3D
  await page.locator('.topo').getByRole('button', { name: '3D', exact: true }).click();
  await page.waitForTimeout(1500);
  await L.foto(page, '19-vista-3d.png');
  const c3 = page.locator('.centro canvas').first();
  const box = await c3.boundingBox();
  R.ok(!!box && box.width > 300 && box.height > 300, 'vista 3D: canvas renderizado', JSON.stringify(box));
  const naoVazio = await page.evaluate(() => {
    const c = document.querySelector('.centro canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    return !!gl;
  });
  R.ok(naoVazio, 'vista 3D: contexto WebGL ativo');
  await L.estado(page, (s) => s.selecionar([]));
  // varre uma grade de cliques até acertar algum sólido
  let selecionado = [];
  fora: for (let fy = 0.3; fy <= 0.8; fy += 0.1) {
    for (let fx = 0.25; fx <= 0.75; fx += 0.1) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await page.waitForTimeout(60);
      selecionado = await L.estado(page, (s) => s.selecaoIds);
      if (selecionado.length) break fora;
    }
  }
  R.ok(selecionado.length === 1, 'vista 3D: clicar num sólido seleciona o elemento', JSON.stringify(selecionado));
  await page.waitForTimeout(300);
  await L.foto(page, '20-vista-3d-selecao.png');
  const avisos3d = await page.locator('.centro .aviso').allInnerTexts();
  R.info(`avisos na vista 3D: ${JSON.stringify(avisos3d)}`);
  await page.locator('.topo').getByRole('button', { name: 'Planta', exact: true }).click();
  await page.waitForSelector('canvas.vz-pdf');
  await page.waitForTimeout(500);
  await L.foto(page, '21-volta-planta.png');

  // ------------------------------------------------------------ coerência no navegador
  const coer = await L.estado(page, (s, calc) => {
    const lev = calc(s.projeto);
    const linhas = ['arquitetura', 'estrutura', 'eletrica', 'hidraulica'].flatMap((d) => lev[d].linhas);
    const ids = linhas.map((l) => l.id);
    return {
      duplicados: ids.filter((id, i) => ids.indexOf(id) !== i),
      ruins: linhas.filter((l) => !Number.isFinite(l.quantidade) || l.quantidade < 0).map((l) => l.id),
      alertas: ['arquitetura', 'estrutura', 'eletrica', 'hidraulica'].flatMap((d) => lev[d].alertas.map((a) => a.mensagem)),
    };
  });
  R.ok(coer.duplicados.length === 0 && coer.ruins.length === 0, 'no navegador: ids de linha únicos e nenhuma quantidade inválida', JSON.stringify(coer));
  R.ok(!registro.avisos.some((a) => /same key|unique "key"/i.test(a)) && !registro.erros.some((a) => /same key|unique "key"/i.test(a)), 'sem avisos do React de chave duplicada');

  R.ok(registro.erros.length === 0, 'nenhum erro de console / pageerror em todo o fluxo', registro.erros.slice(0, 5).join(' || '));
  R.ok(registro.externas.length === 0, 'nenhuma requisição de rede fora do localhost', registro.externas.slice(0, 5).join(' || '));
  const falhas = R.fim(registro);
  await browser.close();
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error('FALHA DO SCRIPT:', e);
  process.exit(2);
});
