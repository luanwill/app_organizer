import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { Elemento, Levantamento, LinhaQuantitativo, Projeto, Status } from '@/core/model';
import { ROTULO_DISCIPLINA } from '@/core/model';
import { calcularLevantamento } from '@/app/levantamento';
import { ambiente, parede, projetoCom, pt } from '@/features/estrutura/apoio-teste';
import { calcularMateriais, COMPOSICOES_PADRAO } from '@/features/materiais';
import { ABAS, COLUNAS_DETALHE, COLUNAS_RESUMO, FORMATO_JSON, FORMATO_QUANTIDADE, TITULO_TOTAIS, VERSAO_JSON } from './config';
import { exportarExcel, exportarJSON, montarHtmlImpressao, nomeArquivo, orientacaoDaImagem } from './exportar';
import { montarPlanilhas } from './planilhas';

const NOMES_ABAS = ['Resumo', 'Ambientes', 'Esquadrias', 'Paredes', 'Acabamentos', 'Estrutura', 'Elétrica', 'Hidráulica', 'Materiais'];

function ponto<E extends Elemento>(el: Omit<E, 'pagina' | 'vinculos' | 'origem'>): Elemento {
  return { pagina: 1, vinculos: {}, origem: 'desenhado', ...el } as Elemento;
}

/** Casa de 2 ambientes (um confirmado, um pendente) com as quatro disciplinas. */
function projetoExemplo(): Projeto {
  const sala = ambiente('Sala', 0, 0, 5, 4);
  const banho = { ...ambiente('Banho', 5, 0, 7, 4), status: 'pendente' as Status };
  if (banho.tipo === 'ambiente') banho.props = { ...banho.props, tipoAmbiente: 'banheiro', areaMolhada: true };
  const paredes = [
    parede('p-topo', [0, 0], [7, 0]),
    parede('p-dir', [7, 0], [7, 4]),
    parede('p-base', [7, 4], [0, 4]),
    parede('p-esq', [0, 4], [0, 0]),
    { ...parede('p-meio', [5, 0], [5, 4]), status: 'pendente' as Status },
  ];
  const projeto = projetoCom([
    sala,
    banho,
    ...paredes,
    ponto({ id: 'pil1', tipo: 'pilar', disciplina: 'estrutura', status: 'confirmado', geometria: { tipo: 'ponto', ponto: pt(0, 0) }, props: { secaoB: 0.14, secaoH: 0.3 } }),
    ponto({ id: 'pil2', tipo: 'pilar', disciplina: 'estrutura', status: 'pendente', geometria: { tipo: 'ponto', ponto: pt(7, 0) }, props: { secaoB: 0.14, secaoH: 0.3 } }),
    ponto({ id: 'vb1', tipo: 'viga-baldrame', disciplina: 'estrutura', status: 'confirmado', geometria: { tipo: 'polilinha', pontos: [pt(0, 0), pt(7, 0)] }, props: { secaoB: 0.14, secaoH: 0.3 } }),
    ponto({ id: 'qd', tipo: 'quadro', disciplina: 'eletrica', status: 'confirmado', geometria: { tipo: 'ponto', ponto: pt(0.2, 2) }, props: {} }),
    ponto({ id: 'luz1', tipo: 'ponto-eletrico', disciplina: 'eletrica', status: 'confirmado', geometria: { tipo: 'ponto', ponto: pt(2.5, 2) }, props: { tipoPonto: 'luz', potenciaVA: 100, altura: 'teto' } }),
    ponto({ id: 'tug1', tipo: 'ponto-eletrico', disciplina: 'eletrica', status: 'pendente', geometria: { tipo: 'ponto', ponto: pt(4.8, 1) }, props: { tipoPonto: 'tug', potenciaVA: 100, altura: 'baixa' } }),
    ponto({ id: 'res', tipo: 'reservatorio', disciplina: 'hidraulica', status: 'confirmado', geometria: { tipo: 'ponto', ponto: pt(6, 0.5) }, props: {} }),
    ponto({ id: 'lav', tipo: 'ponto-hidraulico', disciplina: 'hidraulica', status: 'confirmado', geometria: { tipo: 'ponto', ponto: pt(6, 3.8) }, props: { aparelho: 'lavatorio', aguaFria: true, aguaQuente: false, esgoto: true } }),
    ponto({ id: 'vaso', tipo: 'ponto-hidraulico', disciplina: 'hidraulica', status: 'pendente', geometria: { tipo: 'ponto', ponto: pt(6.8, 2) }, props: { aparelho: 'vaso', aguaFria: true, aguaQuente: false, esgoto: true } }),
    ponto({ id: 'med1', tipo: 'medicao', disciplina: 'arquitetura', status: 'confirmado', geometria: { tipo: 'polilinha', pontos: [pt(0, 5), pt(3, 5)] }, props: { modo: 'distancia', descricao: 'Muro' } }),
  ]);
  projeto.nome = 'Casa Térrea — João';
  projeto.arquivoNome = 'planta-baixa.pdf';
  projeto.parametros.gerais.numeroPessoas = 4;
  projeto.parametros.gerais.espessuraParede = 0.15;
  return projeto;
}

