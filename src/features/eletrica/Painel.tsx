/** Painel da etapa "3. O que medir" → aba Elétrica. Só interface: as regras ficam nos arquivos .ts. */
import { useEffect, useMemo, useState } from 'react';
import type {
  AlturaPonto,
  Ferramenta,
  PatchParametros,
  PropsPontoEletrico,
  TipoPontoEletrico,
  TipoTUE,
} from '@/core/model';
import { formatarNumero, lerNumero } from '@/core/calc';
import { useLevantamento } from '@/core/store';
import { calcularCircuitos } from './circuitos';
import {
  ALTURA_TUE,
  ALTURA_TUG_PADRAO,
  AVISO_SECOES,
  INSTRUCAO_REDESENHAR,
  MENSAGEM_SEM_QUADRO,
  POTENCIA_INTERRUPTOR_VA,
  POTENCIA_LUZ_MANUAL_VA,
  ROTULO_ALTURA,
  ROTULO_TIPO_CIRCUITO,
  ROTULO_TIPO_PONTO,
  ROTULO_TUE,
  TIPOS_TUE,
} from './config';
import { ehAmbiente, ehPontoEletrico, escalaDaPagina, resumoAmbientes } from './regras';
import { sugerirEletrica } from './sugestao';

const TIPOS_PONTO = Object.keys(ROTULO_TIPO_PONTO) as TipoPontoEletrico[];
const ALTURAS = Object.keys(ROTULO_ALTURA) as AlturaPonto[];
const TENSOES = [127, 220] as const;
const ALTURAS_PARAMETRO = ['baixa', 'media', 'alta', 'interruptor'] as const;

