/** Aba Materiais: tabela editável das composições (serviço → materiais). O consolidado fica na árvore. */
import { useEffect, useState, type KeyboardEvent } from 'react';
import type { Composicao, InsumoComposicao } from '@/core/model';
import { AVISO_COMPOSICOES, SERVICOS } from '@/core/model';
import { formatarNumero, lerNumero } from '@/core/calc';
import { useLevantamento } from '@/core/store';
import { CASAS_COEFICIENTE, COMPOSICOES_PADRAO, INSUMO_NOVO, MARCADOR_DETALHE } from './config';
import './materiais.css';

const aoTeclar = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur();
};

/** 0.012 → "0,012"; 17.5 → "17,5"; 5 → "5". */
function textoDoNumero(valor: number): string {
  const texto = formatarNumero(valor, CASAS_COEFICIENTE);
  return texto.includes(',') ? texto.replace(/0+$/, '').replace(/,$/, '') : texto;
}

/** Campo de texto que grava no blur/Enter (uma alteração por edição). */
function EntradaTexto({ valor, aoMudar, rotulo, placeholder }: { valor: string; aoMudar: (v: string) => void; rotulo: string; placeholder?: string }) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);
  const confirmar = () => {
    const limpo = texto.trim();
    if (limpo === valor) setTexto(valor);
    else aoMudar(limpo);
  };
  return (
    <input type="text" value={texto} aria-label={rotulo} title={rotulo} placeholder={placeholder} onChange={(e) => setTexto(e.target.value)} onBlur={confirmar} onKeyDown={aoTeclar} />
  );
}

/** Número pt-BR (aceita vírgula), não negativo; valor inválido volta ao anterior. */
function EntradaNumero({ valor, aoMudar, rotulo }: { valor: number; aoMudar: (v: number) => void; rotulo: string }) {
  const [texto, setTexto] = useState(textoDoNumero(valor));
  useEffect(() => setTexto(textoDoNumero(valor)), [valor]);
  const confirmar = () => {
    const n = lerNumero(texto);
    if (n === null || n < 0 || n === valor) setTexto(textoDoNumero(valor));
    else aoMudar(n);
  };
  return (
    <input type="text" inputMode="decimal" value={texto} aria-label={rotulo} title={rotulo} onChange={(e) => setTexto(e.target.value)} onBlur={confirmar} onKeyDown={aoTeclar} />
  );
}

export function PainelMateriais() {
  const salvas = useLevantamento((s) => s.projeto.composicoes);
  const definirComposicoes = useLevantamento((s) => s.definirComposicoes);
  const composicoes = salvas ?? COMPOSICOES_PADRAO;

  const alterarComposicao = (id: string, alterar: (c: Composicao) => Composicao) =>
    definirComposicoes(composicoes.map((c) => (c.id === id ? alterar(c) : c)));
  const alterarInsumos = (id: string, alterar: (insumos: InsumoComposicao[]) => InsumoComposicao[]) =>
    alterarComposicao(id, (c) => ({ ...c, insumos: alterar(c.insumos) }));
  const alterarInsumo = (id: string, indice: number, patch: Partial<InsumoComposicao>) =>
    alterarInsumos(id, (insumos) => insumos.map((ins, i) => (i === indice ? { ...ins, ...patch } : ins)));
  const definirDetalhe = (id: string, detalhe: string) =>
    alterarComposicao(id, (c) => {
      const { detalhe: _anterior, ...resto } = c;
      return detalhe ? { ...resto, detalhe } : resto;
    });

  return (
    <div>
      <h3>Composições de materiais</h3>
      <div className="aviso mat-selo" role="note">{AVISO_COMPOSICOES}</div>
      <p className="suave mat-nota">
        Material = quantidade do serviço × coeficiente × (1 + perda). O detalhe filtra as linhas (ex.: fck 25); vazio vale para
        qualquer. {MARCADOR_DETALHE} no nome do material é trocado pelo detalhe da linha (bitola do aço). O consolidado aparece em
        Materiais, na árvore à direita.
      </p>
      <table className="mat-tabela">
        <thead>
          <tr>
            <th>Material</th>
            <th className="mat-un">Un.</th>
            <th className="num mat-num">Coef.</th>
            <th className="num mat-num">Perda %</th>
            <th className="mat-acao" />
          </tr>
        </thead>
        <tbody>
          {composicoes.flatMap((c) => {
            const servico = SERVICOS[c.servico];
            return [
              <tr key={c.id} className="mat-servico">
                <td colSpan={5}>
                  <div className="linha">
                    <strong title={`${servico.descricao} (${servico.unidade})`}>
                      {servico.descricao} <span className="suave">/{servico.unidade}</span>
                    </strong>
                    <EntradaTexto valor={c.detalhe ?? ''} rotulo="Detalhe (vazio = qualquer)" placeholder="detalhe" aoMudar={(v) => definirDetalhe(c.id, v)} />
                    <button title="Adicionar insumo" aria-label={`Adicionar insumo em ${servico.descricao}`} onClick={() => alterarInsumos(c.id, (ins) => [...ins, { ...INSUMO_NOVO }])}>
                      +
                    </button>
                  </div>
                </td>
              </tr>,
              ...c.insumos.map((ins, i) => (
                <tr key={`${c.id}:${i}`}>
                  <td>
                    <EntradaTexto valor={ins.material} rotulo="Material" aoMudar={(v) => v && alterarInsumo(c.id, i, { material: v })} />
                  </td>
                  <td className="mat-un">
                    <EntradaTexto valor={ins.unidade} rotulo="Unidade" aoMudar={(v) => v && alterarInsumo(c.id, i, { unidade: v })} />
                  </td>
                  <td className="mat-num">
                    <EntradaNumero valor={ins.coeficiente} rotulo={`Coeficiente (${ins.unidade}/${servico.unidade})`} aoMudar={(v) => alterarInsumo(c.id, i, { coeficiente: v })} />
                  </td>
                  <td className="mat-num">
                    <EntradaNumero valor={ins.perdaPct} rotulo="Perda (%)" aoMudar={(v) => alterarInsumo(c.id, i, { perdaPct: v })} />
                  </td>
                  <td className="mat-acao">
                    <button title="Remover insumo" aria-label={`Remover ${ins.material}`} onClick={() => alterarInsumos(c.id, (lista) => lista.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  </td>
                </tr>
              )),
            ];
          })}
        </tbody>
      </table>
      <div className="linha" style={{ marginTop: 8 }}>
        <button disabled={salvas === null} onClick={() => definirComposicoes(null)}>
          Restaurar padrão
        </button>
        {salvas !== null && <span className="suave">Composições editadas</span>}
      </div>
    </div>
  );
}
