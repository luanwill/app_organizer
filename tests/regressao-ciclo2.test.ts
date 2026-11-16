/** QA (S10) — ciclo 2: regressões em torno das correções dos achados E2/H1/S1 (sugerir de novo). */
import { describe, expect, it } from 'vitest';
import type { Elemento, Projeto } from '@/core/model';
import { distancia } from '@/core/calc';
import { criarStore, criarPersistenciaMemoria } from '@/core/store';
import { MODULOS } from '@/app/modulos';
import { calcularLevantamento } from '@/app/levantamento';
import { COMPRIMENTO_PAREDES, ESCALA, casoBase, casoTudoPendente, comSugestoes, confirmar, pt } from './caso-exemplo';

const DISC = ['estrutura', 'eletrica', 'hidraulica'] as const;
/** Estrutura renumera os rótulos/ids ao sugerir de novo (P11…): compara por tipo + geometria; demais, por id. */
const assinatura = (p: Projeto) =>
  p.elementos
    .map((e) => {
      if (e.disciplina !== 'estrutura') return `${e.tipo}|${e.id}`;
      const pts = e.geometria.tipo === 'ponto' ? [e.geometria.ponto] : e.geometria.pontos;
      const chave = pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`);
      return `${e.tipo}|${(e.geometria.tipo === 'polilinha' ? [...chave].sort() : chave).join(';')}`;
    })
    .sort();
const semDuplicatas = (p: Projeto) => {
  const ids = p.elementos.map((e) => e.id);
  expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  // dois pontos do mesmo tipo/subtipo no mesmo lugar = duplicata
  const pts = p.elementos.filter((e) => e.geometria.tipo === 'ponto' && e.disciplina !== 'arquitetura');
  const dup: string[] = [];
  pts.forEach((a, i) =>
    pts.slice(i + 1).forEach((b) => {
      const sub = (e: Elemento) => JSON.stringify([e.tipo, (e.props as { tipoPonto?: string; aparelho?: string }).tipoPonto ?? (e.props as { aparelho?: string }).aparelho]);
      if (sub(a) === sub(b) && distancia((a.geometria as { ponto: { x: number; y: number } }).ponto, (b.geometria as { ponto: { x: number; y: number } }).ponto) * ESCALA < 0.05) dup.push(`${a.id} ~ ${b.id}`);
    }),
  );
  expect(dup).toEqual([]);
};

describe('ciclo 2 — sugerir de novo não duplica nem perde nada', () => {
  const base = casoTudoPendente();
  for (const d of DISC) {
    const sugeridos = base.elementos.filter((e) => e.disciplina === d && e.origem === 'sugerido-auto');
    it(`${d}: aceitar UM elemento qualquer e sugerir de novo → mesmo conjunto de elementos (${sugeridos.length} casos)`, () => {
      for (const alvo of sugeridos) {
        const p = comSugestoes(confirmar(base, (e) => e.id === alvo.id), d);
        expect(assinatura(p), `aceitando ${alvo.id}`).toEqual(assinatura(base));
        expect(p.elementos.find((e) => e.id === alvo.id)!.status).toBe('confirmado');
        expect(p.elementos.length).toBe(base.elementos.length);
        semDuplicatas(p);
      }
    });
    it(`${d}: aceitar a metade e sugerir de novo 2× → mesmo conjunto, mesmos totais`, () => {
      let p = confirmar(base, (e) => sugeridos.indexOf(e) % 2 === 0);
      const antes = calcularLevantamento(p);
      p = comSugestoes(comSugestoes(p, d), d);
      expect(assinatura(p)).toEqual(assinatura(base));
      semDuplicatas(p);
      const total = (l: ReturnType<typeof calcularLevantamento>) => {
        const m = new Map<string, number>(); // por descrição + status (os ids da estrutura são renumerados)
        for (const x of l[d].linhas) m.set(`${x.descricao}|${x.detalhe ?? ''}|${x.status}`, (m.get(`${x.descricao}|${x.detalhe ?? ''}|${x.status}`) ?? 0) + x.quantidade);
        return [...m].map(([k, v]) => `${k}|${v.toFixed(4)}`).sort();
      };
      expect(total(calcularLevantamento(p))).toEqual(total(antes));
    });
    it(`${d}: aceitar tudo e sugerir de novo → nada novo`, () => {
      const tudo = confirmar(base, () => true);
      expect(MODULOS[d]!.sugerir!(tudo, 1).map((e) => e.id)).toEqual([]);
    });
    it(`${d}: descartar um elemento aceito... não; descartar UM pendente e sugerir de novo → ele volta`, () => {
      const alvo = sugeridos[0]!;
      const p = comSugestoes({ ...base, elementos: base.elementos.filter((e) => e.id !== alvo.id) }, d);
      expect(assinatura(p)).toEqual(assinatura(base));
    });
  }

  it('elétrica: ponto confirmado posto à mão no ambiente → ambiente pulado por inteiro; os outros continuam', () => {
    const manual: Elemento = { id: 'manual-tug', tipo: 'ponto-eletrico', disciplina: 'eletrica', pagina: 1, geometria: { tipo: 'ponto', ponto: pt(1, 1) }, vinculos: { ambienteId: 'amb-sala' }, origem: 'desenhado', status: 'confirmado', props: { tipoPonto: 'tug', potenciaVA: 100, altura: 'baixa' } };
    const p = comSugestoes({ ...casoBase(), elementos: [...casoBase().elementos, manual] }, 'eletrica');
    const porAmb = (id: string) => p.elementos.filter((e) => e.tipo === 'ponto-eletrico' && e.vinculos.ambienteId === id && e.origem === 'sugerido-auto').length;
    expect(porAmb('amb-sala')).toBe(0);
    expect(porAmb('amb-cozinha')).toBe(6);
  });

  it('estrutura (S1): aceitar tudo, vão máximo 3, sugerir, aceitar tudo de novo → baldrame continua 100% e sem sobreposição; novos pilares ficam sem viga dividida (limitação)', () => {
    let p = confirmar(comSugestoes(casoBase(), 'estrutura'), () => true);
    p = { ...p, parametros: { ...p.parametros, estrutura: { ...p.parametros.estrutura, vaoMaximo: 3 } } };
    p = confirmar(comSugestoes(p, 'estrutura'), () => true);
    const lev = calcularLevantamento(p);
    const m = lev.estrutura.linhas.filter((l) => l.grupo === 'Vigas baldrame' && l.unidade === 'm').reduce((s, l) => s + l.quantidade, 0);
    expect(m).toBeCloseTo(COMPRIMENTO_PAREDES, 2);
    semDuplicatas(p);
  });

  it('estrutura: remover UMA viga baldrame aceita e sugerir de novo → só ela volta', () => {
    const tudo = confirmar(comSugestoes(casoBase(), 'estrutura'), () => true);
    const p = comSugestoes({ ...tudo, elementos: tudo.elementos.filter((e) => e.id !== 'est-1-VB7') }, 'estrutura');
    const novos = p.elementos.filter((e) => e.status === 'pendente');
    expect(novos.map((e) => e.tipo)).toEqual(['viga-baldrame']);
    const m = calcularLevantamento(p).estrutura.linhas.filter((l) => l.grupo === 'Vigas baldrame' && l.unidade === 'm').reduce((s, l) => s + l.quantidade, 0);
    expect(m).toBeCloseTo(COMPRIMENTO_PAREDES, 2);
  });

  it('store real: sugerir → aceitar parte → sugerir de novo → desfazer/refazer restauram cada passo', async () => {
    const store = criarStore(criarPersistenciaMemoria());
    await store.getState().inicializar();
    const s = () => store.getState();
    const b = casoBase();
    s().calibrarPagina(1, ESCALA);
    s().atualizarParametros({ gerais: b.parametros.gerais });
    for (const t of b.esquadrias) s().salvarEsquadria(t);
    s().adicionarElementos(b.elementos);
    for (const d of DISC) s().substituirSugestoes(d, MODULOS[d]!.sugerir!(s().projeto, 1), 1);
    const n1 = s().projeto.elementos.length;
    s().confirmarElementos(['sug-el:amb-sala:luz', 'hid-sug:amb-banheiro:vaso', 'est-1-P1']);
    const aposAceite = assinatura(s().projeto);
    for (const d of DISC) s().substituirSugestoes(d, MODULOS[d]!.sugerir!(s().projeto, 1), 1);
    expect(s().projeto.elementos.length).toBe(n1);
    expect(assinatura(s().projeto)).toEqual(aposAceite);
    expect(s().projeto.elementos.filter((e) => e.status === 'confirmado' && e.origem === 'sugerido-auto').length).toBe(3);
    for (let i = 0; i < 3; i++) s().desfazer(); // desfaz as 3 re-sugestões
    s().desfazer(); // desfaz o aceite
    expect(s().projeto.elementos.filter((e) => e.status === 'confirmado' && e.origem === 'sugerido-auto').length).toBe(0);
    expect(s().projeto.elementos.length).toBe(n1);
    for (let i = 0; i < 4; i++) s().refazer();
    expect(assinatura(s().projeto)).toEqual(aposAceite);
    expect(s().projeto.elementos.filter((e) => e.status === 'confirmado' && e.origem === 'sugerido-auto').length).toBe(3);
  });
});
