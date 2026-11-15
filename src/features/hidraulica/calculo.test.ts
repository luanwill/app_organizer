import { describe, expect, it } from 'vitest';
import type { Elemento, LinhaQuantitativo, Projeto, ResultadoDisciplina, Status } from '@/core/model';
import { calcularHidraulica } from './calculo';
import { sugerirHidraulica } from './sugestao';
import { ambiente, caixaInspecao, ponto, projetoBase, reservatorio, tubo } from './testes.util';

/**
 * Banheiro 2 × 3 m (coluna no centroide 100,150), pé-direito 2,70 m.
 * Reservatório alinhado com a coluna (tronco AF reto de 3 m); caixa de inspeção alinhada (tronco de esgoto reto de 5 m).
 * Ramais coluna ↔ ponto: 0,70 + 1,20 = 1,90 m cada (1 joelho); ralo sobre a coluna (0 m).
 */
const banheiro = ambiente('ban', 'banheiro', [0, 0, 200, 300]);
const pontosBanheiro = (status: Status = 'confirmado'): Elemento[] => [
  ponto('vaso', 'vaso', { x: 30, y: 30 }, 'ban', status),
  ponto('lav', 'lavatorio', { x: 170, y: 30 }, 'ban', status),
  ponto('chu', 'chuveiro', { x: 170, y: 270 }, 'ban', status),
  ponto('ralo', 'ralo', { x: 100, y: 150 }, 'ban', status),
];
const res = reservatorio({ x: 400, y: 150 });
const ci = caixaInspecao({ x: 100, y: 650 });
const completo = (ajustar?: (p: Projeto) => void) => projetoBase([banheiro, ...pontosBanheiro(), res, ci], ajustar);

function achar(r: ResultadoDisciplina, descricao: string, detalhe?: string, status: Status = 'confirmado'): LinhaQuantitativo | undefined {
  return r.linhas.find((l) => l.descricao === descricao && l.detalhe === detalhe && l.status === status);
}
const qtd = (r: ResultadoDisciplina, descricao: string, detalhe?: string, status: Status = 'confirmado') =>
  achar(r, descricao, detalhe, status)?.quantidade;
const campos = (r: ResultadoDisciplina) => r.alertas.map((a) => a.campo);

