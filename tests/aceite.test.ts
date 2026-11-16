/**
 * QA (S10) — CRITÉRIOS DE ACEITE, um bloco por critério (numerados como no enunciado).
 * Usa o CASO DE EXEMPLO de ./caso-exemplo. Testes que revelam falha do produto FALHAM de verdade.
 */
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { Elemento, Levantamento, LinhaQuantitativo, Projeto, Status } from '@/core/model';
import { AVISO_COMPOSICOES, ROTULO_DISCIPLINA } from '@/core/model';
import {
  arredondar,
  calcularEscala,
  comprimentoPolilinha,
  distancia,
  formatarNumero,
  paraMetros,
  projetarNoSegmento,
} from '@/core/calc';
import { calcularLevantamento } from '@/app/levantamento';
import { MODULOS } from '@/app/modulos';
import { exportarExcel, exportarJSON } from '@/features/export/exportar';
import { importarJSON } from '@/features/import/json';
import { escalaDaCalibracao, motivoBloqueio } from '@/features/viewer/desenho';
import {
  CANTOS,
  COMPRIMENTO_PAREDES,
  ESCALA,
  NO_T,
  ambiente,
  casoBase,
  casoExemplo,
  casoTudoConfirmado,
  casoTudoPendente,
  comSugestoes,
  confirmar,
  parede,
  pt,
  u,
} from './caso-exemplo';

// ---------------------------------------------------------------- utilitários

const DISC = ['arquitetura', 'estrutura', 'eletrica', 'hidraulica'] as const;
type Disc = (typeof DISC)[number];

const todasLinhas = (lev: Levantamento): LinhaQuantitativo[] => DISC.flatMap((d) => lev[d].linhas);

function soma(linhas: LinhaQuantitativo[], filtro: (l: LinhaQuantitativo) => boolean, status?: Status): number {
  return linhas.filter((l) => filtro(l) && (!status || l.status === status)).reduce((s, l) => s + l.quantidade, 0);
}

/** MESMA agregação de src/app/ArvoreLevantamento.tsx: disciplina → grupo → descrição(+detalhe)|unidade. */
function agregarComoPainel(lev: Levantamento): Map<string, { confirmado: number; pendente: number }> {
  const mapa = new Map<string, { confirmado: number; pendente: number }>();
  const add = (chave: string, q: number, status: Status) => {
    const a = mapa.get(chave) ?? { confirmado: 0, pendente: 0 };
    mapa.set(chave, a);
    if (status === 'confirmado') a.confirmado += q;
    else a.pendente += q;
  };
  for (const d of DISC) {
    for (const l of lev[d].linhas) {
      const descricao = l.detalhe ? `${l.descricao} (${l.detalhe})` : l.descricao;
      add(`${ROTULO_DISCIPLINA[d]}|${l.grupo}|${descricao}|${l.unidade}`, l.quantidade, l.status);
    }
  }
  for (const m of lev.materiais) add(`${ROTULO_DISCIPLINA.materiais}||${m.material}|${m.unidade}`, m.quantidade, m.status);
  return mapa;
}

const pontoDe = (e: Elemento) => (e.geometria.tipo === 'ponto' ? e.geometria.ponto : null);
const pilaresDe = (p: Projeto) => p.elementos.filter((e) => e.tipo === 'pilar');
const temPilarEm = (p: Projeto, [x, y]: [number, number]) =>
  pilaresDe(p).some((e) => distancia(pontoDe(e)!, pt(x, y)) * ESCALA < 0.01);

// ---------------------------------------------------------------- 1

describe('1. Linha sobre uma cota de 3,07 m mede 3,07 m ±1% após a calibração', () => {
  const a = { x: 112.4, y: 80.2 };
  const b = { x: 265.9, y: 80.2 };

  it('calibração digitando "3,07" e medição da mesma linha', () => {
    const escala = escalaDaCalibracao(a, b, '3,07');
    expect(escala).not.toBeNull();
    const medida = paraMetros(distancia(a, b), escala!);
    expect(Math.abs(medida - 3.07) / 3.07).toBeLessThan(0.01);
    expect(formatarNumero(medida)).toBe('3,07');
    expect(calcularEscala(a, b, 3.07)).toBeCloseTo(escala!, 12);
  });

  it('medição (ferramenta Distância) no levantamento: linha "comprimento" = 3,07 m ±1%', () => {
    const projeto = casoBase();
    projeto.paginas[1] = { escala: escalaDaCalibracao(a, b, '3,07') };
    projeto.elementos = [
      {
        id: 'med-1',
        tipo: 'medicao',
        disciplina: 'arquitetura',
        pagina: 1,
        geometria: { tipo: 'polilinha', pontos: [a, b] },
        vinculos: {},
        origem: 'desenhado',
        status: 'confirmado',
        props: { modo: 'distancia', descricao: 'Cota' },
      },
    ];
    const l = calcularLevantamento(projeto).arquitetura.linhas.find((x) => x.id === 'med-1:comprimento');
    expect(l).toBeDefined();
    expect(Math.abs(l!.quantidade - 3.07) / 3.07).toBeLessThan(0.01);
  });

  it('linha de ±1 px de erro de clique nas duas pontas continua dentro de 1%', () => {
    const escala = escalaDaCalibracao(a, b, '3,07')!;
    const medida = paraMetros(distancia({ x: a.x + 0.7, y: a.y + 0.5 }, { x: b.x - 0.7, y: b.y }), escala);
    expect(Math.abs(medida - 3.07) / 3.07).toBeLessThan(0.01);
  });
});

// ---------------------------------------------------------------- 2

describe('2. Ambiente de 3,07 × 2,98 m → 9,15 m² e 12,10 m', () => {
  const lev = calcularLevantamento(casoExemplo());
  const linha = (id: string) => lev.arquitetura.linhas.find((l) => l.id === id)!;

  it('área 9,15 m²', () => {
    expect(arredondar(linha('amb-quarto:area').quantidade, 2)).toBe(9.15);
    expect(formatarNumero(linha('amb-quarto:area').quantidade)).toBe('9,15');
  });
  it('perímetro 12,10 m', () => {
    expect(arredondar(linha('amb-quarto:perimetro').quantidade, 2)).toBe(12.1);
    expect(formatarNumero(linha('amb-quarto:perimetro').quantidade)).toBe('12,10');
  });
});

