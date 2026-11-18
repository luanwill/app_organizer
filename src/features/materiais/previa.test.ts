import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Elemento, Levantamento, LinhaQuantitativo, Projeto } from '@/core/model';
import { moduloArquitetura } from '@/features/arq';
import { moduloEstrutura } from '@/features/estrutura';
import { moduloEletrica } from '@/features/eletrica';
import { moduloHidraulica } from '@/features/hidraulica';
import { ambiente, parede, projetoCom, pt } from '@/features/estrutura/apoio-teste';
import { calcularMateriais } from './calcular';
import { COMPOSICOES_PADRAO } from './config';
import { PainelPreviaAnalise } from './PainelPreviaAnalise';
import {
  andamento,
  estadoCascata,
  formatarValorPrevia,
  progressoGeral,
  resumirPrevia,
  suavizar,
  valorContagem,
} from './previa';
import { ORDEM_FASES_PREVIA, TEXTO_CHAMADA_FINAL, TEXTO_PREVIA, type FasePrevia } from './previaConfig';

function el(e: Omit<Elemento, 'pagina' | 'vinculos' | 'origem' | 'status'> & Partial<Elemento>): Elemento {
  return { pagina: 1, vinculos: {}, origem: 'sugerido-auto', status: 'confirmado', ...e } as Elemento;
}

/** Projeto da "prévia": tudo confirmado (como o app fará sobre a cópia). */
function projetoPrevia(): Projeto {
  return projetoCom([
    ambiente('Sala', 0, 0, 5, 4),
    parede('p1', [0, 0], [5, 0]),
    parede('p2', [5, 0], [5, 4]),
    parede('p3', [5, 4], [0, 4]),
    parede('p4', [0, 4], [0, 0]),
    el({ id: 'pil', tipo: 'pilar', disciplina: 'estrutura', geometria: { tipo: 'ponto', ponto: pt(0, 0) }, props: { secaoB: 0.14, secaoH: 0.3 } }),
    el({ id: 'qd', tipo: 'quadro', disciplina: 'eletrica', geometria: { tipo: 'ponto', ponto: pt(0.2, 2) }, props: {} }),
    el({ id: 'luz', tipo: 'ponto-eletrico', disciplina: 'eletrica', geometria: { tipo: 'ponto', ponto: pt(2.5, 2) }, props: { tipoPonto: 'luz', potenciaVA: 100, altura: 'teto' } }),
    el({ id: 'lav', tipo: 'ponto-hidraulico', disciplina: 'hidraulica', geometria: { tipo: 'ponto', ponto: pt(4.8, 3.8) }, props: { aparelho: 'lavatorio', aguaFria: true, aguaQuente: false, esgoto: true } }),
  ]);
}

function levantamentoDe(projeto: Projeto): Levantamento {
  const arquitetura = moduloArquitetura.calcular(projeto);
  const estrutura = moduloEstrutura.calcular(projeto);
  const eletrica = moduloEletrica.calcular(projeto);
  const hidraulica = moduloHidraulica.calcular(projeto);
  const linhas = [...arquitetura.linhas, ...estrutura.linhas, ...eletrica.linhas, ...hidraulica.linhas];
  return { arquitetura, estrutura, eletrica, hidraulica, materiais: calcularMateriais(linhas, COMPOSICOES_PADRAO) };
}

const linha = (p: Partial<LinhaQuantitativo>): LinhaQuantitativo => ({
  id: Math.random().toString(36),
  disciplina: 'arquitetura',
  grupo: 'Paredes',
  descricao: 'Parede — comprimento',
  unidade: 'm',
  quantidade: 1,
  status: 'confirmado',
  elementoIds: [],
  ...p,
});

const VAZIO: Levantamento = {
  arquitetura: { linhas: [], alertas: [] },
  estrutura: { linhas: [], alertas: [] },
  eletrica: { linhas: [], alertas: [] },
  hidraulica: { linhas: [], alertas: [] },
  materiais: [],
};

describe('contagem crescente', () => {
  it('vai de 0 ao valor final, monotônica e suavizada', () => {
    expect(valorContagem(120, 0, 'm')).toBe(0);
    expect(valorContagem(120, 1, 'm')).toBe(120);
    expect(valorContagem(120, 2, 'm')).toBe(120);
    expect(valorContagem(120, -1, 'm')).toBe(0);
    let anterior = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = valorContagem(120, t, 'm');
      expect(v).toBeGreaterThanOrEqual(anterior);
      anterior = v;
    }
    expect(suavizar(0.5)).toBeGreaterThan(0.5); // desacelera no fim
  });

  it('unidades inteiras contam de 1 em 1', () => {
    expect(Number.isInteger(valorContagem(7, 0.37, 'un'))).toBe(true);
    expect(valorContagem(7, 1, 'un')).toBe(7);
  });

  it('formata com vírgula decimal e unidade', () => {
    expect(formatarValorPrevia(1234.5, 'm²')).toBe('1.234,50 m²');
    expect(formatarValorPrevia(7, 'un')).toBe('7 un');
  });
});

