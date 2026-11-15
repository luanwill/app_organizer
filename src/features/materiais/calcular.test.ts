import { describe, expect, it } from 'vitest';
import type { CodigoServico, Composicao, LinhaMaterial, LinhaQuantitativo, Status } from '@/core/model';
import { SERVICOS } from '@/core/model';
import { calcularMateriais } from './calcular';
import { COMPOSICOES_PADRAO, MARCADOR_DETALHE } from './config';

let seq = 0;
function servico(codigo: CodigoServico, quantidade: number, extra: Partial<LinhaQuantitativo> = {}): LinhaQuantitativo {
  return {
    id: `l${++seq}`,
    disciplina: 'arquitetura',
    grupo: 'Acabamentos',
    descricao: `Sala — ${codigo}`,
    unidade: SERVICOS[codigo].unidade,
    quantidade,
    status: 'confirmado',
    elementoIds: [],
    servico: codigo,
    ...extra,
  };
}

function direto(descricao: string, unidade: string, quantidade: number, extra: Partial<LinhaQuantitativo> = {}): LinhaQuantitativo {
  return {
    id: `l${++seq}`,
    disciplina: 'hidraulica',
    grupo: 'Tubos',
    descricao,
    unidade,
    quantidade,
    status: 'confirmado',
    elementoIds: [],
    ehMaterial: true,
    ...extra,
  };
}

const achar = (materiais: LinhaMaterial[], material: string, status: Status = 'confirmado') =>
  materiais.find((m) => m.material === material && m.status === status);
const qtd = (materiais: LinhaMaterial[], material: string, status: Status = 'confirmado') => achar(materiais, material, status)?.quantidade;

