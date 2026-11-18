/** Barra de ferramentas do visualizador: abrir PDF, modos de desenho, desfazer/refazer. */
import { useRef } from 'react';
import type { ModoFerramenta } from '@/core/model';
import { useLevantamento } from '@/core/store';
import { motivoBloqueio } from './desenho';

const FERRAMENTAS: { modo: ModoFerramenta; rotulo: string; dica: string }[] = [
  { modo: 'selecionar', rotulo: 'Selecionar', dica: 'Selecionar e editar elementos' },
  { modo: 'pan', rotulo: 'Mover vista', dica: 'Arrastar a planta (ou segure a barra de espaço)' },
  { modo: 'distancia', rotulo: 'Distância', dica: 'Medir entre 2 pontos' },
  { modo: 'polilinha', rotulo: 'Polilinha', dica: 'Medir um comprimento com vários trechos' },
  { modo: 'poligono', rotulo: 'Polígono', dica: 'Medir uma área' },
  { modo: 'retangulo', rotulo: 'Retângulo', dica: 'Medir uma área retangular (2 cantos)' },
  { modo: 'contagem', rotulo: 'Contagem', dica: 'Contar itens (um clique = um item)' },
  { modo: 'parede', rotulo: 'Parede', dica: 'Desenhar o eixo de uma parede' },
];

export interface BarraFerramentasProps {
  temPlanta: boolean;
  /** Análise em andamento: ferramentas, abrir e desfazer ficam desabilitados. */
  bloqueada?: boolean;
  aoAbrirArquivo(arquivo: File): void;
}

const DICA_ANALISANDO = 'Aguarde o fim da análise';

export function BarraFerramentas({ temPlanta, bloqueada = false, aoAbrirArquivo }: BarraFerramentasProps) {
  const ferramenta = useLevantamento((s) => s.ferramenta);
  const escala = useLevantamento((s) => s.projeto.paginas[s.paginaAtual]?.escala ?? null);
  const podeDesfazer = useLevantamento((s) => s.podeDesfazer);
  const podeRefazer = useLevantamento((s) => s.podeRefazer);
  const entrada = useRef<HTMLInputElement>(null);

  return (
    <div className="vz-barra">
      <button
        type="button"
        className={temPlanta ? '' : 'primario'}
        disabled={bloqueada}
        title={bloqueada ? DICA_ANALISANDO : undefined}
        onClick={() => entrada.current?.click()}>
        Abrir planta (PDF)
      </button>
      <input
        ref={entrada}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          e.target.value = '';
          if (arquivo) aoAbrirArquivo(arquivo);
        }}
      />
      <span className="vz-separador" />
      {FERRAMENTAS.map((f) => {
        // durante a análise só o pan continua disponível
        const bloqueio = bloqueada && f.modo !== 'pan' ? DICA_ANALISANDO : motivoBloqueio(f.modo, temPlanta, escala);
        return (
          <button
            key={f.modo}
            type="button"
            className={ferramenta.modo === f.modo ? 'ativo' : ''}
            aria-pressed={ferramenta.modo === f.modo}
            disabled={bloqueio !== null}
            title={bloqueio ?? f.dica}
            onClick={(e) => {
              e.currentTarget.blur();
              useLevantamento.getState().definirFerramenta({ modo: f.modo });
            }}
          >
            {f.rotulo}
          </button>
        );
      })}
      <span className="vz-separador" />
      <button
        type="button"
        disabled={!podeDesfazer || bloqueada}
        title="Desfazer (Ctrl+Z)"
        onClick={() => useLevantamento.getState().desfazer()}
      >
        ↶ Desfazer
      </button>
      <button
        type="button"
        disabled={!podeRefazer || bloqueada}
        title="Refazer (Ctrl+Y)"
        onClick={() => useLevantamento.getState().refazer()}
      >
        ↷ Refazer
      </button>
    </div>
  );
}
