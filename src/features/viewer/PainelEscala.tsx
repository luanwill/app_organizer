/** Etapa "1. Escala" (coluna esquerda): status e calibração por página. */
import { useLevantamento } from '@/core/store';
import { textoEscala } from './rotulos';
import './viewer.css';

export function PainelEscala() {
  const temPlanta = useLevantamento((s) => s.pdfDados !== null);
  const totalPaginas = useLevantamento((s) => s.projeto.totalPaginas);
  const paginas = useLevantamento((s) => s.projeto.paginas);
  const pagina = useLevantamento((s) => s.paginaAtual);
  const calibrando = useLevantamento((s) => s.ferramenta.modo === 'calibrar');

  const escala = paginas[pagina]?.escala ?? null;
  const calibrada = escala !== null;
  const calibrar = () => useLevantamento.getState().definirFerramenta({ modo: 'calibrar' });

  if (!temPlanta) {
    return (
      <div>
        <h3>Escala</h3>
        <p className="suave">Abra uma planta (PDF) para calibrar a escala.</p>
      </div>
    );
  }

  return (
    <div>
      <h3>Escala — página {pagina}</h3>
      <p className={calibrada ? '' : 'alerta-faltante'}>
        <strong>{textoEscala(escala)}</strong>
      </p>
      {!calibrada && <p className="aviso">Medições bloqueadas: calibre a escala desta página primeiro.</p>}
      <div className="linha">
        {calibrada ? (
          <button type="button" className={calibrando ? 'ativo' : ''} onClick={calibrar}>
            Refazer calibração
          </button>
        ) : (
          <button type="button" className={calibrando ? 'ativo' : 'primario'} onClick={calibrar}>
            Calibrar escala
          </button>
        )}
      </div>
      <ol className="vz-passos suave">
        <li>Clique em “{calibrada ? 'Refazer calibração' : 'Calibrar escala'}”.</li>
        <li>Na planta, clique nas duas pontas de uma cota conhecida.</li>
        <li>Digite a medida real em metros (ex.: 3,07) e aplique.</li>
      </ol>
      {totalPaginas > 1 && (
        <div className="secao">
          <h3>Páginas</h3>
          <table>
            <tbody>
              {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((n) => {
                const e = paginas[n]?.escala ?? null;
                return (
                  <tr key={n}>
                    <td>
                      <button
                        type="button"
                        className={n === pagina ? 'ativo' : ''}
                        onClick={() => useLevantamento.getState().definirPagina(n)}
                      >
                        Página {n}
                      </button>
                    </td>
                    <td className={e === null ? 'alerta-faltante' : ''}>{textoEscala(e)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
