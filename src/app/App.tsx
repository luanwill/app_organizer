/** Casca do app (orquestrador): 3 colunas — etapas guiadas | planta | árvore do levantamento. */
import { useEffect, useMemo, useState } from 'react';
import type { GeometriaDerivada } from '@/core/model';
import { COR_DISCIPLINA, ROTULO_DISCIPLINA } from '@/core/model';
import { useLevantamento } from '@/core/store';
import { PainelEscala, Visualizador } from '@/features/viewer';
import { ArvoreLevantamento } from './ArvoreLevantamento';
import { useLevantamentoCalculado } from './levantamento';
import { MODULOS, type DisciplinaComModulo } from './modulos';
import { PAINEIS } from './paineis';

type Etapa = 1 | 2 | 3;
type Aba = DisciplinaComModulo | 'materiais' | 'importar';

const ETAPAS: { n: Etapa; titulo: string }[] = [
  { n: 1, titulo: 'Escala' },
  { n: 2, titulo: 'Dados essenciais' },
  { n: 3, titulo: 'O que medir' },
];

const ABAS: { id: Aba; titulo: string; cor?: string }[] = [
  ...(['arquitetura', 'estrutura', 'eletrica', 'hidraulica', 'materiais'] as const).map((d) => ({
    id: d,
    titulo: ROTULO_DISCIPLINA[d],
    cor: COR_DISCIPLINA[d],
  })),
  { id: 'importar', titulo: 'Importar' },
];

function PainelAba({ aba }: { aba: Aba }) {
  if (aba === 'materiais') {
    return (
      <>
        {PAINEIS.Materiais && <PAINEIS.Materiais />}
        {PAINEIS.Exportacao && <PAINEIS.Exportacao />}
      </>
    );
  }
  if (aba === 'importar') return PAINEIS.Importacao ? <PAINEIS.Importacao /> : null;
  const Painel = MODULOS[aba]?.Painel;
  return Painel ? <Painel /> : null;
}

export function App() {
  const carregado = useLevantamento((s) => s.carregado);
  const nome = useLevantamento((s) => s.projeto.nome);
  const definirNome = useLevantamento((s) => s.definirNome);
  const novoProjeto = useLevantamento((s) => s.novoProjeto);
  const [etapa, definirEtapa] = useState<Etapa>(1);
  const [aba, definirAba] = useState<Aba>('arquitetura');
  const [vista, definirVista] = useState<'2d' | '3d'>('2d');
  const levantamento = useLevantamentoCalculado();

  useEffect(() => {
    void useLevantamento.getState().inicializar();
  }, []);

  const derivados = useMemo<GeometriaDerivada[]>(
    () => [
      ...(levantamento.arquitetura.derivados ?? []),
      ...(levantamento.estrutura.derivados ?? []),
      ...(levantamento.eletrica.derivados ?? []),
      ...(levantamento.hidraulica.derivados ?? []),
    ],
    [levantamento],
  );

  if (!carregado) return <div className="carregando">Carregando levantamento…</div>;

  return (
    <div className="app">
      <header className="topo">
        <strong>BIM Leve</strong>
        <span className="suave">Levantamento de quantitativos</span>
        <input
          className="nome-projeto"
          value={nome}
          onChange={(e) => definirNome(e.target.value)}
          aria-label="Nome do levantamento"
        />
        <span className="espaco" />
        {PAINEIS.Vista3D && (
          <div className="linha">
            <button className={vista === '2d' ? 'ativo' : ''} onClick={() => definirVista('2d')}>
              Planta
            </button>
            <button className={vista === '3d' ? 'ativo' : ''} onClick={() => definirVista('3d')}>
              3D
            </button>
          </div>
        )}
        <button
          onClick={() => {
            if (window.confirm('Começar um novo levantamento? O levantamento atual será apagado deste navegador.')) {
              void novoProjeto();
            }
          }}
        >
          Novo levantamento
        </button>
      </header>

      <aside className="coluna esquerda">
        <nav className="etapas">
          {ETAPAS.map((e) => (
            <button key={e.n} className={etapa === e.n ? 'ativo' : ''} onClick={() => definirEtapa(e.n)}>
              <span className="numero">{e.n}</span> {e.titulo}
            </button>
          ))}
        </nav>
        <div className="conteudo-etapa">
          {etapa === 1 && <PainelEscala />}
          {etapa === 2 && (PAINEIS.DadosEssenciais ? <PAINEIS.DadosEssenciais /> : null)}
          {etapa === 3 && (
            <>
              <div className="abas">
                {ABAS.map((a) => (
                  <button key={a.id} className={aba === a.id ? 'ativo' : ''} onClick={() => definirAba(a.id)}>
                    {a.cor && <span className="bolinha" style={{ background: a.cor }} />}
                    {a.titulo}
                  </button>
                ))}
              </div>
              <PainelAba aba={aba} />
            </>
          )}
        </div>
      </aside>

      <main className="centro">
        {vista === '3d' && PAINEIS.Vista3D ? <PAINEIS.Vista3D /> : <Visualizador derivados={derivados} />}
      </main>

      <aside className="coluna direita">
        <ArvoreLevantamento levantamento={levantamento} />
      </aside>
    </div>
  );
}