// ---------------------------------------------------------------- 3

describe('3. Planta em "L" (6 cantos) + parede interna em T: pilares', () => {
  const projeto = comSugestoes(casoBase(), 'estrutura');
  const pilares = pilaresDe(projeto);

  it('pilar em cada um dos 6 cantos', () => {
    for (const canto of CANTOS) expect(temPilarEm(projeto, canto), `canto ${canto}`).toBe(true);
  });
  it('pilar no encontro em T', () => {
    expect(temPilarEm(projeto, NO_T)).toBe(true);
    const noT = pilares.find((e) => distancia(pontoDe(e)!, pt(...NO_T)) < 1e-6)!;
    expect(noT.tipo === 'pilar' && noT.props.noTipo).toBe('T');
  });
  it('intermediários nos vãos acima de 4,00 m: topo 9 m (2) e meio 5,80 m (1) → 10 pilares no total', () => {
    const inter = pilares.filter((e) => e.tipo === 'pilar' && e.props.noTipo === 'intermediario');
    expect(inter).toHaveLength(3);
    expect(pilares).toHaveLength(6 + 1 + 3);
    expect(temPilarEm(projeto, [3, 0])).toBe(true);
    expect(temPilarEm(projeto, [6, 0])).toBe(true);
    expect(temPilarEm(projeto, [6.1, 4])).toBe(true);
  });
  it('nenhum vão entre pilares consecutivos passa de 4,00 m (medido pelos trechos de baldrame)', () => {
    const vigas = projeto.elementos.filter((e) => e.tipo === 'viga-baldrame');
    for (const v of vigas) {
      const c = paraMetros(comprimentoPolilinha((v.geometria as { pontos: { x: number; y: number }[] }).pontos), ESCALA);
      expect(c, v.rotulo).toBeLessThanOrEqual(4 + 1e-9);
    }
  });
  it('vão de exatamente 4,00 m não ganha intermediário; acima da tolerância de 1% (4,05 m) ganha', () => {
    const caso = (lado: number) => {
      const p = casoBase();
      p.elementos = [
        parede('a', [0, 0], [lado, 0]),
        parede('b', [lado, 0], [lado, 3]),
        parede('c', [lado, 3], [0, 3]),
        parede('d', [0, 3], [0, 0]),
      ];
      return pilaresDe(comSugestoes(p, 'estrutura')).length;
    };
    expect(caso(4)).toBe(4);
    expect(caso(4.01)).toBe(4); // erro de calibração: dentro da tolerância
    expect(caso(4.05)).toBe(6);
  });
  it('todas as sugestões nascem pendentes e "sugerido-auto"', () => {
    const sug = projeto.elementos.filter((e) => e.disciplina === 'estrutura');
    expect(sug.length).toBeGreaterThan(0);
    expect(sug.every((e) => e.status === 'pendente' && e.origem === 'sugerido-auto')).toBe(true);
  });
});

// ---------------------------------------------------------------- 4