describe('tubulação', () => {
  const r = calcularHidraulica(completo());

  it('separa por sistema e diâmetro, com horizontal + verticais', () => {
    // AF: tronco 3 + ramais 3×1,90 + descidas (2,7−0,2)+(2,7−0,6)+(2,7−2,1)
    expect(qtd(r, 'Tubo de água fria', 'Ø25 mm')).toBeCloseTo(3 + 5.7 + 5.2, 6);
    // esgoto Ø100: ramal do vaso 1,90 + tronco 5 (maior diâmetro do ambiente)
    expect(qtd(r, 'Tubo de esgoto', 'Ø100 mm')).toBeCloseTo(6.9, 6);
    // esgoto Ø40: ramal do lavatório 1,90 + subida 0,60; ralo sobre a coluna
    expect(qtd(r, 'Tubo de esgoto', 'Ø40 mm')).toBeCloseTo(2.5, 6);
    expect(achar(r, 'Tubo de água quente', 'Ø22 mm')).toBeUndefined();
    const tubos = r.linhas.filter((l) => l.grupo === 'Tubos');
    expect(tubos.every((l) => l.ehMaterial === true && l.disciplina === 'hidraulica')).toBe(true);
    expect(achar(r, 'Tubo de água fria', 'Ø25 mm')?.unidade).toBe('m');
  });

  it('barras de 6 m = ceil(m / 6)', () => {
    expect(qtd(r, 'Barra de 6 m — tubo de água fria', 'Ø25 mm')).toBe(3);
    expect(qtd(r, 'Barra de 6 m — tubo de esgoto', 'Ø100 mm')).toBe(2);
    expect(qtd(r, 'Barra de 6 m — tubo de esgoto', 'Ø40 mm')).toBe(1);
    expect(achar(r, 'Barra de 6 m — tubo de esgoto', 'Ø40 mm')?.unidade).toBe('un');
  });

  it('alterar o pé-direito altera só os tubos verticais de AF', () => {
    const alto = calcularHidraulica(completo((p) => (p.parametros.gerais.peDireito = 3)));
    expect(qtd(alto, 'Tubo de água fria', 'Ø25 mm')).toBeCloseTo(13.9 + 3 * 0.3, 6);
    expect(qtd(alto, 'Tubo de esgoto', 'Ø100 mm')).toBeCloseTo(6.9, 6);
    // pé-direito próprio do ambiente prevalece
    const proprio = calcularHidraulica(
      projetoBase([ambiente('ban', 'banheiro', [0, 0, 200, 300], { peDireito: 3 }), ...pontosBanheiro(), res, ci]),
    );
    expect(qtd(proprio, 'Tubo de água fria', 'Ø25 mm')).toBeCloseTo(14.8, 6);
  });

  it('pé-direito null → alerta e sem AF/AQ; o esgoto continua', () => {
    const semPe = calcularHidraulica(completo((p) => (p.parametros.gerais.peDireito = null)));
    expect(campos(semPe)).toContain('peDireito');
    expect(semPe.linhas.some((l) => l.descricao === 'Tubo de água fria')).toBe(false);
    expect(semPe.linhas.some((l) => l.descricao.includes('Joelho') && l.descricao.includes('água fria'))).toBe(false);
    expect(qtd(semPe, 'Tubo de esgoto', 'Ø100 mm')).toBeCloseTo(6.9, 6);
  });

  it('água quente segue o traçado da AF com o diâmetro de AQ', () => {
    const comAQ = calcularHidraulica(
      projetoBase([banheiro, ponto('chu', 'chuveiro', { x: 170, y: 270 }, 'ban', 'confirmado', { aguaQuente: true }), res, ci]),
    );
    expect(qtd(comAQ, 'Tubo de água quente', 'Ø22 mm')).toBeCloseTo(3 + 1.9 + 0.6, 6);
    expect(qtd(comAQ, 'Tubo de água fria', 'Ø25 mm')).toBeCloseTo(3 + 1.9 + 0.6, 6);
  });

  it('diâmetro próprio do ponto separa a linha; o tronco usa o maior diâmetro', () => {
    const r2 = calcularHidraulica(
      projetoBase([
        banheiro,
        ponto('lav', 'lavatorio', { x: 170, y: 30 }, 'ban', 'confirmado', { diametroAF: 20 }),
        ponto('chu', 'chuveiro', { x: 170, y: 270 }, 'ban'),
        res,
      ]),
    );
    expect(qtd(r2, 'Tubo de água fria', 'Ø20 mm')).toBeCloseTo(1.9 + 2.1, 6);
    expect(qtd(r2, 'Tubo de água fria', 'Ø25 mm')).toBeCloseTo(3 + 1.9 + 0.6, 6);
  });

  it('ponto fora de ambiente liga direto ao reservatório e à caixa', () => {
    const solto = calcularHidraulica(projetoBase([ponto('t', 'tanque', { x: 400, y: 650 }), res, ci]));
    expect(qtd(solto, 'Tubo de água fria', 'Ø25 mm')).toBeCloseTo(5 + (2.7 - 0.9), 6);
    expect(qtd(solto, 'Tubo de esgoto', 'Ø50 mm')).toBeCloseTo(3 + 0.9, 6);
    expect(solto.linhas.some((l) => l.descricao.startsWith('Tê'))).toBe(false);
  });

  it('rotas automáticas saem em derivados com o status e o id do ponto', () => {
    const ids = r.derivados?.map((d) => d.id) ?? [];
    expect(ids).toContain('hid:agua:tronco:ban');
    expect(ids).toContain('hid:agua:ramal:vaso');
    expect(ids).toContain('hid:esgoto:tronco:ban');
    expect(ids).toContain('hid:esgoto:ramal:lav');
    const ramal = r.derivados?.find((d) => d.id === 'hid:agua:ramal:vaso');
    expect(ramal).toMatchObject({ disciplina: 'hidraulica', pagina: 1, status: 'confirmado', elementoId: 'vaso' });
    expect(ramal?.pontos).toEqual([{ x: 100, y: 150 }, { x: 30, y: 150 }, { x: 30, y: 30 }]);
    expect(r.derivados?.find((d) => d.id === 'hid:agua:tronco:ban')?.rotulo).toBe('AF Ø25 mm');
  });
});