/** O orquestrador ainda não registrou o materiaisApi: completa os materiais como ele fará. */
function levantamentoExemplo(projeto: Projeto): Levantamento {
  const lev = calcularLevantamento(projeto);
  const linhas = [...lev.arquitetura.linhas, ...lev.estrutura.linhas, ...lev.eletrica.linhas, ...lev.hidraulica.linhas];
  return { ...lev, materiais: calcularMateriais(linhas, projeto.composicoes ?? COMPOSICOES_PADRAO) };
}

interface Total {
  confirmado: number;
  pendente: number;
}

/** Réplica INDEPENDENTE da agregação da árvore (src/app/ArvoreLevantamento.tsx → agrupar). */
function totaisDaArvore(lev: Levantamento): Map<string, Total> {
  const totais = new Map<string, Total>();
  const somar = (chave: string, quantidade: number, status: Status) => {
    const t = totais.get(chave) ?? { confirmado: 0, pendente: 0 };
    totais.set(chave, t);
    if (status === 'confirmado') t.confirmado += quantidade;
    else t.pendente += quantidade;
  };
  for (const d of ['arquitetura', 'estrutura', 'eletrica', 'hidraulica'] as const) {
    for (const l of lev[d].linhas) {
      const descricao = l.detalhe ? `${l.descricao} (${l.detalhe})` : l.descricao;
      somar(`${ROTULO_DISCIPLINA[d]}|${l.grupo}|${descricao}|${l.unidade}`, l.quantidade, l.status);
    }
  }
  for (const m of lev.materiais) somar(`${ROTULO_DISCIPLINA.materiais}||${m.material}|${m.unidade}`, m.quantidade, m.status);
  return totais;
}

type Matriz = (string | number | null)[][];
const matriz = (ws: XLSX.WorkSheet): Matriz => XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true });
const chaveDaLinha = (grupo: unknown, descricao: unknown, detalhe: unknown, unidade: unknown) =>
  `${grupo ?? ''}|${detalhe ? `${descricao} (${detalhe})` : descricao}|${unidade}`;