describe('calcularMateriais — composições padrão', () => {
  it('alvenaria 10 m² → 175 blocos e 0,12 m³ de argamassa', () => {
    const m = calcularMateriais([servico('alvenaria', 10)], COMPOSICOES_PADRAO);
    expect(qtd(m, 'Bloco cerâmico 14×19×29')).toBeCloseTo(175, 9);
    expect(achar(m, 'Bloco cerâmico 14×19×29')?.unidade).toBe('un');
    expect(qtd(m, 'Argamassa de assentamento')).toBeCloseTo(0.12, 9);
    expect(achar(m, 'Argamassa de assentamento')?.origem).toBe(SERVICOS.alvenaria.descricao);
  });

  it('piso 10 m² → 11 m² de piso (10% de perda), 50 kg de argamassa colante e 5 kg de rejunte', () => {
    const m = calcularMateriais([servico('piso', 10)], COMPOSICOES_PADRAO);
    expect(qtd(m, 'Piso cerâmico')).toBeCloseTo(11, 9);
    expect(qtd(m, 'Argamassa colante')).toBeCloseTo(50, 9);
    expect(qtd(m, 'Rejunte')).toBeCloseTo(5, 9);
  });

  it('pintura 100 m² (2 demãos) → 34 L de tinta; sem detalhe usa a genérica (mesma base)', () => {
    const comDetalhe = calcularMateriais([servico('pintura-parede', 100, { detalhe: '2 demãos' })], COMPOSICOES_PADRAO);
    expect(qtd(comDetalhe, 'Tinta acrílica')).toBeCloseTo(34, 9);
    expect(achar(comDetalhe, 'Massa corrida')?.unidade).toBe('kg');
    expect(achar(comDetalhe, 'Selador')?.unidade).toBe('L');
    const generica = calcularMateriais([servico('pintura-teto', 100)], COMPOSICOES_PADRAO);
    expect(qtd(generica, 'Tinta acrílica')).toBeCloseTo(34, 9);
  });

  it('chapisco, emboço, reboco, contrapiso, rodapé e impermeabilização', () => {
    const m = calcularMateriais(
      [servico('chapisco', 100), servico('emboco', 100), servico('reboco', 100), servico('contrapiso', 10), servico('rodape', 10), servico('impermeabilizacao', 10)],
      COMPOSICOES_PADRAO,
    );
    expect(qtd(m, 'Argamassa de chapisco')).toBeCloseTo(0.5, 9);
    expect(qtd(m, 'Argamassa de emboço')).toBeCloseTo(2, 9);
    expect(qtd(m, 'Argamassa de reboco')).toBeCloseTo(0.5, 9);
    expect(qtd(m, 'Argamassa de contrapiso')).toBeCloseTo(0.4, 9);
    expect(qtd(m, 'Rodapé')).toBeCloseTo(11, 9);
    expect(achar(m, 'Impermeabilizante')?.unidade).toBe('kg');
  });

  it('concreto usa a composição do fck da linha; fck fora da lista cai na genérica', () => {
    const cimentoDe = (detalhe?: string) => {
      const composicao = COMPOSICOES_PADRAO.find((c) => c.servico === 'concreto' && c.detalhe === detalhe);
      const insumo = composicao?.insumos.find((i) => i.material === 'Cimento');
      if (!insumo) throw new Error(`sem composição de concreto para ${detalhe}`);
      return insumo.coeficiente * (1 + insumo.perdaPct / 100);
    };
    expect(cimentoDe('fck 20')).toBeLessThan(cimentoDe('fck 25'));
    expect(cimentoDe('fck 25')).toBeLessThan(cimentoDe('fck 30'));
    for (const fck of ['fck 20', 'fck 25', 'fck 30']) {
      const m = calcularMateriais([servico('concreto', 2, { detalhe: fck })], COMPOSICOES_PADRAO);
      expect(qtd(m, 'Cimento')).toBeCloseTo(2 * cimentoDe(fck), 9);
      expect(achar(m, 'Areia')?.unidade).toBe('m³');
      expect(achar(m, 'Brita')?.unidade).toBe('m³');
    }
    const outro = calcularMateriais([servico('concreto', 2, { detalhe: 'fck 40' })], COMPOSICOES_PADRAO);
    expect(qtd(outro, 'Cimento')).toBeCloseTo(2 * cimentoDe(undefined), 9);
  });

  it('lastro usa traço magro (menos cimento que o concreto estrutural)', () => {
    const lastro = calcularMateriais([servico('lastro', 1)], COMPOSICOES_PADRAO);
    const concreto = calcularMateriais([servico('concreto', 1, { detalhe: 'fck 20' })], COMPOSICOES_PADRAO);
    expect(qtd(lastro, 'Cimento')).toBeLessThan(qtd(concreto, 'Cimento') ?? 0);
  });

  it('aço sai separado por bitola/categoria, 1 kg/kg com 10% de perda', () => {
    const m = calcularMateriais(
      [
        servico('aco', 100, { detalhe: 'Ø10 mm' }),
        servico('aco', 50, { detalhe: 'Ø10 mm' }),
        servico('aco', 20, { detalhe: 'Ø5 mm' }),
        servico('aco', 200, { detalhe: 'CA-50' }),
      ],
      COMPOSICOES_PADRAO,
    );
    expect(qtd(m, 'Aço Ø10 mm')).toBeCloseTo(165, 9);
    expect(qtd(m, 'Aço Ø5 mm')).toBeCloseTo(22, 9);
    expect(qtd(m, 'Aço CA-50')).toBeCloseTo(220, 9);
    expect(m).toHaveLength(3);
  });

  it('forma → madeira em m² com perda; escavação (sem composição) não gera material', () => {
    const m = calcularMateriais([servico('forma', 10), servico('escavacao', 5)], COMPOSICOES_PADRAO);
    expect(m).toHaveLength(1);
    expect(m[0]?.unidade).toBe('m²');
    expect(m[0]?.quantidade).toBeGreaterThan(10);
  });

  it('todo serviço com composição padrão tem uma composição genérica (sem detalhe)', () => {
    const servicos = new Set(COMPOSICOES_PADRAO.map((c) => c.servico));
    for (const s of servicos) expect(COMPOSICOES_PADRAO.some((c) => c.servico === s && !c.detalhe)).toBe(true);
    expect(new Set(COMPOSICOES_PADRAO.map((c) => c.id)).size).toBe(COMPOSICOES_PADRAO.length);
  });
});