describe('conexões e registros', () => {
  const r = calcularHidraulica(completo());

  it('joelhos = mudanças de direção + 1 por transição horizontal → vertical', () => {
    expect(qtd(r, 'Joelho 90° — água fria', 'Ø25 mm')).toBe(3 + 3);
    expect(qtd(r, 'Joelho 90° — esgoto', 'Ø100 mm')).toBe(1);
    expect(qtd(r, 'Joelho 90° — esgoto', 'Ø40 mm')).toBe(1 + 1);
  });

  it('tês = ramais − 1 por ambiente e sistema', () => {
    expect(qtd(r, 'Tê — água fria', 'Ø25 mm')).toBe(2);
    expect(qtd(r, 'Tê — esgoto', 'Ø100 mm')).toBe(2);
  });

  it('conexões diversas = % sobre joelhos + tês, por sistema, arredondado para cima', () => {
    expect(qtd(r, 'Conexões diversas — água fria')).toBe(1); // 10% de 8
    expect(qtd(r, 'Conexões diversas — esgoto')).toBe(1); // 10% de 5
    const mais = calcularHidraulica(completo((p) => (p.parametros.hidraulica.percentualConexoesDiversas = 30)));
    expect(qtd(mais, 'Conexões diversas — água fria')).toBe(3); // 2,4 → 3
    expect(qtd(mais, 'Conexões diversas — esgoto')).toBe(2); // 1,5 → 2
    const zero = calcularHidraulica(completo((p) => (p.parametros.hidraulica.percentualConexoesDiversas = 0)));
    expect(achar(zero, 'Conexões diversas — água fria')).toBeUndefined();
  });

  it('registros, caixas, ralos, louças e metais', () => {
    expect(qtd(r, 'Registro de gaveta', 'Ø25 mm')).toBe(1);
    expect(qtd(r, 'Registro de pressão', 'Ø25 mm')).toBe(1);
    expect(qtd(r, 'Caixa sifonada')).toBe(1);
    expect(qtd(r, 'Ralo')).toBe(1);
    expect(qtd(r, 'Caixa de inspeção')).toBe(1);
    expect(qtd(r, 'Vaso sanitário com caixa acoplada')).toBe(1);
    expect(qtd(r, 'Lavatório')).toBe(1);
    expect(qtd(r, 'Torneira de lavatório')).toBe(1);
    expect(qtd(r, 'Chuveiro')).toBe(1);
    expect(qtd(r, 'Ponto de água fria')).toBe(3);
    expect(qtd(r, 'Ponto de esgoto')).toBe(3);
    expect(achar(r, 'Ponto hidráulico — vaso sanitário')?.elementoIds).toEqual(['vaso']);
  });
});

describe('reservatório', () => {
  it('litros = per capita × pessoas × dias; confirmado com o elemento confirmado', () => {
    const r = calcularHidraulica(completo());
    const linha = r.linhas.find((l) => l.grupo === 'Reservatório');
    expect(linha).toMatchObject({ quantidade: 200 * 4 * 2, unidade: 'L', status: 'confirmado', elementoIds: ['res'] });
    const outro = calcularHidraulica(
      completo((p) => {
        p.parametros.gerais.numeroPessoas = 5;
        p.parametros.hidraulica.consumoPerCapitaL = 150;
        p.parametros.hidraulica.diasReserva = 3;
      }),
    );
    expect(outro.linhas.find((l) => l.grupo === 'Reservatório')?.quantidade).toBe(2250);
    const semElemento = calcularHidraulica(projetoBase([banheiro, ...pontosBanheiro()]));
    expect(semElemento.linhas.find((l) => l.grupo === 'Reservatório')?.status).toBe('pendente');
  });

  it('nº de pessoas null → alerta e sem a linha', () => {
    const r = calcularHidraulica(completo((p) => (p.parametros.gerais.numeroPessoas = null)));
    expect(campos(r)).toContain('numeroPessoas');
    expect(r.linhas.some((l) => l.grupo === 'Reservatório')).toBe(false);
  });
});