describe('exportarExcel', () => {
  const projeto = projetoExemplo();
  const lev = levantamentoExemplo(projeto);
  const bytes = exportarExcel(projeto, lev);
  const livro = XLSX.read(bytes, { type: 'array' });

  it('o projeto de exemplo tem confirmados e pendentes nas quatro disciplinas e nos materiais', () => {
    for (const d of ['arquitetura', 'estrutura', 'eletrica', 'hidraulica'] as const) {
      const status = new Set(lev[d].linhas.map((l) => l.status));
      expect([d, status.has('confirmado'), status.has('pendente')]).toEqual([d, true, true]);
    }
    expect(new Set(lev.materiais.map((m) => m.status)).size).toBe(2);
  });

  it('gera um .xlsx que abre sem erro, com as 9 abas na ordem exigida', () => {
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0)).toBe('PK'); // zip
    expect(livro.SheetNames).toEqual(NOMES_ABAS);
    expect(Object.values(ABAS)).toEqual(NOMES_ABAS);
    for (const nome of NOMES_ABAS) expect(livro.Sheets[nome]?.['!ref']).toBeTruthy();
  });

  it('Resumo: cabeçalho com nome, data, arquivo e parâmetros essenciais', () => {
    const linhas = matriz(livro.Sheets.Resumo!);
    const valor = (rotulo: string) => linhas.find((l) => l[0] === rotulo)?.[1];
    expect(valor('Levantamento')).toBe('Casa Térrea — João');
    expect(valor('Data')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(valor('Arquivo da planta')).toBe('planta-baixa.pdf');
    expect(valor('Pé-direito (m)')).toBe(2.8);
    expect(valor('Nº de pessoas')).toBe(4);
  });

  it('Resumo: os totais batem com a agregação da árvore (confirmado e pendente em separado)', () => {
    const linhas = matriz(livro.Sheets.Resumo!);
    const inicio = linhas.findIndex((l) => l[0] === COLUNAS_RESUMO[0] && l[5] === 'Confirmado' && l[6] === 'Pendente');
    expect(inicio).toBeGreaterThan(0);
    expect(linhas[inicio - 1]?.[0]).toBe(TITULO_TOTAIS);
    const esperado = totaisDaArvore(lev);
    const vistos = new Set<string>();
    for (const l of linhas.slice(inicio + 1)) {
      const chave = `${l[0]}|${chaveDaLinha(l[1], l[2], l[3], l[4])}`;
      const total = esperado.get(chave);
      expect(total, `linha do Resumo sem par na árvore: ${chave}`).toBeDefined();
      expect(vistos.has(chave), `linha duplicada no Resumo: ${chave}`).toBe(false);
      vistos.add(chave);
      expect(typeof l[5]).toBe('number');
      expect(typeof l[6]).toBe('number');
      expect(l[5] as number).toBeCloseTo(total!.confirmado, 9);
      expect(l[6] as number).toBeCloseTo(total!.pendente, 9);
    }
    expect(vistos.size).toBe(esperado.size); // nada da árvore ficou de fora
    expect(vistos.size).toBeGreaterThan(20);
    // confirmados nunca incluem pendentes: a soma geral dos confirmados é só das linhas confirmadas
    const todas: LinhaQuantitativo[] = [...lev.arquitetura.linhas, ...lev.estrutura.linhas, ...lev.eletrica.linhas, ...lev.hidraulica.linhas];
    const somaConfirmada = todas.filter((x) => x.status === 'confirmado').reduce((s, x) => s + x.quantidade, 0);
    const somaResumo = linhas.slice(inicio + 1).filter((l) => l[0] !== ROTULO_DISCIPLINA.materiais).reduce((s, l) => s + (l[5] as number), 0);
    expect(somaResumo).toBeCloseTo(somaConfirmada, 6);
  });

  it('abas de detalhe: colunas, células numéricas com 2 casas e mesmos totais da árvore', () => {
    const esperado = totaisDaArvore(lev);
    const disciplinaDaAba: Record<string, string> = {
      Ambientes: 'Arquitetura',
      Esquadrias: 'Arquitetura',
      Paredes: 'Arquitetura',
      Acabamentos: 'Arquitetura',
      Estrutura: 'Estrutura',
      Elétrica: 'Elétrica',
      Hidráulica: 'Hidráulica',
    };
    let conferidas = 0;
    for (const [aba, disciplina] of Object.entries(disciplinaDaAba)) {
      const ws = livro.Sheets[aba]!;
      const linhas = matriz(ws);
      expect(linhas[0]).toEqual(COLUNAS_DETALHE);
      linhas.slice(1).forEach((l, i) => {
        if (disciplina === 'Arquitetura') expect(l[0]).toBe(aba);
        const total = esperado.get(`${disciplina}|${chaveDaLinha(l[0], l[1], l[2], l[3])}`);
        expect(total, `${aba}: ${l[1]}`).toBeDefined();
        expect(l[4] as number).toBeCloseTo(total!.confirmado, 9);
        expect(l[5] as number).toBeCloseTo(total!.pendente, 9);
        expect([null, 'Sim']).toContain(l[6]);
        for (const coluna of ['E', 'F']) {
          const celula = ws[`${coluna}${i + 2}`] as XLSX.CellObject;
          expect(celula.t).toBe('n');
          expect(celula.w).toMatch(/[.,]\d{2}$/);
        }
        conferidas++;
      });
    }
    expect(conferidas).toBeGreaterThan(20);
    expect(matriz(livro.Sheets.Ambientes!).length).toBeGreaterThan(1);
    expect(matriz(livro.Sheets.Paredes!).length).toBeGreaterThan(1);
    expect(matriz(livro.Sheets.Acabamentos!).length).toBeGreaterThan(1);
  });

  it('aba Materiais: consolidado com confirmados e pendentes separados', () => {
    const linhas = matriz(livro.Sheets.Materiais!);
    expect(linhas[0]).toEqual(['Material', 'Unidade', 'Quantidade confirmada', 'Quantidade pendente', 'Origem']);
    const esperado = totaisDaArvore(lev);
    const dados = linhas.slice(1).filter((l) => typeof l[2] === 'number');
    expect(dados.length).toBeGreaterThan(5);
    for (const l of dados) {
      const total = esperado.get(`Materiais||${l[0]}|${l[1]}`);
      expect(total, String(l[0])).toBeDefined();
      expect(l[2] as number).toBeCloseTo(total!.confirmado, 9);
      expect(l[3] as number).toBeCloseTo(total!.pendente, 9);
      expect(l[4]).toBeTruthy();
    }
    expect(linhas.at(-1)?.[0]).toContain('SINAPI');
  });

  it('valor manual sai marcado com "Sim"', () => {
    const p = projetoExemplo();
    const sala = p.elementos.find((e) => e.id === 'Sala')!;
    sala.manuais = { area: 33 };
    const abas = montarPlanilhas(p, levantamentoExemplo(p), new Date(2026, 0, 5));
    const ambientes = abas.find((a) => a.nome === 'Ambientes')!;
    expect(ambientes.linhas.some((l) => l[6] === 'Sim')).toBe(true);
    expect(abas[0]!.linhas[1]).toEqual(['Data', '05/01/2026']);
  });

  it('projeto vazio também exporta (dados faltantes como texto)', () => {
    const vazio = projetoCom([]);
    vazio.parametros.gerais.peDireito = null;
    const livroVazio = XLSX.read(exportarExcel(vazio, levantamentoExemplo(vazio)), { type: 'array' });
    expect(livroVazio.SheetNames).toEqual(NOMES_ABAS);
    const linhas = matriz(livroVazio.Sheets.Resumo!);
    expect(linhas.find((l) => l[0] === 'Pé-direito (m)')?.[1]).toBe('não informado');
    expect(matriz(livroVazio.Sheets.Estrutura!)).toEqual([COLUNAS_DETALHE]);
  });

  it('formato numérico de 2 casas gravado no arquivo', () => {
    const comEstilos = XLSX.read(bytes, { type: 'array', cellNF: true, cellStyles: true });
    const celula = comEstilos.Sheets.Ambientes!.E2 as XLSX.CellObject;
    expect(celula.z).toBe(FORMATO_QUANTIDADE);
    expect(comEstilos.Sheets.Resumo!['!cols']?.length).toBeGreaterThanOrEqual(7);
  });
});

