/** Etapa "3. O que medir" — aba Arquitetura: desenhar, cadastro de esquadrias, ambientes e paredes. */
import { useEffect } from 'react';
import type { AlvoDesenho, ElementoDe, Ferramenta, PropsAmbiente, TipoAmbiente, TipoEsquadria } from '@/core/model';
import { formatarNumero } from '@/core/calc';
import { novoId, useLevantamento } from '@/core/store';
import {
  comprimentoParede,
  contarPosicionadas,
  escalaDaPagina,
  medidasAmbiente,
  nomeAmbiente,
  nomesDasParedes,
  proximoNomeAmbiente,
} from './calcular';
import { EntradaNumero, EntradaTexto, naoNegativo } from './campos';
import {
  ESQUADRIA_NOVA,
  MANUAL_AREA,
  PREFIXO_CODIGO,
  ROTULO_CATEGORIA,
  ROTULO_TIPO_AMBIENTE,
  TIPOS_AREA_MOLHADA,
} from './config';
import './arq.css';

type Ambiente = ElementoDe<'ambiente'>;
type Parede = ElementoDe<'parede'>;
type Categoria = TipoEsquadria['categoria'];

const DICA_ESCALA = 'Calibre a escala desta página primeiro';
const inteiroNaoNegativo = (v: number) => Number.isInteger(v) && v >= 0;

function alvoAmbiente(nome: string): AlvoDesenho {
  const props: PropsAmbiente = { nome, tipoAmbiente: 'outro', areaMolhada: false, coberto: true };
  return { tipo: 'ambiente', props, rotulo: nome };
}

function proximoCodigo(esquadrias: TipoEsquadria[], categoria: Categoria): string {
  const usados = new Set(esquadrias.map((t) => t.codigo));
  let n = esquadrias.filter((t) => t.categoria === categoria).length + 1;
  while (usados.has(`${PREFIXO_CODIGO[categoria]}${n}`)) n += 1;
  return `${PREFIXO_CODIGO[categoria]}${n}`;
}

// ---------------------------------------------------------------- desenhar