describe('dados faltantes', () => {
  it('sem reservatório → alerta e sem tubos de AF; o resto continua', () => {
    const r = calcularHidraulica(projetoBase([banheiro, ...pontosBanheiro(), ci]));
    expect(r.alertas.find((a) => a.campo === 'reservatorio')?.mensagem).toBe('Posicione o reservatório ou a entrada de água');
    expect(r.linhas.some((l) => l.descricao.includes('água fria') && l.grupo !== 'Pontos')).toBe(false);
    expect(qtd(r, 'Tubo de esgoto', 'Ø100 mm')).toBeCloseTo(6.9, 6);
    expect(qtd(r, 'Lavatório')).toBe(1);
    expect(qtd(r, 'Registro de gaveta', 'Ø25 mm')).toBe(1);
  });

  it('sem caixa de inspeção → alerta e sem tubos de esgoto', () => {
    const r = calcularHidraulica(projetoBase([banheiro, ...pontosBanheiro(), res]));
    expect(campos(r)).toContain('caixa-inspecao');
    expect(campos(r)).not.toContain('reservatorio');
    expect(r.linhas.some((l) => l.descricao.includes('esgoto') && l.grupo !== 'Pontos')).toBe(false);
    expect(qtd(r, 'Tubo de água fria', 'Ø25 mm')).toBeCloseTo(13.9, 6);
  });

  it('página sem escala → alerta de escala e nenhuma linha de elementos', () => {
    const r = calcularHidraulica(completo((p) => (p.paginas = { 1: { escala: null } })));
    expect(campos(r)).toContain('escala');
    expect(r.linhas.filter((l) => l.grupo !== 'Reservatório')).toEqual([]);
    expect(r.derivados).toEqual([]);
  });

  it('projeto sem pontos não pede reservatório nem caixa', () => {
    const r = calcularHidraulica(projetoBase([banheiro]));
    expect(campos(r)).toEqual([]);
  });
});

describe('pendentes × confirmados', () => {
  it('sugestões pendentes não entram nas linhas confirmadas', () => {
    const base = completo();
    const cozinha = ambiente('coz', 'cozinha', [300, 300, 600, 600]);
    const comCozinha = projetoBase([...base.elementos, cozinha]);
    const sugestoes = sugerirHidraulica(comCozinha, 1);
    expect(sugestoes).toHaveLength(2); // banheiro já confirmado não recebe sugestão
    const antes = calcularHidraulica(base);
    const depois = calcularHidraulica(projetoBase([...comCozinha.elementos, ...sugestoes]));
    const confirmadas = (r: ResultadoDisciplina) => r.linhas.filter((l) => l.status === 'confirmado');
    expect(confirmadas(depois)).toEqual(confirmadas(antes));
    expect(depois.linhas.filter((l) => l.status === 'pendente').length).toBeGreaterThan(0);
    expect(qtd(depois, 'Pia de cozinha (cuba)', undefined, 'pendente')).toBe(1);
    expect(qtd(depois, 'Tubo de esgoto', 'Ø50 mm', 'pendente')).toBeGreaterThan(0);
    expect(depois.derivados?.find((d) => d.id === 'hid:agua:tronco:coz')?.status).toBe('pendente');
    expect(depois.derivados?.find((d) => d.id === 'hid:agua:tronco:ban')?.status).toBe('confirmado');
  });

  it('ponto pendente no mesmo ambiente só soma ramal, descida e tê pendentes', () => {
    const extra = ponto('lav2', 'lavatorio', { x: 30, y: 270 }, 'ban', 'pendente');
    const r = calcularHidraulica(projetoBase([...completo().elementos, extra]));
    expect(qtd(r, 'Tubo de água fria', 'Ø25 mm')).toBeCloseTo(13.9, 6);
    expect(qtd(r, 'Tubo de água fria', 'Ø25 mm', 'pendente')).toBeCloseTo(1.9 + 2.1, 6);
    expect(qtd(r, 'Tê — água fria', 'Ø25 mm')).toBe(2);
    expect(qtd(r, 'Tê — água fria', 'Ø25 mm', 'pendente')).toBe(1);
    expect(achar(r, 'Tubo de água fria', 'Ø25 mm', 'pendente')?.elementoIds).toEqual(['lav2']);
    expect(qtd(r, 'Registro de gaveta', 'Ø25 mm')).toBe(1);
    expect(achar(r, 'Registro de gaveta', 'Ø25 mm', 'pendente')).toBeUndefined();
    expect(r.derivados?.find((d) => d.id === 'hid:agua:ramal:lav2')?.status).toBe('pendente');
  });

  it('tudo pendente → nenhuma linha confirmada de elementos', () => {
    const r = calcularHidraulica(projetoBase([banheiro, ...pontosBanheiro('pendente'), res, ci]));
    expect(r.linhas.filter((l) => l.status === 'confirmado').map((l) => l.descricao)).toEqual([
      'Caixa de inspeção',
      "Reservatório (caixa d'água) — capacidade",
    ]);
    expect(qtd(r, 'Tubo de água fria', 'Ø25 mm', 'pendente')).toBeCloseTo(13.9, 6);
    expect(r.derivados?.every((d) => d.status === 'pendente')).toBe(true);
  });

  it('ids de linha estáveis e únicos', () => {
    const r = calcularHidraulica(projetoBase([...completo().elementos, ponto('lav2', 'lavatorio', { x: 30, y: 270 }, 'ban', 'pendente')]));
    const ids = r.linhas.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(calcularHidraulica(completo()).linhas.map((l) => l.id)).toEqual(calcularHidraulica(completo()).linhas.map((l) => l.id));
  });
});