describe('o que mostrar por fase', () => {
  it('andamento: oculto antes, segue o progresso na fase, completo depois', () => {
    expect(andamento('estrutura', 'paredes', 0.5)).toBeNull();
    expect(andamento('estrutura', 'estrutura', 0.4)).toBe(0.4);
    expect(andamento('estrutura', 'eletrica', 0)).toBe(1);
    expect(andamento('materiais', 'concluida', 0)).toBe(1);
  });

  it('progresso geral cresce com as fases e termina em 1', () => {
    const valores = ORDEM_FASES_PREVIA.map((f) => progressoGeral(f, 0.5));
    for (let i = 1; i < valores.length; i++) expect(valores[i]!).toBeGreaterThan(valores[i - 1]!);
    expect(progressoGeral('varredura', 0)).toBe(0);
    expect(progressoGeral('concluida', 0)).toBe(1);
  });

  it('cascata dos materiais: itens surgem em ordem e terminam no valor final', () => {
    const total = 10;
    expect(estadoCascata(0, total, 'hidraulica', 1).visivel).toBe(false);
    expect(estadoCascata(0, total, 'materiais', 0)).toEqual({ visivel: true, t: 0 });
    expect(estadoCascata(9, total, 'materiais', 0.1).visivel).toBe(false);
    const visiveis = (p: number) => Array.from({ length: total }, (_, i) => estadoCascata(i, total, 'materiais', p).visivel).filter(Boolean).length;
    expect(visiveis(0.2)).toBeLessThan(visiveis(0.5));
    expect(visiveis(0.6)).toBe(total);
    for (let i = 0; i < total; i++) expect(estadoCascata(i, total, 'materiais', 1).t).toBe(1);
    for (let i = 0; i < total; i++) expect(estadoCascata(i, total, 'concluida', 0)).toEqual({ visivel: true, t: 1 });
  });
});

describe('resumirPrevia', () => {
  it('usa só linhas confirmadas da prévia; omite destaques zerados; conta faltantes distintos', () => {
    const previa: Levantamento = {
      ...VAZIO,
      arquitetura: {
        linhas: [
          linha({ elementoIds: ['p1'], quantidade: 5 }),
          linha({ elementoIds: ['p2'], quantidade: 4 }),
          linha({ elementoIds: ['p3'], quantidade: 100, status: 'pendente' }),
        ],
        alertas: [
          { disciplina: 'arquitetura', campo: 'peDireito', mensagem: 'a' },
          { disciplina: 'arquitetura', campo: 'peDireito', mensagem: 'a' },
          { disciplina: 'arquitetura', campo: 'espessura', mensagem: 'b' },
        ],
      },
      materiais: [
        { id: '1', material: 'Bloco', unidade: 'un', quantidade: 10, status: 'confirmado', origem: 'x' },
        { id: '2', material: 'Bloco', unidade: 'un', quantidade: 99, status: 'pendente', origem: 'x' },
      ],
    };
    const r = resumirPrevia(previa);
    const arq = r.secoes.find((s) => s.disciplina === 'arquitetura')!;
    expect(arq.destaques.map((d) => [d.rotulo, d.valor])).toEqual([
      ['Paredes', 2],
      ['Comprimento de paredes', 9],
    ]);
    expect(arq.faltantes).toBe(2);
    expect(r.secoes.find((s) => s.disciplina === 'estrutura')!.destaques).toEqual([]);
    expect(r.materiais).toEqual([{ chave: 'Bloco|un', material: 'Bloco', unidade: 'un', quantidade: 10 }]);
  });

  it('com um projeto real: paredes, piso, estrutura, elétrica, hidráulica e materiais', () => {
    const r = resumirPrevia(levantamentoDe(projetoPrevia()));
    const valor = (d: string, rotulo: string) => r.secoes.find((s) => s.disciplina === d)?.destaques.find((x) => x.rotulo === rotulo)?.valor;
    expect(valor('arquitetura', 'Paredes')).toBe(4);
    expect(valor('arquitetura', 'Comprimento de paredes')).toBeCloseTo(18, 6);
    expect(valor('arquitetura', 'Ambientes')).toBe(1);
    expect(valor('arquitetura', 'Área de piso')).toBeCloseTo(20, 6);
    expect(valor('arquitetura', 'Alvenaria')).toBeGreaterThan(0);
    expect(valor('estrutura', 'Concreto')).toBeGreaterThan(0);
    expect(valor('eletrica', 'Pontos')).toBeGreaterThanOrEqual(1);
    expect(valor('hidraulica', 'Pontos')).toBe(1);
    expect(r.materiais.some((m) => m.material.startsWith('Bloco cerâmico'))).toBe(true);
  });
});

describe('PainelPreviaAnalise (render estático)', () => {
  const previa = levantamentoDe(projetoPrevia());
  const render = (fase: FasePrevia, progresso = 0.5) =>
    renderToStaticMarkup(createElement(PainelPreviaAnalise, { fase, progresso, previa, aoPular: () => {}, aoFechar: () => {} }));

  it('sempre deixa explícito que é uma prévia', () => {
    for (const f of ORDEM_FASES_PREVIA) expect(render(f)).toContain(TEXTO_PREVIA);
  });

  it('seções surgem conforme a fase; "Pular animação" até concluir', () => {
    const varredura = render('varredura');
    expect(varredura).toContain('Pular animação');
    expect(varredura).not.toContain('Comprimento de paredes');
    const paredes = render('paredes');
    expect(paredes).toContain('Comprimento de paredes');
    expect(paredes).not.toContain('Área de piso');
    expect(paredes).not.toContain('Estrutura');
    expect(render('estrutura')).toContain('Concreto');
    expect(render('hidraulica')).not.toContain('Bloco cerâmico');
    expect(render('materiais', 1)).toContain('Bloco cerâmico');
  });

  it('concluída: valores finais, chamada para aceitar e botão Fechar', () => {
    const html = render('concluida', 0);
    expect(html).toContain(TEXTO_CHAMADA_FINAL);
    expect(html).toContain('Fechar');
    expect(html).not.toContain('Pular animação');
    expect(html).toContain('18,00 m'); // comprimento de paredes final
    expect(html).toContain('20,00 m²'); // piso final
    expect(html).toContain('4 un'); // 4 paredes
  });
});
