import { describe, expect, it } from 'vitest';
import type { ElementoDe } from '@/core/model';
import { distanciaPontoPoligono, pontoEmPoligono } from '@/core/calc';
import { RECUO_PONTO_M } from './config';
import { sugerirHidraulica } from './sugestao';
import { ESCALA, ambiente, ponto, projetoBase } from './testes.util';

type PontoH = ElementoDe<'ponto-hidraulico'>;

const banheiro = ambiente('ban', 'banheiro', [0, 0, 200, 300]);
const cozinha = ambiente('coz', 'cozinha', [300, 0, 600, 300]);
const servico = ambiente('as', 'area-servico', [300, 400, 500, 600]);
const sala = ambiente('sala', 'sala', [700, 0, 1100, 400]);

function sugeridos(projeto = projetoBase([banheiro, cozinha, servico, sala])): PontoH[] {
  return sugerirHidraulica(projeto, 1) as PontoH[];
}
const doAmbiente = (lista: PontoH[], id: string) => lista.filter((p) => p.vinculos.ambienteId === id);
const aparelhos = (lista: PontoH[]) => lista.map((p) => p.props.aparelho);

describe('sugestão de pontos hidráulicos', () => {
  it('banheiro → vaso, lavatório, chuveiro e ralo; cozinha → pia e filtro; área de serviço → tanque, máquina e ralo; sala → nada', () => {
    const lista = sugeridos();
    expect(aparelhos(doAmbiente(lista, 'ban'))).toEqual(['vaso', 'lavatorio', 'chuveiro', 'ralo']);
    expect(aparelhos(doAmbiente(lista, 'coz'))).toEqual(['pia', 'filtro']);
    expect(aparelhos(doAmbiente(lista, 'as'))).toEqual(['tanque', 'maquina-lavar', 'ralo']);
    expect(doAmbiente(lista, 'sala')).toEqual([]);
    expect(lista).toHaveLength(9);
  });

  it('tudo nasce pendente / sugerido-auto, com ids únicos e determinísticos', () => {
    const lista = sugeridos();
    expect(lista.every((p) => p.status === 'pendente' && p.origem === 'sugerido-auto')).toBe(true);
    expect(lista.every((p) => p.tipo === 'ponto-hidraulico' && p.disciplina === 'hidraulica' && p.pagina === 1)).toBe(true);
    expect(new Set(lista.map((p) => p.id)).size).toBe(lista.length);
    expect(sugeridos().map((p) => p.id)).toEqual(lista.map((p) => p.id));
  });

  it('ligações conforme a tabela; diâmetros ficam undefined (derivados dos parâmetros)', () => {
    const porAparelho = Object.fromEntries(sugeridos().map((p) => [`${p.vinculos.ambienteId}:${p.props.aparelho}`, p.props]));
    expect(porAparelho['ban:vaso']).toEqual({ aparelho: 'vaso', aguaFria: true, aguaQuente: false, esgoto: true });
    expect(porAparelho['ban:lavatorio']).toMatchObject({ aguaFria: true, esgoto: true });
    expect(porAparelho['ban:chuveiro']).toMatchObject({ aguaFria: true, esgoto: false });
    expect(porAparelho['ban:ralo']).toMatchObject({ aguaFria: false, esgoto: true });
    expect(porAparelho['coz:pia']).toMatchObject({ aguaFria: true, esgoto: true });
    expect(porAparelho['coz:filtro']).toMatchObject({ aguaFria: true, esgoto: false });
    expect(porAparelho['as:tanque']).toMatchObject({ aguaFria: true, esgoto: true });
    expect(porAparelho['as:maquina-lavar']).toMatchObject({ aguaFria: true, esgoto: true });
  });

  it('água quente só com ambiente.props.aguaQuente: chuveiro, lavatório e pia', () => {
    expect(sugeridos().some((p) => p.props.aguaQuente)).toBe(false);
    const comAQ = sugeridos(
      projetoBase([
        ambiente('ban', 'banheiro', [0, 0, 200, 300], { aguaQuente: true }),
        ambiente('coz', 'cozinha', [300, 0, 600, 300], { aguaQuente: true }),
      ]),
    );
    expect(aparelhos(comAQ.filter((p) => p.props.aguaQuente)).sort()).toEqual(['chuveiro', 'lavatorio', 'pia']);
  });

  it('pontos dentro do ambiente, recuados do perímetro; ralo no centro', () => {
    const recuo = RECUO_PONTO_M / ESCALA;
    for (const p of doAmbiente(sugeridos(), 'ban')) {
      const pos = p.geometria.tipo === 'ponto' ? p.geometria.ponto : { x: NaN, y: NaN };
      const poligono = banheiro.geometria.tipo === 'poligono' ? banheiro.geometria.pontos : [];
      expect(pontoEmPoligono(pos, poligono)).toBe(true);
      if (p.props.aparelho === 'ralo') expect(pos).toEqual({ x: 100, y: 150 });
      else expect(distanciaPontoPoligono(pos, poligono)).toBeCloseTo(recuo, 6);
    }
  });

  it('página sem escala → nenhuma sugestão', () => {
    const projeto = projetoBase([banheiro], (p) => {
      p.paginas = { 1: { escala: null } };
    });
    expect(sugerirHidraulica(projeto, 1)).toEqual([]);
    expect(sugerirHidraulica(projetoBase([banheiro]), 2)).toEqual([]);
  });

  it('não gera para ambiente que já tem pontos confirmados (pendentes não bloqueiam)', () => {
    const confirmado = projetoBase([banheiro, cozinha, ponto('v', 'vaso', { x: 30, y: 30 }, 'ban')]);
    expect(doAmbiente(sugeridos(confirmado), 'ban')).toEqual([]);
    expect(doAmbiente(sugeridos(confirmado), 'coz')).toHaveLength(2);
    const pendente = projetoBase([banheiro, ponto('v', 'vaso', { x: 30, y: 30 }, 'ban', 'pendente')]);
    expect(doAmbiente(sugeridos(pendente), 'ban')).toHaveLength(4);
  });
});