describe('tubos desenhados', () => {
  it('ramal redesenhado (extremidade sobre o ponto) substitui o automático', () => {
    // 2,00 + 1,00 = 3,00 m no lugar do ramal automático de 1,90 m do vaso; termina a 0,10 m do ponto
    const novo = tubo('t1', 'AF', [{ x: 130, y: 230 }, { x: 30, y: 230 }, { x: 30, y: 40 }]);
    const r = calcularHidraulica(projetoBase([...completo().elementos, novo]));
    expect(qtd(r, 'Tubo de água fria', 'Ø25 mm')).toBeCloseTo(13.9 - 1.9 + 2.9, 6);
    expect(qtd(r, 'Joelho 90° — água fria', 'Ø25 mm')).toBe(6);
    expect(qtd(r, 'Tê — água fria', 'Ø25 mm')).toBe(2);
    expect(r.derivados?.some((d) => d.id === 'hid:agua:ramal:vaso')).toBe(false);
    expect(r.derivados?.some((d) => d.id === 'hid:esgoto:ramal:vaso')).toBe(true); // só o sistema do tubo
    expect(qtd(r, 'Tubo de esgoto', 'Ø100 mm')).toBeCloseTo(6.9, 6);
  });

  it('vinculos.alvoId também liga o tubo ao ponto', () => {
    const novo = { ...tubo('t1', 'esgoto', [{ x: 300, y: 300 }, { x: 400, y: 300 }]), vinculos: { alvoId: 'vaso' } };
    const r = calcularHidraulica(projetoBase([...completo().elementos, novo]));
    expect(qtd(r, 'Tubo de esgoto', 'Ø100 mm')).toBeCloseTo(5 + 1, 6);
  });

  it('pluvial: soma os tubos desenhados só com o parâmetro ligado; sem diâmetro → alerta', () => {
    const calha = tubo('pl', 'pluvial', [{ x: 0, y: 0 }, { x: 700, y: 0 }], 100);
    const desligado = calcularHidraulica(projetoBase([calha]));
    expect(desligado.linhas.some((l) => l.descricao === 'Tubo de águas pluviais')).toBe(false);
    const ligado = calcularHidraulica(projetoBase([calha], (p) => (p.parametros.hidraulica.pluvial = true)));
    expect(qtd(ligado, 'Tubo de águas pluviais', 'Ø100 mm')).toBeCloseTo(7, 6);
    expect(qtd(ligado, 'Barra de 6 m — tubo de águas pluviais', 'Ø100 mm')).toBe(2);
    const semDiametro = calcularHidraulica(
      projetoBase([tubo('pl', 'pluvial', [{ x: 0, y: 0 }, { x: 700, y: 0 }])], (p) => (p.parametros.hidraulica.pluvial = true)),
    );
    expect(semDiametro.alertas).toContainEqual(expect.objectContaining({ campo: 'diametroMm', elementoId: 'pl' }));
    expect(semDiametro.linhas.some((l) => l.descricao === 'Tubo de águas pluviais')).toBe(false);
  });
});