function SecaoDesenhar({ calibrada, proximoNome }: { calibrada: boolean; proximoNome: string }) {
  const ferramenta = useLevantamento((s) => s.ferramenta);
  const definir = useLevantamento((s) => s.definirFerramenta);
  const desenhandoAmbiente = (modo: Ferramenta['modo']) => ferramenta.modo === modo && ferramenta.alvo?.tipo === 'ambiente';
  const desenhandoParede = ferramenta.modo === 'parede' && !ferramenta.alvo;
  const dica = calibrada ? undefined : DICA_ESCALA;

  return (
    <div>
      <h3>Desenhar</h3>
      <div className="linha">
        <button
          type="button"
          disabled={!calibrada}
          title={dica}
          className={desenhandoAmbiente('poligono') ? 'ativo' : ''}
          onClick={() => definir({ modo: 'poligono', alvo: alvoAmbiente(proximoNome) })}
        >
          Ambiente (polígono)
        </button>
        <button
          type="button"
          disabled={!calibrada}
          title={dica}
          className={desenhandoAmbiente('retangulo') ? 'ativo' : ''}
          onClick={() => definir({ modo: 'retangulo', alvo: alvoAmbiente(proximoNome) })}
        >
          Ambiente (retângulo)
        </button>
        <button
          type="button"
          disabled={!calibrada}
          title={dica}
          className={desenhandoParede ? 'ativo' : ''}
          onClick={() => definir({ modo: 'parede' })}
        >
          Parede
        </button>
      </div>
      {!calibrada && <p className="aviso">{DICA_ESCALA}.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- esquadrias

function SecaoEsquadrias({ calibrada }: { calibrada: boolean }) {
  const esquadrias = useLevantamento((s) => s.projeto.esquadrias);
  const elementos = useLevantamento((s) => s.projeto.elementos);
  const ferramenta = useLevantamento((s) => s.ferramenta);
  const posicionadas = contarPosicionadas(elementos);
  const st = () => useLevantamento.getState();

  const adicionar = (categoria: Categoria) =>
    st().salvarEsquadria({ id: novoId(), codigo: proximoCodigo(esquadrias, categoria), ...ESQUADRIA_NOVA[categoria] });
  const remover = (t: TipoEsquadria) => {
    const n = posicionadas[t.id] ?? 0;
    const pergunta =
      n > 0
        ? `Remover ${t.codigo} do cadastro? ${n} ${n === 1 ? 'esquadria posicionada ficará' : 'esquadrias posicionadas ficarão'} sem tipo (alerta).`
        : `Remover ${t.codigo} do cadastro?`;
    if (window.confirm(pergunta)) st().removerEsquadria(t.id);
  };
  const posicionando = (t: TipoEsquadria) =>
    ferramenta.modo === 'ponto' &&
    ferramenta.alvo?.tipo === 'esquadria' &&
    (ferramenta.alvo.props as { tipoEsquadriaId?: string }).tipoEsquadriaId === t.id;

  return (
    <div className="secao">
      <h3>Esquadrias</h3>
      {esquadrias.length === 0 ? (
        <p className="suave arq-nota">Nenhum tipo cadastrado. Adicione portas e janelas para posicioná-las nas paredes.</p>
      ) : (
        <table className="arq-tabela">
          <thead>
            <tr>
              <th>Cód.</th>
              <th>Tipo</th>
              <th className="num">L (m)</th>
              <th className="num">H (m)</th>
              <th className="num">Peit.</th>
              <th className="num">Qtd.</th>
            </tr>
          </thead>
          <tbody>
            {esquadrias.map((t) => {
              const salvar = (patch: Partial<TipoEsquadria>) => st().salvarEsquadria({ ...t, ...patch });
              const n = posicionadas[t.id] ?? 0;
              return [
                <tr key={t.id} className="arq-dados">
                  <td>
                    <EntradaTexto valor={t.codigo} rotuloAcessivel="Código" aoMudar={(codigo) => salvar({ codigo })} />
                  </td>
                  <td>
                    <select
                      value={t.categoria}
                      aria-label="Categoria"
                      onChange={(e) => salvar({ categoria: e.target.value as Categoria })}
                    >
                      <option value="porta">{ROTULO_CATEGORIA.porta}</option>
                      <option value="janela">{ROTULO_CATEGORIA.janela}</option>
                    </select>
                  </td>
                  <td>
                    <EntradaNumero valor={t.largura} rotuloAcessivel="Largura (m)" aoMudar={(v) => v !== null && salvar({ largura: v })} />
                  </td>
                  <td>
                    <EntradaNumero valor={t.altura} rotuloAcessivel="Altura (m)" aoMudar={(v) => v !== null && salvar({ altura: v })} />
                  </td>
                  <td>
                    <EntradaNumero
                      valor={t.peitoril}
                      aceita={naoNegativo}
                      rotuloAcessivel="Peitoril (m)"
                      aoMudar={(v) => v !== null && salvar({ peitoril: v })}
                    />
                  </td>
                  <td>
                    <EntradaNumero
                      valor={t.quantidade}
                      aceita={inteiroNaoNegativo}
                      rotuloAcessivel="Quantidade prevista"
                      aoMudar={(v) => v !== null && salvar({ quantidade: v })}
                    />
                  </td>
                </tr>,
                <tr key={`${t.id}:acoes`} className="arq-acoes">
                  <td colSpan={6}>
                    <div className="linha">
                      <button
                        type="button"
                        disabled={!calibrada}
                        title={calibrada ? 'Clique sobre uma parede na planta' : DICA_ESCALA}
                        className={posicionando(t) ? 'ativo' : ''}
                        onClick={() =>
                          st().definirFerramenta({
                            modo: 'ponto',
                            alvo: { tipo: 'esquadria', props: { tipoEsquadriaId: t.id }, rotulo: t.codigo },
                          })
                        }
                      >
                        Posicionar
                      </button>
                      <span className={n === t.quantidade ? 'suave' : 'arq-difere'}>
                        posicionadas {n} de {t.quantidade}
                      </span>
                      <span style={{ flex: 1 }} />
                      <button type="button" onClick={() => remover(t)}>
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      )}
      <div className="linha">
        <button type="button" onClick={() => adicionar('porta')}>
          + Porta
        </button>
        <button type="button" onClick={() => adicionar('janela')}>
          + Janela
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- ambientes

function EdicaoAmbiente({ el, escala }: { el: Ambiente; escala: number | null }) {
  const peDireitoGeral = useLevantamento((s) => s.projeto.parametros.gerais.peDireito);
  const st = () => useLevantamento.getState();
  const props = (patch: Partial<PropsAmbiente>) => st().atualizarElemento(el.id, { props: patch });
  const m = escala === null ? null : medidasAmbiente(el, escala);
  const areaManual = el.manuais?.[MANUAL_AREA];

  const definirAreaManual = (valor: number | null) => {
    const { [MANUAL_AREA]: _anterior, ...resto } = el.manuais ?? {};
    const manuais = valor === null ? resto : { ...resto, [MANUAL_AREA]: valor };
    st().atualizarElemento(el.id, { manuais: Object.keys(manuais).length > 0 ? manuais : undefined });
  };
  const trocarTipo = (tipoAmbiente: TipoAmbiente) =>
    props(TIPOS_AREA_MOLHADA.includes(tipoAmbiente) ? { tipoAmbiente, areaMolhada: true } : { tipoAmbiente });
  const excluir = () => {
    if (window.confirm(`Excluir o ambiente “${nomeAmbiente(el)}”?`)) st().removerElementos([el.id]);
  };

  return (
    <div className="arq-edicao">
      <label className="campo">
        <span>Nome</span>
        <EntradaTexto valor={el.props.nome} aoMudar={(nome) => st().atualizarElemento(el.id, { props: { nome }, rotulo: nome })} />
      </label>
      <label className="campo">
        <span>Tipo</span>
        <select value={el.props.tipoAmbiente} onChange={(e) => trocarTipo(e.target.value as TipoAmbiente)}>
          {(Object.keys(ROTULO_TIPO_AMBIENTE) as TipoAmbiente[]).map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO_AMBIENTE[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="campo">
        <span>Área molhada</span>
        <input type="checkbox" checked={el.props.areaMolhada} onChange={(e) => props({ areaMolhada: e.target.checked })} />
      </label>
      <label className="campo">
        <span>Coberto</span>
        <input type="checkbox" checked={el.props.coberto} onChange={(e) => props({ coberto: e.target.checked })} />
      </label>
      <label className="campo">
        <span>Pé-direito próprio (m)</span>
        <EntradaNumero
          valor={el.props.peDireito ?? null}
          permiteVazio
          placeholder={peDireitoGeral === null ? 'opcional' : `geral: ${formatarNumero(peDireitoGeral)}`}
          aoMudar={(v) => props({ peDireito: v })}
        />
      </label>
      {(el.props.peDireito ?? peDireitoGeral) === null && (
        <p className="alerta-faltante arq-nota">
          <strong>Dado faltante</strong> — sem pé-direito, a área de parede e os acabamentos de parede deste ambiente não são calculados.
        </p>
      )}
      <label className="campo">
        <span>Área manual (m²)</span>
        <EntradaNumero
          valor={areaManual ?? null}
          permiteVazio
          placeholder={m && !m.areaManual ? `medida: ${formatarNumero(m.area)}` : 'opcional'}
          aoMudar={definirAreaManual}
        />
      </label>
      {areaManual !== undefined && (
        <div className="linha arq-nota">
          <span className="selo selo-manual">valor manual</span>
          <span className="suave">substitui a área medida no desenho</span>
          <button type="button" onClick={() => definirAreaManual(null)}>
            Remover valor manual
          </button>
        </div>
      )}
      <div className="linha">
        <button type="button" onClick={excluir}>
          Excluir ambiente
        </button>
      </div>
    </div>
  );
}

function EdicaoParede({ el, nome, escala }: { el: Parede; nome: string; escala: number | null }) {
  const peDireitoGeral = useLevantamento((s) => s.projeto.parametros.gerais.peDireito);
  const atualizar = (patch: Partial<Parede['props']>) => useLevantamento.getState().atualizarElemento(el.id, { props: patch });
  const c = escala === null ? null : comprimentoParede(el, escala);

  return (
    <div className="secao">
      <h3>Parede selecionada</h3>
      <div className="arq-edicao">
        <p className="arq-nota">
          <strong>{nome}</strong>{' '}
          <span className="suave">{c ? `— ${formatarNumero(c.comprimento)} m` : '— página sem escala'}</span>
        </p>
        <label className="campo">
          <span>Espessura (m)</span>
          <EntradaNumero valor={el.props.espessura} permiteVazio placeholder="ex.: 0,15" aoMudar={(v) => atualizar({ espessura: v })} />
        </label>
        {el.props.espessura === null && (
          <p className="alerta-faltante arq-nota">
            <strong>Dado faltante</strong> — espessura da parede não informada.
          </p>
        )}
        <label className="campo">
          <span>Altura própria (m)</span>
          <EntradaNumero
            valor={el.props.altura ?? null}
            permiteVazio
            placeholder={peDireitoGeral === null ? 'opcional' : `pé-direito: ${formatarNumero(peDireitoGeral)}`}
            aoMudar={(v) => atualizar({ altura: v })}
          />
        </label>
        {(el.props.altura ?? peDireitoGeral) === null && (
          <p className="alerta-faltante arq-nota">
            <strong>Dado faltante</strong> — sem pé-direito ou altura própria, a alvenaria desta parede não é calculada.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- painel

export function PainelArquitetura() {
  const projeto = useLevantamento((s) => s.projeto);
  const pagina = useLevantamento((s) => s.paginaAtual);
  const selecaoIds = useLevantamento((s) => s.selecaoIds);

  const calibrada = escalaDaPagina(projeto, pagina) !== null;
  const ambientes = projeto.elementos.filter((e): e is Ambiente => e.tipo === 'ambiente');
  const selecionado = selecaoIds.length === 1 ? projeto.elementos.find((e) => e.id === selecaoIds[0]) : undefined;
  const proximoNome = proximoNomeAmbiente(projeto.elementos);

  // A ferramenta continua ativa depois de cada desenho: o próximo ambiente recebe o próximo nome.
  useEffect(() => {
    const { ferramenta, definirFerramenta } = useLevantamento.getState();
    if (ferramenta.alvo?.tipo === 'ambiente' && ferramenta.alvo.rotulo !== proximoNome) {
      definirFerramenta({ modo: ferramenta.modo, alvo: alvoAmbiente(proximoNome) });
    }
  }, [proximoNome]);

  const selecionar = (el: Ambiente) => {
    const st = useLevantamento.getState();
    if (el.pagina !== st.paginaAtual) st.definirPagina(el.pagina);
    st.selecionar([el.id]);
  };

  return (
    <div>
      <SecaoDesenhar calibrada={calibrada} proximoNome={proximoNome} />
      <SecaoEsquadrias calibrada={calibrada} />

      <div className="secao">
        <h3>Ambientes</h3>
        {ambientes.length === 0 ? (
          <p className="suave arq-nota">Nenhum ambiente desenhado.</p>
        ) : (
          <ul className="arq-lista">
            {ambientes.map((el) => {
              const escala = escalaDaPagina(projeto, el.pagina);
              const m = escala === null ? null : medidasAmbiente(el, escala);
              const ativo = selecionado?.id === el.id;
              return (
                <li key={el.id}>
                  <button type="button" className={ativo ? 'ativo' : ''} onClick={() => selecionar(el)}>
                    <span className={`arq-nome${el.status === 'pendente' ? ' pendente' : ''}`}>
                      {nomeAmbiente(el)}
                      {projeto.totalPaginas > 1 && <span className="suave"> · pág. {el.pagina}</span>}
                    </span>
                    {m ? (
                      <span className="arq-medida">
                        {formatarNumero(m.area)} m²{m.areaManual && <span className="selo-manual"> (manual)</span>} ·{' '}
                        {formatarNumero(m.perimetro)} m
                      </span>
                    ) : (
                      <span className="alerta-faltante">sem escala</span>
                    )}
                  </button>
                  {ativo && <EdicaoAmbiente el={el} escala={escala} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selecionado?.tipo === 'parede' && (
        <EdicaoParede
          el={selecionado}
          nome={nomesDasParedes(projeto.elementos).get(selecionado.id) ?? ''}
          escala={escalaDaPagina(projeto, selecionado.pagina)}
        />
      )}
    </div>
  );
}
