import { describe, expect, it } from 'vitest';
import { aiAnalyzer } from './ia';
import { gerarPdfEmBranco } from './pdfEmBranco';

const comoTexto = (bytes: Uint8Array): string => String.fromCharCode(...bytes);

describe('gerarPdfEmBranco', () => {
  const bytes = gerarPdfEmBranco(842, 595.5);
  const pdf = comoTexto(bytes);

  it('começa com %PDF- e termina com %%EOF', () => {
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf.endsWith('%%EOF')).toBe(true);
    expect(bytes.every((b) => b < 128)).toBe(true);
  });

  it('tem 1 página com o MediaBox pedido', () => {
    expect(pdf).toContain('/MediaBox [0 0 842 595.5]');
    expect(pdf).toContain('/Count 1');
    expect(pdf).toContain('/Root 1 0 R');
  });

  it('startxref aponta para a tabela xref e os offsets apontam para os objetos', () => {
    const inicioXref = Number(/startxref\n(\d+)\n%%EOF$/.exec(pdf)![1]);
    expect(pdf.slice(inicioXref, inicioXref + 4)).toBe('xref');

    const linhas = pdf.slice(inicioXref).split('\n');
    expect(linhas[1]).toBe('0 4');
    expect(linhas[2]).toBe('0000000000 65535 f ');
    const entradas = linhas.slice(3, 6);
    entradas.forEach((entrada, i) => {
      expect(entrada).toMatch(/^\d{10} 00000 n $/); // 20 bytes com a quebra de linha
      const offset = Number(entrada.slice(0, 10));
      expect(pdf.slice(offset).startsWith(`${i + 1} 0 obj\n`)).toBe(true);
    });
  });

  it('rejeita dimensões inválidas', () => {
    expect(() => gerarPdfEmBranco(0, 100)).toThrow();
    expect(() => gerarPdfEmBranco(100, NaN)).toThrow();
  });
});

describe('aiAnalyzer (stub)', () => {
  it('está indisponível e rejeita com "em breve"', async () => {
    expect(aiAnalyzer.disponivel).toBe(false);
    await expect(aiAnalyzer.analisarRecorte(new Blob([]), 1)).rejects.toThrow(/em breve/);
  });
});
