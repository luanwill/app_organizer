/** Planta em branco: bytes de um PDF 1.4 mínimo e válido, de 1 página vazia. Função pura. */
import { arredondar } from '@/core/calc';
import { CASAS_PDF } from './config';

const LARGURA_OFFSET_XREF = 10;

/** PDF de 1 página em branco com MediaBox [0 0 largura altura] (unidades do PDF). */
export function gerarPdfEmBranco(largura: number, altura: number): Uint8Array {
  if (!(largura > 0) || !(altura > 0) || !Number.isFinite(largura) || !Number.isFinite(altura)) {
    throw new Error('Dimensões inválidas para a planta em branco.');
  }
  const l = arredondar(largura, CASAS_PDF);
  const a = arredondar(altura, CASAS_PDF);
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${l} ${a}] /Resources << >> >>`,
  ];

  // Só ASCII: o comprimento da string é o deslocamento em bytes.
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objetos.forEach((corpo, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${corpo}\nendobj\n`;
  });
  const inicioXref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n`;
  pdf += '0000000000 65535 f \n'; // cada entrada tem exatamente 20 bytes
  for (const offset of offsets) pdf += `${String(offset).padStart(LARGURA_OFFSET_XREF, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i);
  return bytes;
}
