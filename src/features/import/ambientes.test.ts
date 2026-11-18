import { describe, expect, it } from 'vitest';
import { classificarAmbiente, naoEhNomeDeAmbiente } from './ambientes';

describe('classificarAmbiente', () => {
  it.each([
    ['SUÍTE', 'quarto', false],
    ['Suíte Master', 'quarto', false],
    ['WC SUÍTE', 'banheiro', true],
    ['WC SOCIAL', 'banheiro', true],
    ['LAVABO', 'banheiro', true],
    ['GARAGEM GOURMET', 'garagem', false],
    ['CLOSET', 'outro', false],
    ['Depósito', 'outro', false],
    ['LAVANDERIA', 'area-servico', true],
    ['Área de Serviço', 'area-servico', true],
    ['CORREDOR', 'circulacao', false],
    ['QUARTO 01', 'quarto', false],
  ] as const)('%s → %s', (nome, tipo, molhada) => {
    expect(classificarAmbiente(nome)).toMatchObject({ tipo, areaMolhada: molhada });
  });

  it('nome composto: tipo pelo 1º termo, área molhada se qualquer termo for molhado (e avisa)', () => {
    expect(classificarAmbiente('SALA E COZINHA')).toEqual({ tipo: 'sala', areaMolhada: true, molhadaPorTermoSecundario: true });
    expect(classificarAmbiente('SALA TV/ COZINHA')).toEqual({ tipo: 'sala', areaMolhada: true, molhadaPorTermoSecundario: true });
    expect(classificarAmbiente('Cozinha / Área de serviço')).toEqual({ tipo: 'cozinha', areaMolhada: true, molhadaPorTermoSecundario: false });
    expect(classificarAmbiente('WC SUÍTE')).toMatchObject({ molhadaPorTermoSecundario: false });
  });

  it('a palavra-chave casa só no início de uma palavra ("serv" não casa "observação")', () => {
    expect(classificarAmbiente('Observação geral')).toBeNull();
    expect(classificarAmbiente('Conservatório')).toBeNull();
  });

  it('títulos e entorno não são ambientes', () => {
    for (const t of ['CALÇADA', 'PLANTA BAIXA - 137.26m²', 'ESC. 1:100', 'Corte 1', 'Fachada frontal']) {
      expect(naoEhNomeDeAmbiente(t)).toBe(true);
      expect(classificarAmbiente(t)).toBeNull();
    }
    expect(naoEhNomeDeAmbiente('SALA')).toBe(false);
  });
});
