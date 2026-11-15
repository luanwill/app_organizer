/** Coluna direita: árvore do levantamento com totais ao vivo (confirmados × pendentes). */
import { useMemo, useState } from 'react';
import type { Alerta, Disciplina, Levantamento, LinhaQuantitativo, Status } from '@/core/model';
import { COR_DISCIPLINA, ROTULO_DISCIPLINA } from '@/core/model';
import { formatarNumero } from '@/core/calc';
import { useLevantamento } from '@/core/store';

interface LinhaArvore {
  chave: string;
  descricao: string;
  unidade: string;
  confirmado: number;
  pendente: number;
  manual: boolean;
  elementoIds: string[];
}

function somar(alvo: LinhaArvore, quantidade: number, status: Status) {
  if (status === 'confirmado') alvo.confirmado += quantidade;
  else alvo.pendente += quantidade;
}

function agrupar(linhas: LinhaQuantitativo[]): Map<string, LinhaArvore[]> {
  const grupos = new Map<string, Map<string, LinhaArvore>>();
  for (const l of linhas) {
    const descricao = l.detalhe ? `${l.descricao} (${l.detalhe})` : l.descricao;
    const chave = `${descricao}|${l.unidade}`;
    const grupo = grupos.get(l.grupo) ?? new Map<string, LinhaArvore>();
    grupos.set(l.grupo, grupo);
    const linha =
      grupo.get(chave) ??
      ({ chave, descricao, unidade: l.unidade, confirmado: 0, pendente: 0, manual: false, elementoIds: [] } as LinhaArvore);
    grupo.set(chave, linha);
    somar(linha, l.quantidade, l.status);
    linha.manual = linha.manual || !!l.manual;
    linha.elementoIds.push(...l.elementoIds);
  }
  return new Map([...grupos].map(([g, m]) => [g, [...m.values()]]));
}

function Ramo({ titulo, cor, extra, children, aberto = true }: { titulo: string; cor?: string; extra?: string; children: React.ReactNode; aberto?: boolean }) {
  const [abertoAtual, definirAberto] = useState(aberto);
  return (
    <div className="ramo">
      <button className="ramo-titulo" onClick={() => definirAberto(!abertoAtual)} aria-expanded={abertoAtual}>
        <span className="seta">{abertoAtual ? '▾' : '▸'}</span>
        {cor && <span className="bolinha" style={{ background: cor }} />}
        <span className="ramo-nome">{titulo}</span>
        {extra && <span className="suave">{extra}</span>}
      </button>
      {abertoAtual && <div className="ramo-filhos">{children}</div>}
    </div>
  );
}

function TabelaLinhas({ linhas }: { linhas: LinhaArvore[] }) {
  const selecionar = useLevantamento((s) => s.selecionar);
  return (
    <table className="arvore-tabela">
      <tbody>
        {linhas.map((l) => (
          <tr key={l.chave} onClick={() => selecionar([...new Set(l.elementoIds)])} title="Selecionar na planta">
            <td>
              {l.descricao}
              {l.manual && <span className="selo-manual" title="Valor manual"> ✎</span>}
            </td>
            <td className="num">
              {l.confirmado !== 0 || l.pendente === 0 ? `${formatarNumero(l.confirmado)} ${l.unidade}` : ''}
              {l.pendente !== 0 && (
                <div className="pendente" title="Pendente — fora dos totais confirmados">
                  + {formatarNumero(l.pendente)} {l.unidade} pend.
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Alertas({ alertas }: { alertas: Alerta[] }) {
  const selecionar = useLevantamento((s) => s.selecionar);
  const unicos = useMemo(() => [...new Map(alertas.map((a) => [a.mensagem, a])).values()], [alertas]);
  if (unicos.length === 0) return null;
  return (
    <ul className="alertas">
      {unicos.map((a) => (
        <li key={a.mensagem} className="alerta-faltante" onClick={() => a.elementoId && selecionar([a.elementoId])}>
          ⚠ Dado faltante: {a.mensagem}
        </li>
      ))}
    </ul>
  );
}

const DISCIPLINAS_ARVORE: Exclude<Disciplina, 'materiais'>[] = ['arquitetura', 'estrutura', 'eletrica', 'hidraulica'];

export function ArvoreLevantamento({ levantamento }: { levantamento: Levantamento }) {
  const projeto = useLevantamento((s) => s.projeto);
  const confirmarPendentes = useLevantamento((s) => s.confirmarPendentes);
  const descartarPendentes = useLevantamento((s) => s.descartarPendentes);
  const pendentes = projeto.elementos.filter((e) => e.status === 'pendente');

  const materiais = useMemo(() => {
    const mapa = new Map<string, LinhaArvore>();
    for (const m of levantamento.materiais) {
      const chave = `${m.material}|${m.unidade}`;
      const linha =
        mapa.get(chave) ??
        ({ chave, descricao: m.material, unidade: m.unidade, confirmado: 0, pendente: 0, manual: false, elementoIds: [] } as LinhaArvore);
      mapa.set(chave, linha);
      somar(linha, m.quantidade, m.status);
    }
    return [...mapa.values()];
  }, [levantamento.materiais]);

  return (
    <div className="arvore">
      <h3>Levantamento</h3>
      {pendentes.length > 0 && (
        <div className="aviso-pendentes">
          <div className="pendente">
            {pendentes.length} sugest{pendentes.length === 1 ? 'ão pendente' : 'ões pendentes'} — fora dos totais confirmados
          </div>
          <div className="linha">
            <button onClick={() => confirmarPendentes()}>Aceitar todas</button>
            <button onClick={() => descartarPendentes()}>Descartar todas</button>
          </div>
        </div>
      )}
      {DISCIPLINAS_ARVORE.map((d) => {
        const resultado = levantamento[d];
        const grupos = agrupar(resultado.linhas);
        const nPend = pendentes.filter((e) => e.disciplina === d).length;
        return (
          <Ramo key={d} titulo={ROTULO_DISCIPLINA[d]} cor={COR_DISCIPLINA[d]} extra={nPend ? `${nPend} pend.` : undefined}>
            <Alertas alertas={resultado.alertas} />
            {nPend > 0 && (
              <div className="linha acoes-disciplina">
                <button onClick={() => confirmarPendentes(d)}>Aceitar pendentes</button>
                <button onClick={() => descartarPendentes(d)}>Descartar</button>
              </div>
            )}
            {grupos.size === 0 && <div className="suave vazio">Nada levantado ainda.</div>}
            {[...grupos].map(([grupo, linhas]) => (
              <Ramo key={grupo} titulo={grupo} extra={`${linhas.length}`}>
                <TabelaLinhas linhas={linhas} />
              </Ramo>
            ))}
          </Ramo>
        );
      })}
      <Ramo titulo={ROTULO_DISCIPLINA.materiais} cor={COR_DISCIPLINA.materiais} extra={`${materiais.length}`} aberto={false}>
        {materiais.length === 0 ? <div className="suave vazio">Sem materiais calculados.</div> : <TabelaLinhas linhas={materiais} />}
      </Ramo>
    </div>
  );
}
