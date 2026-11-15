/** Exportação (aba Materiais, abaixo das composições): Excel, JSON e PDF da planta. */
import { useState } from 'react';
import { useLevantamento } from '@/core/store';
import { capturarPlantaComCamadas } from '@/features/viewer';
import { useLevantamentoCalculado } from '@/app/levantamento';
import { exportarExcel, exportarJSON, exportarPDF, nomeArquivo } from './exportar';

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TIPO_JSON = 'application/json';
const DICA_SEM_PLANTA = 'Abra uma planta primeiro';

function baixar(conteudo: BlobPart, tipo: string, nome: string): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function PainelExportacao() {
  const projeto = useLevantamento((s) => s.projeto);
  const levantamento = useLevantamentoCalculado();
  const [dica, definirDica] = useState<string | null>(null);

  const excel = () => {
    definirDica(null);
    const bytes = exportarExcel(projeto, levantamento);
    baixar(bytes.buffer as ArrayBuffer, TIPO_XLSX, nomeArquivo(projeto.nome, 'xlsx'));
  };
  const json = () => {
    definirDica(null);
    baixar(exportarJSON(projeto), TIPO_JSON, nomeArquivo(projeto.nome, 'json'));
  };
  const pdf = async () => {
    const imagem = await capturarPlantaComCamadas();
    if (!imagem) {
      definirDica(DICA_SEM_PLANTA);
      return;
    }
    definirDica(null);
    exportarPDF(imagem, projeto.nome);
  };

  return (
    <div className="secao">
      <h3>Exportar</h3>
      <div className="linha">
        <button className="primario" onClick={excel}>
          Exportar Excel (.xlsx)
        </button>
        <button onClick={json}>Exportar JSON</button>
        <button onClick={pdf}>Exportar PDF da planta</button>
      </div>
      {dica && <p className="aviso">{dica}</p>}
      <p className="suave" style={{ fontSize: 12, margin: '6px 0 0' }}>
        No Excel, confirmados e pendentes saem em colunas separadas. No PDF, escolha “Salvar como PDF” na impressão.
      </p>
    </div>
  );
}