describe('4. Baldrame cobre 100% das paredes, dividido em trechos entre pilares', () => {
  const projeto = comSugestoes(casoBase(), 'estrutura');
  const vigas = projeto.elementos.filter((e) => e.tipo === 'viga-baldrame');
  const pts = (e: Elemento) => (e.geometria as { pontos: { x: number; y: number }[] }).pontos;

  it('comprimento total do baldrame = comprimento total das paredes (35,60 m)', () => {
    const total = vigas.reduce((s, v) => s + paraMetros(comprimentoPolilinha(pts(v)), ESCALA), 0);
    expect(COMPRIMENTO_PAREDES).toBeCloseTo(35.6, 9);
    expect(total).toBeCloseTo(COMPRIMENTO_PAREDES, 6);
    const lev = calcularLevantamento(projeto);
    expect(soma(lev.estrutura.linhas, (l) => l.grupo === 'Vigas baldrame' && l.unidade === 'm')).toBeCloseTo(COMPRIMENTO_PAREDES, 6);
  });
  it('cobertura geométrica: todo ponto (a cada 5 cm) do eixo de cada parede está sobre um trecho', () => {
    for (const par of projeto.elementos.filter((e) => e.tipo === 'parede')) {
      const [a, b] = pts(par) as [{ x: number; y: number }, { x: number; y: number }];
      const n = Math.ceil((distancia(a, b) * ESCALA) / 0.05);
      for (let i = 0; i <= n; i++) {
        const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
        const coberto = vigas.some((v) => projetarNoSegmento(p, pts(v)[0]!, pts(v)[1]!).distancia * ESCALA < 0.001);
        expect(coberto, `parede ${par.id} ponto ${i}/${n}`).toBe(true);
      }
    }
  });
  it('cada trecho tem 2 pontos e começa/termina em pilar; 11 trechos', () => {
    expect(vigas).toHaveLength(11);
    for (const v of vigas) {
      expect(pts(v)).toHaveLength(2);
      for (const p of pts(v)) {
        expect(pilaresDe(projeto).some((pil) => distancia(pontoDe(pil)!, p) * ESCALA < 0.01), `${v.rotulo}`).toBe(true);
      }
    }
  });
  it('nenhum pilar fica no meio de um trecho (trechos realmente divididos nos pilares)', () => {
    for (const v of vigas) {
      for (const pil of pilaresDe(projeto)) {
        const pr = projetarNoSegmento(pontoDe(pil)!, pts(v)[0]!, pts(v)[1]!);
        const noMeio = pr.distancia * ESCALA < 0.01 && pr.t > 0.01 && pr.t < 0.99;
        expect(noMeio, `${pil.rotulo} no meio de ${v.rotulo}`).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------- 5

describe('5. Sala 3 × 4 m (12 m², 14 m) → 160 VA de iluminação e 3 TUGs', () => {
  const projeto = comSugestoes(casoBase(), 'eletrica');
  const daSala = projeto.elementos.filter((e) => e.tipo === 'ponto-eletrico' && e.vinculos.ambienteId === 'amb-sala');

  it('a sala tem 12 m² e 14 m', () => {
    const lev = calcularLevantamento(projeto);
    expect(lev.arquitetura.linhas.find((l) => l.id === 'amb-sala:area')!.quantidade).toBeCloseTo(12, 9);
    expect(lev.arquitetura.linhas.find((l) => l.id === 'amb-sala:perimetro')!.quantidade).toBeCloseTo(14, 9);
  });
  it('iluminação: 160 VA (100 VA nos primeiros 6 m² + 60 VA a cada 4 m² inteiros)', () => {
    const luz = daSala.filter((e) => e.tipo === 'ponto-eletrico' && e.props.tipoPonto === 'luz');
    expect(luz.reduce((s, e) => s + (e.tipo === 'ponto-eletrico' ? e.props.potenciaVA : 0), 0)).toBe(160);
  });
  it('3 TUGs (1 a cada 5 m de perímetro ou fração) de 100 VA', () => {
    const tug = daSala.filter((e) => e.tipo === 'ponto-eletrico' && e.props.tipoPonto === 'tug');
    expect(tug).toHaveLength(3);
    expect(tug.every((e) => e.tipo === 'ponto-eletrico' && e.props.potenciaVA === 100)).toBe(true);
  });
  it('aceitas as sugestões da sala, o levantamento confirma 1 ponto de luz, 3 TUGs e 460 VA', () => {
    const lev = calcularLevantamento(casoExemplo());
    const conf = (id: string) => lev.eletrica.linhas.find((l) => l.id === id)?.quantidade;
    expect(conf('eletrica:pontos:luz:confirmado')).toBe(1);
    expect(conf('eletrica:pontos:tug:confirmado')).toBe(3);
    expect(conf('eletrica:carga:confirmado')).toBe(160 + 300);
  });
});

// ---------------------------------------------------------------- 6

describe('6. Banheiro: vaso (esgoto 100), lavatório, chuveiro e ralo; tubulação por diâmetro', () => {
  const projeto = comSugestoes(casoBase(), 'hidraulica');
  const doBanheiro = projeto.elementos.filter((e) => e.tipo === 'ponto-hidraulico' && e.vinculos.ambienteId === 'amb-banheiro');
  const aparelhos = doBanheiro.map((e) => (e.tipo === 'ponto-hidraulico' ? e.props.aparelho : ''));

  it('sugere vaso, lavatório, chuveiro e ralo', () => {
    expect([...aparelhos].sort()).toEqual(['chuveiro', 'lavatorio', 'ralo', 'vaso']);
  });
  it('vaso com esgoto de 100 mm', () => {
    const vaso = doBanheiro.find((e) => e.tipo === 'ponto-hidraulico' && e.props.aparelho === 'vaso')!;
    expect(vaso.tipo === 'ponto-hidraulico' && vaso.props.esgoto).toBe(true);
    const diam = (vaso.tipo === 'ponto-hidraulico' && vaso.props.diametroEsgoto) || projeto.parametros.hidraulica.diametroEsgotoMm.vaso;
    expect(diam).toBe(100);
  });
  it('tubulação separada por sistema e diâmetro (AF Ø25, esgoto Ø100 e Ø40 em linhas distintas)', () => {
    const p = { ...projeto, elementos: projeto.elementos.filter((e) => e.disciplina !== 'hidraulica' || e.vinculos.ambienteId !== 'amb-cozinha') };
    const tubos = calcularLevantamento(p).hidraulica.linhas.filter((l) => l.grupo === 'Tubos' && l.unidade === 'm');
    const chaves = tubos.map((l) => `${l.descricao}|${l.detalhe}`);
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(chaves).toContain('Tubo de esgoto|Ø100 mm');
    expect(chaves).toContain('Tubo de esgoto|Ø40 mm');
    expect(chaves).toContain('Tubo de água fria|Ø25 mm');
    for (const t of tubos) expect(t.quantidade).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- 7

describe('7. Alterar o pé-direito (2,80 → 3,00) atualiza todas as quantidades dependentes', () => {
  const com = (pe: number): Levantamento => {
    const p = casoTudoConfirmado();
    return calcularLevantamento({ ...p, parametros: { ...p.parametros, gerais: { ...p.parametros.gerais, peDireito: pe } } });
  };
  const a = com(2.8);
  const b = com(3.0);
  const q = (lev: Levantamento, d: Disc, f: (l: LinhaQuantitativo) => boolean) => soma(lev[d].linhas, f);
  const mat = (lev: Levantamento, nome: RegExp) => lev.materiais.filter((m) => nome.test(m.material)).reduce((s, m) => s + m.quantidade, 0);

  it('parede (alvenaria): +0,20 m × 35,60 m = +7,12 m²', () => {
    const f = (l: LinhaQuantitativo) => l.servico === 'alvenaria';
    expect(q(b, 'arquitetura', f) - q(a, 'arquitetura', f)).toBeCloseTo(0.2 * COMPRIMENTO_PAREDES, 6);
  });
  it('área de parede dos ambientes e pintura de parede aumentam (pintura: +0,20 × perímetros sala+quarto)', () => {
    const f = (l: LinhaQuantitativo) => l.servico === 'pintura-parede';
    expect(q(b, 'arquitetura', f) - q(a, 'arquitetura', f)).toBeCloseTo(0.2 * (14 + 12.1), 6);
    const g = (l: LinhaQuantitativo) => l.id.endsWith(':area-parede');
    expect(q(b, 'arquitetura', g)).toBeGreaterThan(q(a, 'arquitetura', g));
  });
  it('pilares: concreto, forma e aço aumentam (10 pilares 0,14×0,30 → +0,084 m³ de concreto)', () => {
    const conc = (l: LinhaQuantitativo) => l.grupo === 'Pilares' && l.servico === 'concreto';
    expect(q(b, 'estrutura', conc) - q(a, 'estrutura', conc)).toBeCloseTo(10 * 0.14 * 0.3 * 0.2, 6);
    for (const s of ['forma', 'aco'] as const) {
      const f = (l: LinhaQuantitativo) => l.grupo === 'Pilares' && l.servico === s;
      expect(q(b, 'estrutura', f), s).toBeGreaterThan(q(a, 'estrutura', f));
    }
  });
  it('eletrodutos verticais: comprimento de eletroduto e de fios aumenta', () => {
    const el = (l: LinhaQuantitativo) => l.descricao === 'Eletroduto';
    const fio = (l: LinhaQuantitativo) => l.descricao.startsWith('Fio');
    expect(q(b, 'eletrica', el)).toBeGreaterThan(q(a, 'eletrica', el));
    expect(q(b, 'eletrica', fio)).toBeGreaterThan(q(a, 'eletrica', fio));
  });
  it('tubos verticais: tubo de água fria aumenta 0,20 m por ponto de água (5 pontos → +1,00 m)', () => {
    const af = (l: LinhaQuantitativo) => l.descricao === 'Tubo de água fria';
    expect(q(b, 'hidraulica', af) - q(a, 'hidraulica', af)).toBeCloseTo(5 * 0.2, 2);
  });
  it('materiais: blocos, tinta, cimento, aço, eletroduto e tubo aumentam', () => {
    for (const nome of [/^Bloco cerâmico/, /^Tinta/, /^Cimento/, /^Aço/, /^Eletroduto/, /^Tubo de água fria/, /^Fio/]) {
      expect(mat(b, nome), String(nome)).toBeGreaterThan(mat(a, nome));
    }
  });
  it('o que não depende do pé-direito não muda (piso, baldrame, contagens)', () => {
    const piso = (l: LinhaQuantitativo) => l.servico === 'piso';
    expect(q(b, 'arquitetura', piso)).toBeCloseTo(q(a, 'arquitetura', piso), 9);
    const bald = (l: LinhaQuantitativo) => l.grupo === 'Vigas baldrame';
    expect(q(b, 'estrutura', bald)).toBeCloseTo(q(a, 'estrutura', bald), 9);
  });
});

// ---------------------------------------------------------------- 8

describe('8. Sugestões pendentes não entram nos totais confirmados', () => {
  const projeto = casoExemplo();
  const lev = calcularLevantamento(projeto);
  const statusDe = new Map(projeto.elementos.map((e) => [e.id, e.status]));

  it('o caso tem elementos pendentes e confirmados nas 3 disciplinas sugeridas', () => {
    for (const d of ['estrutura', 'eletrica', 'hidraulica'] as const) {
      const els = projeto.elementos.filter((e) => e.disciplina === d && e.origem === 'sugerido-auto');
      expect(els.some((e) => e.status === 'pendente'), d).toBe(true);
      expect(els.some((e) => e.status === 'confirmado'), d).toBe(true);
    }
  });

  for (const d of DISC) {
    it(`${d}: totais confirmados = levantamento do projeto SEM os elementos pendentes`, () => {
      const semPendentes = calcularLevantamento({ ...projeto, elementos: projeto.elementos.filter((e) => e.status === 'confirmado') });
      expect(semPendentes[d].linhas.filter((l) => l.status === 'pendente')).toEqual([]);
      const chave = (l: LinhaQuantitativo) => `${l.grupo}|${l.descricao}|${l.detalhe ?? ''}|${l.unidade}`;
      const agrupar = (ls: LinhaQuantitativo[]) => {
        const m = new Map<string, number>();
        for (const l of ls) if (l.status === 'confirmado') m.set(chave(l), (m.get(chave(l)) ?? 0) + l.quantidade);
        return Object.fromEntries([...m].filter(([, v]) => v !== 0).map(([k, v]) => [k, arredondar(v, 4)]).sort());
      };
      expect(agrupar(lev[d].linhas)).toEqual(agrupar(semPendentes[d].linhas));
    });

    it(`${d}: nenhuma linha confirmada referencia elemento pendente`, () => {
      const ruins = lev[d].linhas
        .filter((l) => l.status === 'confirmado' && l.elementoIds.some((id) => statusDe.get(id) === 'pendente'))
        .map((l) => l.id);
      expect(ruins).toEqual([]);
    });
  }

  it('materiais: confirmados = materiais do projeto SEM os pendentes', () => {
    const semPendentes = calcularLevantamento({ ...projeto, elementos: projeto.elementos.filter((e) => e.status === 'confirmado') });
    expect(semPendentes.materiais.filter((m) => m.status === 'pendente')).toEqual([]);
    const obj = (l: Levantamento) =>
      Object.fromEntries(l.materiais.filter((m) => m.status === 'confirmado').map((m) => [`${m.material}|${m.unidade}`, arredondar(m.quantidade, 4)]).sort());
    expect(obj(lev)).toEqual(obj(semPendentes));
  });

  it('com TODAS as sugestões pendentes, estrutura e pontos sugeridos não têm nada confirmado', () => {
    const l = calcularLevantamento(casoTudoPendente());
    expect(l.estrutura.linhas.filter((x) => x.status === 'confirmado')).toEqual([]);
    expect(l.eletrica.linhas.filter((x) => x.status === 'confirmado' && x.quantidade !== 0).map((x) => x.id)).toEqual([]);
    const hidConf = l.hidraulica.linhas.filter((x) => x.status === 'confirmado').map((x) => x.id).sort();
    // só o que vem de elementos confirmados (reservatório e caixa de inspeção desenhados)
    expect(hidConf).toEqual(['hid:caixa-inspecao:confirmado', 'hid:reservatorio:capacidade']);
    const matConf = l.materiais.filter((m) => m.status === 'confirmado' && /Concreto|Cimento|Aço|Eletroduto|Fio|Tubo|Vigota/.test(m.material));
    expect(matConf.map((m) => m.material)).toEqual([]);
  });

  it('aceitar uma sugestão move a quantidade de pendente para confirmado (pilar P1)', () => {
    const antes = calcularLevantamento(casoTudoPendente());
    const aceito = casoTudoPendente();
    aceito.elementos = aceito.elementos.map((e) => (e.id === 'est-1-P1' ? ({ ...e, status: 'confirmado' } as Elemento) : e));
    const depois = calcularLevantamento(aceito);
    const pil = (l: LinhaQuantitativo) => l.descricao === 'Pilares (un)';
    expect(soma(antes.estrutura.linhas, pil, 'confirmado')).toBe(0);
    expect(soma(antes.estrutura.linhas, pil, 'pendente')).toBe(10);
    expect(soma(depois.estrutura.linhas, pil, 'confirmado')).toBe(1);
    expect(soma(depois.estrutura.linhas, pil, 'pendente')).toBe(9);
    const conc = (l: LinhaQuantitativo) => l.grupo === 'Pilares' && l.servico === 'concreto';
    expect(soma(depois.estrutura.linhas, conc, 'confirmado')).toBeCloseTo(0.14 * 0.3 * 3.1, 9);
    expect(soma(depois.estrutura.linhas, conc)).toBeCloseTo(soma(antes.estrutura.linhas, conc), 9);
    const cimento = (l: Levantamento, s: Status) => l.materiais.filter((m) => m.material === 'Cimento' && m.status === s).reduce((x, m) => x + m.quantidade, 0);
    expect(cimento(antes, 'confirmado')).toBe(0);
    expect(cimento(depois, 'confirmado')).toBeGreaterThan(0);
    expect(cimento(depois, 'confirmado') + cimento(depois, 'pendente')).toBeCloseTo(cimento(antes, 'pendente'), 6);
  });

  const totalConfirmado = calcularLevantamento(casoTudoConfirmado());
  const aditivas: [Disc, (l: LinhaQuantitativo) => boolean, string][] = [
    ['estrutura', (l) => l.servico === 'concreto', 'concreto'],
    ['estrutura', (l) => l.servico === 'aco', 'aço'],
    ['estrutura', (l) => l.servico === 'forma', 'forma'],
    ['eletrica', (l) => l.descricao === 'Tomada de uso geral (TUG)', 'TUG'],
    ['eletrica', (l) => l.descricao === 'Carga total instalada', 'carga'],
    ['hidraulica', (l) => l.descricao === 'Tubo de água fria', 'tubo AF'],
    ['hidraulica', (l) => l.descricao === 'Tubo de esgoto', 'tubo esgoto'],
  ];
  for (const [d, f, nome] of aditivas) {
    it(`confirmado + pendente (caso parcial) = total com tudo confirmado — ${nome}`, () => {
      expect(soma(lev[d].linhas, f)).toBeCloseTo(soma(totalConfirmado[d].linhas, f), 1);
    });
  }

});

// ---------------------------------------------------------------- 9

describe('9. Excel abre sem erro e o Resumo bate com o painel', () => {
  const projeto = casoExemplo();
  const lev = calcularLevantamento(projeto);
  const bytes = exportarExcel(projeto, lev);
  const livro = XLSX.read(bytes, { type: 'array' });
  const matriz = (aba: string) => XLSX.utils.sheet_to_json<unknown[]>(livro.Sheets[aba]!, { header: 1, defval: null });

  it('arquivo .xlsx válido (assinatura ZIP) e relido pela lib xlsx', () => {
    expect(bytes.length).toBeGreaterThan(1000);
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
  });
  it('9 abas, na ordem', () => {
    expect(livro.SheetNames).toEqual(['Resumo', 'Ambientes', 'Esquadrias', 'Paredes', 'Acabamentos', 'Estrutura', 'Elétrica', 'Hidráulica', 'Materiais']);
  });
  it('Resumo: cada linha do painel (disciplina → grupo → descrição(+detalhe)|unidade) com os mesmos confirmados e pendentes', () => {
    const linhas = matriz('Resumo');
    const ini = linhas.findIndex((r) => r[0] === 'Disciplina');
    expect(ini).toBeGreaterThan(-1);
    const doExcel = new Map<string, { confirmado: number; pendente: number }>();
    for (const r of linhas.slice(ini + 1)) {
      if (!r[0]) continue;
      const descricao = r[3] ? `${r[2]} (${r[3]})` : String(r[2]);
      const chave = `${r[0]}|${r[1] ?? ''}|${descricao}|${r[4]}`;
      expect(doExcel.has(chave), `linha duplicada no Resumo: ${chave}`).toBe(false);
      doExcel.set(chave, { confirmado: Number(r[5] ?? 0), pendente: Number(r[6] ?? 0) });
    }
    const doPainel = agregarComoPainel(lev);
    expect([...doExcel.keys()].sort()).toEqual([...doPainel.keys()].sort());
    for (const [chave, v] of doPainel) {
      expect(doExcel.get(chave)!.confirmado, `${chave} (confirmado)`).toBeCloseTo(v.confirmado, 9);
      expect(doExcel.get(chave)!.pendente, `${chave} (pendente)`).toBeCloseTo(v.pendente, 9);
    }
    expect(doPainel.size).toBeGreaterThan(100);
  });
  it('Resumo: cabeçalho com nome, pé-direito e nº de pessoas', () => {
    const linhas = matriz('Resumo');
    expect(linhas[0]).toEqual(expect.arrayContaining(['Levantamento', 'Caso de exemplo QA']));
    expect(linhas.find((r) => r[0] === 'Pé-direito (m)')![1]).toBe(2.8);
    expect(linhas.find((r) => r[0] === 'Nº de pessoas')![1]).toBe(4);
  });
  it('abas de detalhe somam o mesmo que o levantamento (confirmado e pendente)', () => {
    const abas: [string, LinhaQuantitativo[]][] = [
      ['Ambientes', lev.arquitetura.linhas.filter((l) => l.grupo === 'Ambientes')],
      ['Esquadrias', lev.arquitetura.linhas.filter((l) => l.grupo === 'Esquadrias')],
      ['Paredes', lev.arquitetura.linhas.filter((l) => l.grupo === 'Paredes')],
      ['Acabamentos', lev.arquitetura.linhas.filter((l) => l.grupo === 'Acabamentos')],
      ['Estrutura', lev.estrutura.linhas],
      ['Elétrica', lev.eletrica.linhas],
      ['Hidráulica', lev.hidraulica.linhas],
    ];
    for (const [aba, ls] of abas) {
      const m = matriz(aba);
      expect(m[0], aba).toEqual(['Grupo', 'Descrição', 'Detalhe', 'Unidade', 'Quantidade confirmada', 'Quantidade pendente', 'Valor manual']);
      const corpo = m.slice(1).filter((r) => r[0]);
      expect(corpo.length, aba).toBeGreaterThan(0);
      const conf = corpo.reduce((s, r) => s + Number(r[4] ?? 0), 0);
      const pend = corpo.reduce((s, r) => s + Number(r[5] ?? 0), 0);
      expect(conf, `${aba} confirmado`).toBeCloseTo(soma(ls, () => true, 'confirmado'), 6);
      expect(pend, `${aba} pendente`).toBeCloseTo(soma(ls, () => true, 'pendente'), 6);
    }
  });
  it('aba Materiais: mesmos totais do levantamento + selo de coeficientes', () => {
    const m = matriz('Materiais');
    expect(m[0]).toEqual(['Material', 'Unidade', 'Quantidade confirmada', 'Quantidade pendente', 'Origem']);
    const corpo = m.slice(1).filter((r) => r[0] && r[1]);
    const conf = corpo.reduce((s, r) => s + Number(r[2] ?? 0), 0);
    const pend = corpo.reduce((s, r) => s + Number(r[3] ?? 0), 0);
    const s = (st: Status) => lev.materiais.filter((x) => x.status === st).reduce((a, x) => a + x.quantidade, 0);
    expect(conf).toBeCloseTo(s('confirmado'), 6);
    expect(pend).toBeCloseTo(s('pendente'), 6);
    expect(m.some((r) => r[0] === AVISO_COMPOSICOES)).toBe(true);
  });
  it('células numéricas são números (não texto) e finitas', () => {
    for (const nome of livro.SheetNames) {
      const ws = livro.Sheets[nome]!;
      for (const [end, cel] of Object.entries(ws)) {
        if (end.startsWith('!')) continue;
        const c = cel as XLSX.CellObject;
        if (c.t === 'n') expect(Number.isFinite(c.v as number), `${nome}!${end}`).toBe(true);
        expect(c.t === 'e', `${nome}!${end} é erro`).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------- 10 (parte pura; o reload real está em tests/e2e)

describe('10. Persistência — ida e volta do projeto (JSON); o reload real com IndexedDB está em tests/e2e/02-persistencia.cjs', () => {
  it('exportarJSON → JSON.parse preserva o projeto inteiro', () => {
    const projeto = casoExemplo();
    const env = JSON.parse(exportarJSON(projeto)) as { projeto: Projeto };
    expect(env.projeto).toEqual(JSON.parse(JSON.stringify(projeto)));
  });
  it('JSON exportado pelo app é reimportável (importarJSON) com os mesmos quantitativos', () => {
    const projeto = casoExemplo();
    const r = importarJSON(exportarJSON(projeto), { pagina: 1, escala: ESCALA });
    expect(r.tipo).toBe('projeto');
    if (r.tipo !== 'projeto') return;
    expect(r.projeto).toEqual(JSON.parse(JSON.stringify(projeto)));
    const a = calcularLevantamento(projeto);
    const b = calcularLevantamento(r.projeto);
    expect(todasLinhas(b).map((l) => [l.id, l.status, arredondar(l.quantidade, 6)])).toEqual(
      todasLinhas(a).map((l) => [l.id, l.status, arredondar(l.quantidade, 6)]),
    );
  });
});

// ---------------------------------------------------------------- verificações adicionais

describe('A. Dado faltante: alertas e nenhum valor assumido', () => {
  const semDados = (): Projeto => {
    const p = casoTudoConfirmado();
    return { ...p, parametros: { ...p.parametros, gerais: { peDireito: null, espessuraParede: null, numeroPessoas: null } } };
  };
  const lev = calcularLevantamento(semDados());

  it('alerta de pé-direito em arquitetura, estrutura, elétrica e hidráulica', () => {
    for (const d of DISC) {
      expect(lev[d].alertas.some((a) => a.campo === 'peDireito'), d).toBe(true);
    }
  });
  it('alerta de nº de pessoas (reservatório) e nenhuma capacidade calculada', () => {
    expect(lev.hidraulica.alertas.some((a) => a.campo === 'numeroPessoas')).toBe(true);
    expect(lev.hidraulica.linhas.some((l) => /Reservat/.test(l.descricao))).toBe(false);
  });
  it('sem pé-direito NÃO saem: alvenaria, área de parede, pintura/revestimento, chapisco/emboço/reboco', () => {
    const proibidos = lev.arquitetura.linhas.filter(
      (l) => ['alvenaria', 'pintura-parede', 'revestimento-parede', 'chapisco', 'emboco', 'reboco'].includes(l.servico ?? '') || l.id.endsWith(':area-parede'),
    );
    expect(proibidos.map((l) => l.id)).toEqual([]);
  });
  it('sem pé-direito NÃO saem: concreto/forma/aço de pilares, eletroduto/fio, tubo de água', () => {
    expect(lev.estrutura.linhas.filter((l) => l.grupo === 'Pilares' && l.servico).map((l) => l.id)).toEqual([]);
    expect(lev.eletrica.linhas.filter((l) => l.descricao === 'Eletroduto' || l.descricao.startsWith('Fio')).map((l) => l.id)).toEqual([]);
    expect(lev.hidraulica.linhas.filter((l) => /água/.test(l.descricao) && l.grupo === 'Tubos').map((l) => l.id)).toEqual([]);
  });
  it('parede desenhada sem espessura informada gera alerta de espessura', () => {
    const p = semDados();
    p.elementos = p.elementos.map((e) => (e.tipo === 'parede' ? { ...e, props: { ...e.props, espessura: null } } : e));
    const l = calcularLevantamento(p);
    expect(l.arquitetura.alertas.filter((a) => a.campo === 'espessuraParede').length).toBe(7);
  });
  it('projeto novo nasce com os 3 dados essenciais nulos', () => {
    const p = casoBase();
    expect(p.parametros.gerais).toEqual({ peDireito: 2.8, espessuraParede: 0.15, numeroPessoas: 4 }); // caso
    expect(semDados().parametros.gerais).toEqual({ peDireito: null, espessuraParede: null, numeroPessoas: null });
  });
});

describe('B. Medições bloqueadas em página sem calibração', () => {
  it('ferramentas de medida/desenho bloqueadas; selecionar, mover e calibrar liberadas', () => {
    for (const modo of ['distancia', 'polilinha', 'poligono', 'retangulo', 'contagem', 'parede', 'ponto'] as const) {
      expect(motivoBloqueio(modo, true, null), modo).not.toBeNull();
      expect(motivoBloqueio(modo, true, 0.02), modo).toBeNull();
    }
    for (const modo of ['selecionar', 'pan', 'calibrar'] as const) expect(motivoBloqueio(modo, true, null)).toBeNull();
  });
  it('página sem escala: nenhuma quantidade é emitida e cada disciplina com elementos alerta', () => {
    const p = casoTudoConfirmado();
    const lev = calcularLevantamento({ ...p, paginas: { 1: { escala: null } } });
    expect(todasLinhas(lev).filter((l) => l.unidade !== 'L').map((l) => l.id)).toEqual([]);
    for (const d of DISC) expect(lev[d].alertas.some((a) => a.campo === 'escala'), d).toBe(true);
  });
  it('sem escala, as sugestões automáticas não geram nada', () => {
    const p = { ...casoBase(), paginas: { 1: { escala: null } } };
    for (const d of ['estrutura', 'eletrica', 'hidraulica'] as const) expect(MODULOS[d]!.sugerir!(p, 1), d).toEqual([]);
  });
});

describe('C. Coerência entre módulos (caso de exemplo)', () => {
  const casos: [string, () => Projeto][] = [
    ['parcial', casoExemplo],
    ['tudo pendente', casoTudoPendente],
    ['tudo confirmado', casoTudoConfirmado],
  ];
  for (const [nome, fabrica] of casos) {
    const projeto = fabrica();
    const lev = calcularLevantamento(projeto);
    it(`${nome}: ids de linhas únicos em todo o levantamento`, () => {
      const ids = todasLinhas(lev).map((l) => l.id);
      const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
      expect(dup).toEqual([]);
      const idsM = lev.materiais.map((m) => m.id);
      expect(idsM.filter((id, i) => idsM.indexOf(id) !== i)).toEqual([]);
    });
    it(`${nome}: ids de elementos únicos`, () => {
      const ids = projeto.elementos.map((e) => e.id);
      expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    });
    it(`${nome}: nenhuma quantidade NaN/Infinity/negativa`, () => {
      const ruins = [
        ...todasLinhas(lev).filter((l) => !Number.isFinite(l.quantidade) || l.quantidade < 0).map((l) => l.id),
        ...lev.materiais.filter((m) => !Number.isFinite(m.quantidade) || m.quantidade < 0).map((m) => m.id),
      ];
      expect(ruins).toEqual([]);
    });
    it(`${nome}: toda linha referencia elementos existentes e a disciplina certa`, () => {
      const existentes = new Set(projeto.elementos.map((e) => e.id));
      for (const d of DISC) {
        for (const l of lev[d].linhas) {
          expect(l.disciplina, l.id).toBe(d);
          expect(l.elementoIds.filter((id) => !existentes.has(id)), l.id).toEqual([]);
        }
      }
    });
    it(`${nome}: sem alertas de dado faltante (o caso tem todos os dados)`, () => {
      expect(DISC.flatMap((d) => lev[d].alertas.map((a) => `${d}: ${a.mensagem}`))).toEqual([]);
    });
  }

  it('elementos sugeridos são contabilizados por calcular: 10 pilares, 11+11 vigas, 4 lajes, 10 sapatas', () => {
    const lev = calcularLevantamento(casoTudoConfirmado());
    const n = (desc: string) => soma(lev.estrutura.linhas, (l) => l.descricao === desc);
    expect(n('Pilares (un)')).toBe(10);
    expect(n('Sapatas (un)')).toBe(10);
    expect(lev.estrutura.linhas.filter((l) => l.id.endsWith(':comprimento') && l.grupo === 'Vigas baldrame')).toHaveLength(11);
    expect(lev.estrutura.linhas.filter((l) => l.id.endsWith(':comprimento') && l.grupo === 'Vigas superiores')).toHaveLength(11);
    expect(soma(lev.estrutura.linhas, (l) => l.descricao === 'Lajes — área')).toBeCloseTo(12 + 14 + 10 + 3.07 * 2.98, 6);
  });
  it('elétrica: nº de pontos no levantamento = nº de elementos sugeridos, por tipo', () => {
    const projeto = casoTudoConfirmado();
    const lev = calcularLevantamento(projeto);
    const conta = (t: string) => projeto.elementos.filter((e) => e.tipo === 'ponto-eletrico' && e.props.tipoPonto === t).length;
    const linha = (desc: string) => soma(lev.eletrica.linhas, (l) => l.descricao === desc);
    expect(linha('Ponto de luz')).toBe(conta('luz'));
    expect(linha('Tomada de uso geral (TUG)')).toBe(conta('tug'));
    expect(linha('Interruptor')).toBe(conta('interruptor'));
    const carga = projeto.elementos.reduce((s, e) => s + (e.tipo === 'ponto-eletrico' ? e.props.potenciaVA : 0), 0);
    expect(linha('Carga total instalada')).toBe(carga);
  });
  it('hidráulica: nº de pontos por aparelho = elementos sugeridos; reservatório = 200 L × 4 × 2 = 1.600 L', () => {
    const projeto = casoTudoConfirmado();
    const lev = calcularLevantamento(projeto);
    const pontos = projeto.elementos.filter((e) => e.tipo === 'ponto-hidraulico').length;
    expect(soma(lev.hidraulica.linhas, (l) => l.descricao.startsWith('Ponto hidráulico'))).toBe(pontos);
    expect(lev.hidraulica.linhas.find((l) => l.id === 'hid:reservatorio:capacidade')!.quantidade).toBe(1600);
  });
  it('arquitetura: desconto de vão só acima de 2 m² (J2 2,40 m² desconta; P1 1,68 e J1 1,20 não)', () => {
    const lev = calcularLevantamento(casoBase());
    const l = (id: string) => lev.arquitetura.linhas.find((x) => x.id === id)!.quantidade;
    expect(l('par-esquerda:alvenaria')).toBeCloseTo(7.2 * 2.8 - 2.4, 9);
    expect(l('par-topo:alvenaria')).toBeCloseTo(9 * 2.8, 9);
    expect(l('amb-sala:area-parede')).toBeCloseTo(14 * 2.8 - 2.4, 9);
    expect(l('amb-sala:rodape')).toBeCloseTo(14 - 2 * 0.8, 9);
  });
  it('sugerir é idempotente: sugerir de novo sobre o resultado não duplica elementos', () => {
    let p = casoTudoPendente();
    const n = p.elementos.length;
    for (const d of ['estrutura', 'eletrica', 'hidraulica'] as const) p = comSugestoes(p, d);
    expect(p.elementos.length).toBe(n);
  });
  it('sugerir de novo depois de ACEITAR não recria o que já foi aceito', () => {
    let p = casoTudoConfirmado();
    const n = p.elementos.length;
    for (const d of ['estrutura', 'eletrica', 'hidraulica'] as const) p = comSugestoes(p, d);
    const extras = p.elementos.slice(n).map((e) => `${e.tipo}:${e.id}`);
    expect(extras).toEqual([]);
  });
  it('ambiente não usado (helper)', () => {
    expect(ambiente('x', 'X', 'sala', [0, 0, 1, 1]).geometria.tipo).toBe('poligono');
    expect(u(1)).toBe(50);
  });
});

// ---------------------------------------------------------------- ACHADOS (falhas reais do produto — estes testes FALHAM até a correção)

describe('ACHADOS — falhas encontradas pela QA (cada teste falha enquanto o defeito existir)', () => {
  it('[ACHADO-F1] pt-BR: nenhum texto de linha/material usa ponto decimal (ex.: "1.5 mm²" deveria ser "1,5 mm²")', () => {
    const lev = calcularLevantamento(casoTudoConfirmado());
    const comPonto = [
      ...todasLinhas(lev).map((l) => `${l.descricao} ${l.detalhe ?? ''}`.trim()),
      ...lev.materiais.map((m) => m.material),
    ].filter((t) => /\d\.\d/.test(t));
    expect([...new Set(comPonto)]).toEqual([]);
  });

  it('[ACHADO-F1b] pt-BR: bitola com decimal no aço detalhado (Ø6.3 mm deveria ser Ø6,3 mm)', () => {
    const p = casoTudoConfirmado();
    p.parametros.estrutura.aco = {
      ...p.parametros.estrutura.aco,
      modo: 'detalhado',
      detalhado: { barrasLongitudinais: 4, bitolaLongitudinalMm: 12.5, bitolaEstriboMm: 6.3, espacamentoEstribo: 0.15 },
    };
    const detalhes = [...new Set(calcularLevantamento(p).estrutura.linhas.map((l) => l.detalhe ?? '').filter((d) => /Ø/.test(d)))];
    expect(detalhes.filter((d) => /\d\.\d/.test(d))).toEqual([]);
  });

  it('[ACHADO-E2] elétrica: aceitar só a luz da sala e clicar em "Sugerir" de novo não pode perder as 3 TUGs mínimas da sala', () => {
    let p = confirmar(casoTudoPendente(), (e) => e.id === 'sug-el:amb-sala:luz');
    p = comSugestoes(p, 'eletrica'); // = store.substituirSugestoes('eletrica', sugerir(projeto, 1), 1)
    const tugs = p.elementos.filter((e) => e.tipo === 'ponto-eletrico' && e.vinculos.ambienteId === 'amb-sala' && e.props.tipoPonto === 'tug');
    expect(tugs.length).toBe(3);
  });

  it('[ACHADO-H1] hidráulica: aceitar só o vaso e clicar em "Sugerir" de novo não pode perder lavatório, chuveiro e ralo do banheiro', () => {
    let p = confirmar(casoTudoPendente(), (e) => e.id === 'hid-sug:amb-banheiro:vaso');
    p = comSugestoes(p, 'hidraulica');
    const aparelhos = p.elementos
      .filter((e) => e.tipo === 'ponto-hidraulico' && e.vinculos.ambienteId === 'amb-banheiro')
      .map((e) => (e.tipo === 'ponto-hidraulico' ? e.props.aparelho : ''))
      .sort();
    expect(aparelhos).toEqual(['chuveiro', 'lavatorio', 'ralo', 'vaso']);
  });

  it('[ACHADO-S1] estrutura: sugerir de novo depois de aceitar tudo e reduzir o vão máximo não pode sobrepor vigas (baldrame > 100% das paredes)', () => {
    let p = confirmar(comSugestoes(casoBase(), 'estrutura'), () => true);
    p = { ...p, parametros: { ...p.parametros, estrutura: { ...p.parametros.estrutura, vaoMaximo: 3 } } };
    p = comSugestoes(p, 'estrutura'); // novos pilares intermediários dividem vigas JÁ confirmadas
    const lev = calcularLevantamento(p);
    const baldrame = soma(lev.estrutura.linhas, (l) => l.grupo === 'Vigas baldrame' && l.unidade === 'm'); // confirmado + pendente
    expect(baldrame).toBeCloseTo(COMPRIMENTO_PAREDES, 2);
  });

  // [ACHADO-S2] removido do conjunto que deve passar. Decisão do orquestrador: mantida a regra literal do enunciado ("vão acima de 4,00 m"); limitação conhecida e documentada.

  // [ACHADO-E1] removido do conjunto que deve passar. Decisão do orquestrador: circuitos de confirmados e de pendentes são montados em separado de propósito, para que pendentes nunca alterem quantidades confirmadas.
});
