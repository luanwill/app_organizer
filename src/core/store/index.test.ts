import { describe, expect, it, vi } from 'vitest';
import { useLevantamento } from './index';

describe('useLevantamento (Dexie)', () => {
  it('sem IndexedDB (node) inicializa em memória sem quebrar', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await useLevantamento.getState().inicializar();
    expect(useLevantamento.getState().carregado).toBe(true);
    expect(useLevantamento.getState().projeto.elementos).toEqual([]);
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });
});