/** Campo numérico pt-BR: aceita vírgula, grava ao sair do campo ou com Enter; inválido → volta ao valor. */
function CampoNumero(props: { rotulo: string; valor: number; casas?: number; aoMudar: (valor: number) => void }) {
  const { rotulo, valor, casas = 2, aoMudar } = props;
  const [texto, definirTexto] = useState(formatarNumero(valor, casas));
  useEffect(() => definirTexto(formatarNumero(valor, casas)), [valor, casas]);
  const gravar = () => {
    const lido = lerNumero(texto);
    if (lido !== null && lido >= 0 && lido !== valor) aoMudar(lido);
    else definirTexto(formatarNumero(valor, casas));
  };
  return (
    <label className="campo">
      <span>{rotulo}</span>
      <input
        inputMode="decimal"
        value={texto}
        onChange={(e) => definirTexto(e.target.value)}
        onBlur={gravar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}

export function PainelEletrica() {
  const projeto = useLevantamento((s) => s.projeto);
  const pagina = useLevantamento((s) => s.paginaAtual);
  const selecaoIds = useLevantamento((s) => s.selecaoIds);
  const ferramenta = useLevantamento((s) => s.ferramenta);
  const store = useLevantamento.getState;

  const parametros = projeto.parametros.eletrica;
  const temEscala = escalaDaPagina(projeto, pagina) !== null;
  const ambientes = useMemo(
    () => projeto.elementos.filter(ehAmbiente).filter((a) => a.pagina === pagina),
    [projeto.elementos, pagina],
  );
  const resumos = useMemo(() => resumoAmbientes(projeto, pagina), [projeto, pagina]);
  const circuitos = useMemo(() => calcularCircuitos(projeto).filter((c) => c.pagina === pagina), [projeto, pagina]);
  const pontosDaPagina = projeto.elementos.filter(ehPontoEletrico).filter((p) => p.pagina === pagina);
  const temQuadro = projeto.elementos.some((el) => el.tipo === 'quadro' && el.pagina === pagina);
  const temPendentes = projeto.elementos.some((el) => el.disciplina === 'eletrica' && el.status === 'pendente');
  const selecionado = projeto.elementos.filter(ehPontoEletrico).find((p) => p.id === selecaoIds[0]);
  const redesenhando = ferramenta.modo === 'polilinha' && ferramenta.alvo?.tipo === 'eletroduto';

  const dicaSugerir = !temEscala
    ? 'Calibre a escala desta página (etapa 1) para sugerir os pontos.'
    : ambientes.length === 0
      ? 'Desenhe os ambientes (aba Arquitetura) para sugerir os pontos.'
      : null;

  const ativar = (f: Ferramenta) => store().definirFerramenta(f);
  const pontoManual = (propsPonto: PropsPontoEletrico) =>
    ativar({ modo: 'ponto', alvo: { tipo: 'ponto-eletrico', props: propsPonto } });
  const editar = (propsPonto: Partial<PropsPontoEletrico>) => {
    if (selecionado) store().atualizarElemento(selecionado.id, { props: propsPonto });
  };
  const parametrizar = (eletrica: NonNullable<PatchParametros['eletrica']>) =>
    store().atualizarParametros({ eletrica });
  const alternarTUE = (ambienteId: string, atuais: TipoTUE[], tue: TipoTUE) => {
    const tues = atuais.includes(tue) ? atuais.filter((t) => t !== tue) : [...atuais, tue];
    store().atualizarElemento(ambienteId, { props: { tues } });
  };

  return (
    <div>
      <h3>Elétrica e iluminação</h3>
      <p className="aviso">{AVISO_SECOES}</p>

      <div className="secao">
        <div className="linha">
          <button
            type="button"
            className="primario"
            disabled={dicaSugerir !== null}
            title={dicaSugerir ?? undefined}
            onClick={() => store().substituirSugestoes('eletrica', sugerirEletrica(projeto, pagina), pagina)}
          >
            Sugerir pontos (NBR 5410)
          </button>
          <button type="button" disabled={!temPendentes} onClick={() => store().confirmarPendentes('eletrica')}>
            Aceitar todas
          </button>
          <button type="button" disabled={!temPendentes} onClick={() => store().descartarPendentes('eletrica')}>
            Descartar todas
          </button>
        </div>
        {dicaSugerir && <p className="alerta-faltante">{dicaSugerir}</p>}
        {!dicaSugerir && (
          <p className="suave">As sugestões ficam pendentes na planta: arraste para ajustar e aceite.</p>
        )}
      </div>

      {selecionado && (
        <div className="secao">
          <h3>
            Ponto selecionado{' '}
            {selecionado.status === 'pendente' && <span className="pendente">(pendente)</span>}
          </h3>
          <label className="campo">
            <span>Tipo</span>
            <select
              value={selecionado.props.tipoPonto}
              onChange={(e) => editar({ tipoPonto: e.target.value as TipoPontoEletrico })}
            >
              {TIPOS_PONTO.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO_PONTO[t]}
                </option>
              ))}
            </select>
          </label>
          {selecionado.props.tipoPonto === 'tue' && (
            <label className="campo">
              <span>Equipamento</span>
              <select
                value={selecionado.props.tue ?? ''}
                onChange={(e) => {
                  const tue = e.target.value as TipoTUE;
                  editar({ tue, potenciaVA: parametros.potenciaTUE[tue], altura: ALTURA_TUE[tue] });
                }}
              >
                <option value="" disabled>
                  Escolha…
                </option>
                {TIPOS_TUE.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TUE[t]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selecionado.props.tipoPonto !== 'interruptor' && (
            <CampoNumero
              rotulo="Potência (VA)"
              valor={selecionado.props.potenciaVA}
              casas={0}
              aoMudar={(potenciaVA) => editar({ potenciaVA })}
            />
          )}
          <label className="campo">
            <span>Altura</span>
            <select value={selecionado.props.altura} onChange={(e) => editar({ altura: e.target.value as AlturaPonto })}>
              {ALTURAS.map((a) => (
                <option key={a} value={a}>
                  {ROTULO_ALTURA[a]}
                </option>
              ))}
            </select>
          </label>
          <div className="linha">
            {selecionado.status === 'pendente' && (
              <button type="button" className="primario" onClick={() => store().confirmarElementos([selecionado.id])}>
                Aceitar
              </button>
            )}
            <button type="button" onClick={() => store().removerElementos([selecionado.id])}>
              {selecionado.status === 'pendente' ? 'Descartar' : 'Remover'}
            </button>
          </div>
        </div>
      )}

      <div className="secao">
        <h3>Posicionar na planta</h3>
        <div className="linha">
          <button type="button" onClick={() => ativar({ modo: 'ponto', alvo: { tipo: 'quadro', props: {} } })}>
            Posicionar quadro
          </button>
          <button
            type="button"
            onClick={() => pontoManual({ tipoPonto: 'luz', potenciaVA: POTENCIA_LUZ_MANUAL_VA, altura: 'teto' })}
          >
            + Luz
          </button>
          <button
            type="button"
            onClick={() =>
              pontoManual({ tipoPonto: 'tug', potenciaVA: parametros.potenciaTUG, altura: ALTURA_TUG_PADRAO })
            }
          >
            + TUG
          </button>
          <button
            type="button"
            onClick={() =>
              pontoManual({ tipoPonto: 'interruptor', potenciaVA: POTENCIA_INTERRUPTOR_VA, altura: 'interruptor' })
            }
          >
            + Interruptor
          </button>
          <button
            type="button"
            className={redesenhando ? 'ativo' : ''}
            onClick={() => ativar({ modo: 'polilinha', alvo: { tipo: 'eletroduto', props: {} } })}
          >
            Redesenhar rota
          </button>
        </div>
        {redesenhando && <p className="suave">{INSTRUCAO_REDESENHAR}</p>}
        {!temQuadro && pontosDaPagina.length > 0 && (
          <p className="alerta-faltante">{MENSAGEM_SEM_QUADRO} para calcular eletrodutos e fios.</p>
        )}
      </div>

      <div className="secao">
        <h3>TUEs por ambiente</h3>
        {ambientes.length === 0 && <p className="suave">Nenhum ambiente nesta página.</p>}
        {ambientes.map((ambiente) => {
          const atuais = ambiente.props.tues ?? [];
          return (
            <div key={ambiente.id} style={{ marginBottom: 6 }}>
              <strong>{ambiente.props.nome || 'Ambiente'}</strong>
              <div className="linha">
                {TIPOS_TUE.map((tue) => (
                  <label key={tue}>
                    <input
                      type="checkbox"
                      checked={atuais.includes(tue)}
                      onChange={() => alternarTUE(ambiente.id, atuais, tue)}
                    />{' '}
                    {ROTULO_TUE[tue]}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="secao">
        <h3>Circuitos</h3>
        {circuitos.length === 0 ? (
          <p className="suave">Nenhum circuito nesta página.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nº</th>
                <th>Tipo</th>
                <th className="num">VA</th>
                <th className="num">Seção</th>
                <th className="num">Disjuntor</th>
              </tr>
            </thead>
            <tbody>
              {circuitos.map((c) => (
                <tr key={c.id} className={c.status === 'pendente' ? 'pendente' : ''}>
                  <td>{c.rotulo}</td>
                  <td>
                    {ROTULO_TIPO_CIRCUITO[c.tipo]}
                    {c.tipo === 'tue' && c.tue ? ` — ${ROTULO_TUE[c.tue]}` : ''}
                  </td>
                  <td className="num">{formatarNumero(c.va, 0)}</td>
                  <td className="num">{c.secaoMm2 === null ? '—' : `${formatarNumero(c.secaoMm2, 1)} mm²`}</td>
                  <td className="num">{c.disjuntorA === null ? '—' : `${c.disjuntorA} A`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="secao">
        <h3>Resumo por ambiente (mínimos da norma)</h3>
        {resumos.length === 0 ? (
          <p className="suave">{temEscala ? 'Nenhum ambiente nesta página.' : 'Página sem escala.'}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ambiente</th>
                <th className="num">Área (m²)</th>
                <th className="num">Perím. (m)</th>
                <th className="num">Ilum. (VA)</th>
                <th className="num">TUGs</th>
              </tr>
            </thead>
            <tbody>
              {resumos.map((r) => (
                <tr key={r.ambienteId}>
                  <td>{r.nome || 'Ambiente'}</td>
                  <td className="num">{formatarNumero(r.areaM2)}</td>
                  <td className="num">{formatarNumero(r.perimetroM)}</td>
                  <td className="num">{formatarNumero(r.iluminacaoVA, 0)}</td>
                  <td className="num">{r.tugs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <details className="secao">
        <summary>Parâmetros</summary>
        <CampoNumero
          rotulo="Limite por circuito (VA)"
          valor={parametros.limiteVAPorCircuito}
          casas={0}
          aoMudar={(limiteVAPorCircuito) => parametrizar({ limiteVAPorCircuito })}
        />
        <label className="campo">
          <span>Tensão (V)</span>
          <select
            value={parametros.tensao}
            onChange={(e) => parametrizar({ tensao: Number(e.target.value) === 220 ? 220 : 127 })}
          >
            {TENSOES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <CampoNumero
          rotulo="Potência da TUG (VA)"
          valor={parametros.potenciaTUG}
          casas={0}
          aoMudar={(potenciaTUG) => parametrizar({ potenciaTUG })}
        />
        <CampoNumero
          rotulo="Eletroduto Ø (mm)"
          valor={parametros.diametroEletrodutoMm}
          casas={0}
          aoMudar={(diametroEletrodutoMm) => parametrizar({ diametroEletrodutoMm })}
        />
        <h4>Seções (mm²)</h4>
        <CampoNumero
          rotulo="Iluminação"
          valor={parametros.secoes.iluminacao}
          casas={1}
          aoMudar={(iluminacao) => parametrizar({ secoes: { iluminacao } })}
        />
        <CampoNumero
          rotulo="TUG"
          valor={parametros.secoes.tug}
          casas={1}
          aoMudar={(tug) => parametrizar({ secoes: { tug } })}
        />
        {TIPOS_TUE.map((tue) => (
          <CampoNumero
            key={tue}
            rotulo={ROTULO_TUE[tue]}
            valor={parametros.secoes.tue[tue]}
            casas={1}
            aoMudar={(secao) => parametrizar({ secoes: { tue: { [tue]: secao } } })}
          />
        ))}
        <h4>Alturas de instalação (m)</h4>
        {ALTURAS_PARAMETRO.map((altura) => (
          <CampoNumero
            key={altura}
            rotulo={ROTULO_ALTURA[altura]}
            valor={parametros.alturas[altura]}
            aoMudar={(valor) => parametrizar({ alturas: { [altura]: valor } })}
          />
        ))}
      </details>
    </div>
  );
}