describe('calcularMateriais — consolidação', () => {
  it('pendentes não entram nos materiais confirmados', () => {
    const m = calcularMateriais([servico('piso', 10), servico('piso', 4, { status: 'pendente' })], COMPOSICOES_PADRAO);
    expect(qtd(m, 'Piso cerâmico', 'confirmado')).toBeCloseTo(11, 9);
    expect(qtd(m, 'Piso cerâmico', 'pendente')).toBeCloseTo(4.4, 9);
    expect(qtd(m, 'Argamassa colante', 'confirmado')).toBeCloseTo(50, 9);
    expect(qtd(m, 'Argamassa colante', 'pendente')).toBeCloseTo(20, 9);
  });

  it('materiais diretos com detalhes diferentes não se misturam', () => {
    const m = calcularMateriais(
      [
        direto('Tubo de água fria', 'm', 12, { detalhe: 'Ø25 mm' }),
        direto('Tubo de água fria', 'm', 3, { detalhe: 'Ø25 mm' }),
        direto('Tubo de água fria', 'm', 7, { detalhe: 'Ø32 mm' }),
        direto('Fio / cabo de cobre', 'm', 40, { detalhe: '2.5 mm²', disciplina: 'eletrica' }),
        direto('Fio / cabo de cobre', 'm', 15, { detalhe: '1.5 mm²', disciplina: 'eletrica' }),
        direto('Luminária', 'un', 3, { disciplina: 'eletrica' }),
        direto('Luminária', 'un', 2, { disciplina: 'eletrica', status: 'pendente' }),
      ],
      COMPOSICOES_PADRAO,
    );
    expect(qtd(m, 'Tubo de água fria Ø25 mm')).toBe(15);
    expect(qtd(m, 'Tubo de água fria Ø32 mm')).toBe(7);
    expect(qtd(m, 'Fio / cabo de cobre 2.5 mm²')).toBe(40);
    expect(qtd(m, 'Fio / cabo de cobre 1.5 mm²')).toBe(15);
    expect(qtd(m, 'Luminária')).toBe(3);
    expect(qtd(m, 'Luminária', 'pendente')).toBe(2);
    expect(achar(m, 'Tubo de água fria Ø25 mm')?.origem).toBe('Hidráulica');
    expect(achar(m, 'Luminária')?.origem).toBe('Elétrica');
  });

  it('mesmo material vindo de vários serviços: soma e junta as origens', () => {
    const m = calcularMateriais([servico('piso', 10), servico('revestimento-parede', 20)], COMPOSICOES_PADRAO);
    const colante = achar(m, 'Argamassa colante');
    expect(colante?.quantidade).toBeCloseTo(150, 9);
    expect(colante?.origem).toContain(SERVICOS.piso.descricao);
    expect(colante?.origem).toContain(SERVICOS['revestimento-parede'].descricao);
  });

  it('linha que é serviço E material entra como material direto (sem composição)', () => {
    const m = calcularMateriais([servico('piso', 10, { ehMaterial: true, descricao: 'Piso pronto', detalhe: '60×60' })], COMPOSICOES_PADRAO);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ material: 'Piso pronto 60×60', quantidade: 10, unidade: 'm²', origem: 'Arquitetura' });
  });

  it('ids estáveis e únicos; não altera as entradas', () => {
    const linhas = [servico('piso', 10), servico('piso', 4, { status: 'pendente' }), direto('Tubo', 'm', 2, { detalhe: 'Ø25 mm' })];
    const copia = structuredClone(linhas);
    const a = calcularMateriais(linhas, COMPOSICOES_PADRAO);
    const b = calcularMateriais(linhas, COMPOSICOES_PADRAO);
    expect(a).toEqual(b);
    expect(new Set(a.map((x) => x.id)).size).toBe(a.length);
    expect(linhas).toEqual(copia);
  });
});

describe('calcularMateriais — composições editadas', () => {
  it('coeficiente e perda editados mudam o resultado', () => {
    const editadas: Composicao[] = COMPOSICOES_PADRAO.map((c) =>
      c.servico === 'alvenaria'
        ? { ...c, insumos: c.insumos.map((i) => (i.unidade === 'un' ? { ...i, coeficiente: 13, perdaPct: 5 } : i)) }
        : c,
    );
    const m = calcularMateriais([servico('alvenaria', 10)], editadas);
    expect(qtd(m, 'Bloco cerâmico 14×19×29')).toBeCloseTo(136.5, 9);
    expect(qtd(calcularMateriais([servico('alvenaria', 10)], COMPOSICOES_PADRAO), 'Bloco cerâmico 14×19×29')).toBeCloseTo(175, 9);
  });

  it('composição com detalhe tem precedência sobre a genérica, em qualquer ordem', () => {
    const generica: Composicao = { id: 'g', servico: 'concreto', insumos: [{ material: 'Cimento', unidade: 'kg', coeficiente: 300, perdaPct: 0 }] };
    const fck35: Composicao = { id: 'e', servico: 'concreto', detalhe: 'fck 35', insumos: [{ material: 'Cimento', unidade: 'kg', coeficiente: 450, perdaPct: 0 }] };
    const linhas = [servico('concreto', 1, { detalhe: 'fck 35' }), servico('concreto', 1, { detalhe: 'fck 25' })];
    for (const composicoes of [[generica, fck35], [fck35, generica]]) {
      expect(qtd(calcularMateriais(linhas, composicoes), 'Cimento')).toBeCloseTo(750, 9);
    }
    expect(calcularMateriais(linhas, [fck35])).toHaveLength(1); // sem genérica, fck 25 não gera material
    expect(calcularMateriais(linhas, [])).toEqual([]);
  });

  it('marcador de detalhe no nome do material', () => {
    const c: Composicao = { id: 'a', servico: 'aco', insumos: [{ material: `Aço ${MARCADOR_DETALHE}`, unidade: 'kg', coeficiente: 1, perdaPct: 0 }] };
    const m = calcularMateriais([servico('aco', 10, { detalhe: 'Ø8 mm' }), servico('aco', 5)], [c]);
    expect(qtd(m, 'Aço Ø8 mm')).toBe(10);
    expect(qtd(m, 'Aço')).toBe(5);
  });
});