describe('exportarJSON', () => {
  it('envelope bim-leve v1, identado e reimportável (projeto profundamente igual)', () => {
    const projeto = projetoExemplo();
    projeto.composicoes = COMPOSICOES_PADRAO;
    const texto = exportarJSON(projeto);
    const lido = JSON.parse(texto);
    expect(lido.formato).toBe(FORMATO_JSON);
    expect(lido.formato).toBe('bim-leve');
    expect(lido.versao).toBe(VERSAO_JSON);
    expect(new Date(lido.exportadoEm).toISOString()).toBe(lido.exportadoEm);
    expect(lido.projeto).toEqual(projeto);
    expect(Object.keys(lido)).toEqual(['formato', 'versao', 'exportadoEm', 'projeto']);
    expect(texto).toContain('\n  "projeto"');
  });
});

describe('PDF (impressão) e nome de arquivo', () => {
  it('orientação segue a proporção da imagem', () => {
    expect(orientacaoDaImagem(1600, 900)).toBe('landscape');
    expect(orientacaoDaImagem(900, 1600)).toBe('portrait');
  });

  it('HTML de impressão: @page, título escapado no cabeçalho e a imagem', () => {
    const html = montarHtmlImpressao('data:image/png;base64,AAAA', 'Casa <1> & "anexo"', 'landscape');
    expect(html).toContain('@page { size: A4 landscape;');
    expect(html).toContain('<header>Casa &lt;1&gt; &amp; &quot;anexo&quot;</header>');
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).not.toContain('<1>');
  });

  it('nome do arquivo derivado do nome do levantamento', () => {
    expect(nomeArquivo('Casa Térrea — João', 'xlsx')).toBe('casa-terrea-joao.xlsx');
    expect(nomeArquivo('  ', 'json')).toBe('levantamento.json');
  });
});
