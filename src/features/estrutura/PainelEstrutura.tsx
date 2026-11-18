/** Etapa 3, aba Estrutura: aviso fixo, sugestão automática, pendentes, elemento selecionado e parâmetros. */
import { useEffect, useState } from 'react';
import type { AlvoDesenho, Elemento, FuncaoCalha, ModoFerramenta, PatchParametros, PropsTelhado, TipoFundacao, TipoLaje, TipoTelha } from '@/core/model';
import { AVISO_ESTRUTURA } from '@/core/model';
import { arredondar, escalaValida, formatarNumero, lerNumero } from '@/core/calc';
import { useLevantamento } from '@/core/store';
import { alturaDoCondutor, alturaDoPilar } from './calcular';
import { PREFIXO_CALHA, PREFIXO_TELHADO, ROTULO_FUNCAO_CALHA, ROTULO_TIPO_LAJE, ROTULO_TIPO_TELHA } from './config';
import { proximoRotulo, sugerirEstrutura } from './sugerir';

const CM = 100; // fator de exibição: metros → centímetros
const CASAS_GRAVACAO = 6;
const TIPOS_LAJE = Object.keys(ROTULO_TIPO_LAJE) as TipoLaje[];
const TIPOS_TELHA = Object.keys(ROTULO_TIPO_TELHA) as TipoTelha[];

/** Ferramentas de desenho da cobertura: o que cada botão cria. */
type Desenho = 'telhado' | FuncaoCalha;
const MODO_DESENHO: Record<Desenho, ModoFerramenta> = { telhado: 'poligono', calha: 'polilinha', rufo: 'polilinha', condutor: 'ponto' };
const TEXTO_DESENHO: Record<Desenho, string> = { telhado: 'Telhado', calha: 'Calha', rufo: 'Rufo', condutor: 'Condutor' };

function alvoDesenho(desenho: Desenho, elementos: Elemento[], beiral: number): AlvoDesenho {
  if (desenho === 'telhado') {
    const props: PropsTelhado = { tipoTelha: null, inclinacaoPct: null, aguas: 2, direcao: 'horizontal', beiral };
    return { tipo: 'telhado', props, rotulo: proximoRotulo(elementos, 'telhado', PREFIXO_TELHADO) };
  }
  return { tipo: 'calha', props: { funcao: desenho }, rotulo: proximoRotulo(elementos, 'calha', PREFIXO_CALHA[desenho]) };
}

const desenhoDoAlvo = (alvo: AlvoDesenho | undefined): Desenho | null =>
  alvo?.tipo === 'telhado' ? 'telhado' : alvo?.tipo === 'calha' ? (alvo.props as { funcao: FuncaoCalha }).funcao : null;
const ROTULO_FUNDACAO: Record<TipoFundacao, string> = {
  sapata: 'Sapata',
  'bloco-estaca': 'Bloco + estaca(s)',
  radier: 'Radier',
};

interface PropsCampo {
  rotulo: string;
  /** Valor em unidade do modelo (m, kg/m³...). null = vazio. */
  valor: number | null;
  aoMudar: (valor: number) => void;
  /** Multiplicador de exibição (100 = mostra em cm). */
  fator?: number;
  casas?: number;
  /** Se informado, o campo pode ser apagado (volta ao valor automático). */
  aoLimpar?: () => void;
  dica?: string;
}

/** Campo numérico pt-BR: aceita vírgula, grava ao sair do campo ou com Enter; inválido (≤ 0) é desfeito. */
function CampoNumero({ rotulo, valor, aoMudar, fator = 1, casas = 2, aoLimpar, dica }: PropsCampo) {
  const exibido = valor === null ? '' : formatarNumero(valor * fator, casas);
  const [texto, definirTexto] = useState(exibido);
  useEffect(() => definirTexto(exibido), [exibido]);
  const gravar = () => {
    if (texto.trim() === '' && aoLimpar) return aoLimpar();
    const lido = lerNumero(texto);
    if (lido === null || lido <= 0) return definirTexto(exibido);
    aoMudar(arredondar(lido / fator, CASAS_GRAVACAO));
    definirTexto(exibido);
  };
  return (
    <label className="campo">
      <span>{rotulo}</span>
      <input
        inputMode="decimal"
        value={texto}
        placeholder={dica}
        onChange={(e) => definirTexto(e.target.value)}
        onBlur={gravar}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  );
}

function CampoSecao(p: { nome: string; b: number; h: number; aoMudar: (patch: { secaoB?: number; secaoH?: number }) => void }) {
  return (
    <>
      <CampoNumero rotulo={`${p.nome} — largura (cm)`} valor={p.b} fator={CM} casas={1} aoMudar={(secaoB) => p.aoMudar({ secaoB })} />
      <CampoNumero rotulo={`${p.nome} — altura (cm)`} valor={p.h} fator={CM} casas={1} aoMudar={(secaoH) => p.aoMudar({ secaoH })} />
    </>
  );
}

function ElementoSelecionado({ elemento }: { elemento: Elemento }) {
  const projeto = useLevantamento((s) => s.projeto);
  const { atualizarElemento, confirmarElementos, removerElementos } = useLevantamento.getState();
  const props = (patch: Record<string, unknown>) => atualizarElemento(elemento.id, { props: patch });
  const pendente = elemento.status === 'pendente';
  return (
    <div className="secao">
      <h3>
        Selecionado: {elemento.rotulo ?? elemento.tipo} {pendente && <span className="pendente">(pendente)</span>}
      </h3>
      {elemento.tipo === 'pilar' && (
        <>
          <CampoSecao nome="Seção" b={elemento.props.secaoB} h={elemento.props.secaoH} aoMudar={props} />
          <CampoNumero
            rotulo="Altura própria (m)"
            valor={elemento.props.altura ?? null}
            dica="automática"
            aoMudar={(altura) => props({ altura })}
            aoLimpar={() => props({ altura: null })}
          />
          {(elemento.props.altura ?? null) === null &&
            (() => {
              const altura = alturaDoPilar(elemento, projeto);
              return altura === null ? (
                <p className="alerta-faltante">Dado faltante: pé-direito (etapa 2).</p>
              ) : (
                <p className="suave">Altura automática: {formatarNumero(altura)} m (pé-direito + viga superior).</p>
              );
            })()}
        </>
      )}
      {(elemento.tipo === 'viga-baldrame' || elemento.tipo === 'viga-superior') && (
        <CampoSecao nome="Seção" b={elemento.props.secaoB} h={elemento.props.secaoH} aoMudar={props} />
      )}
      {elemento.tipo === 'laje' && (
        <>
          <label className="campo">
            <span>Tipo de laje</span>
            <select value={elemento.props.tipoLaje} onChange={(e) => props({ tipoLaje: e.target.value })}>
              {TIPOS_LAJE.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO_LAJE[t]}
                </option>
              ))}
            </select>
          </label>
          <CampoNumero rotulo="Espessura (cm)" valor={elemento.props.espessura} fator={CM} casas={1} aoMudar={(espessura) => props({ espessura })} />
        </>
      )}
      {elemento.tipo === 'telhado' && (
        <>
          <label className="campo">
            <span>Tipo de telha</span>
            <select
              className={elemento.props.tipoTelha === null ? 'alerta-faltante' : ''}
              value={elemento.props.tipoTelha ?? ''}
              onChange={(e) => props({ tipoTelha: e.target.value === '' ? null : e.target.value })}
            >
              <option value="">— informe —</option>
              {TIPOS_TELHA.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO_TELHA[t]}
                </option>
              ))}
            </select>
          </label>
          {elemento.props.tipoTelha === null && (
            <p className="alerta-faltante">Dado faltante: tipo de telha (telhamento, madeiramento e cumeeira ficam fora).</p>
          )}
          <CampoNumero
            rotulo="Inclinação própria (%)"
            valor={elemento.props.inclinacaoPct}
            casas={0}
            dica={
              elemento.props.tipoTelha === null
                ? 'do tipo'
                : formatarNumero(projeto.parametros.estrutura.cobertura.inclinacaoPct[elemento.props.tipoTelha], 0)
            }
            aoMudar={(inclinacaoPct) => props({ inclinacaoPct })}
            aoLimpar={() => props({ inclinacaoPct: null })}
          />
          <label className="campo">
            <span>Águas</span>
            <select value={elemento.props.aguas} onChange={(e) => props({ aguas: Number(e.target.value) })}>
              <option value={1}>1 água</option>
              <option value={2}>2 águas</option>
              <option value={4}>4 águas</option>
            </select>
          </label>
          {elemento.props.aguas !== 4 && (
            <label className="campo">
              <span>{elemento.props.aguas === 1 ? 'Caimento' : 'Cumeeira'}</span>
              <select value={elemento.props.direcao} onChange={(e) => props({ direcao: e.target.value })}>
                <option value="horizontal">Horizontal na planta</option>
                <option value="vertical">Vertical na planta</option>
              </select>
            </label>
          )}
        </>
      )}
      {elemento.tipo === 'calha' &&
        (elemento.props.funcao === 'condutor' ? (
          <>
            <CampoNumero
              rotulo="Diâmetro (mm)"
              valor={elemento.props.diametroMm ?? null}
              casas={0}
              dica={formatarNumero(projeto.parametros.estrutura.cobertura.diametroCondutorMm, 0)}
              aoMudar={(diametroMm) => props({ diametroMm })}
              aoLimpar={() => props({ diametroMm: null })}
            />
            {alturaDoCondutor(elemento, projeto) === null ? (
              <p className="alerta-faltante">Dado faltante: pé-direito ou altura do condutor.</p>
            ) : (
              <p className="suave">Comprimento: {formatarNumero(alturaDoCondutor(elemento, projeto)!)} m.</p>
            )}
          </>
        ) : (
          <CampoNumero
            rotulo={`${ROTULO_FUNCAO_CALHA[elemento.props.funcao]} — desenvolvimento (cm)`}
            valor={elemento.props.desenvolvimentoCm ?? null}
            casas={0}
            dica={formatarNumero(
              elemento.props.funcao === 'calha'
                ? projeto.parametros.estrutura.cobertura.desenvolvimentoCalhaCm
                : projeto.parametros.estrutura.cobertura.desenvolvimentoRufoCm,
              0,
            )}
            aoMudar={(desenvolvimentoCm) => props({ desenvolvimentoCm })}
            aoLimpar={() => props({ desenvolvimentoCm: null })}
          />
        ))}
      {elemento.tipo === 'fundacao' && <p className="suave">{ROTULO_FUNDACAO[elemento.props.tipoFundacao]} — dimensões nos parâmetros abaixo.</p>}
      <div className="linha">
        {pendente && (
          <button type="button" className="primario" onClick={() => confirmarElementos([elemento.id])}>
            Aceitar
          </button>
        )}
        <button type="button" onClick={() => removerElementos([elemento.id])}>
          {pendente ? 'Descartar' : 'Remover'}
        </button>
      </div>
    </div>
  );
}

export function PainelEstrutura() {
  const projeto = useLevantamento((s) => s.projeto);
  const pagina = useLevantamento((s) => s.paginaAtual);
  const selecaoIds = useLevantamento((s) => s.selecaoIds);
  const est = projeto.parametros.estrutura;
  const estado = useLevantamento.getState;
  const mudar = (patch: NonNullable<PatchParametros['estrutura']>) => estado().atualizarParametros({ estrutura: patch });

  const temEscala = escalaValida(projeto.paginas[pagina]?.escala);
  const temParedes = projeto.elementos.some(
    (e) => e.pagina === pagina && (e.tipo === 'parede' || (e.tipo === 'ambiente' && e.props.coberto === true)),
  );
  const motivo = !temEscala
    ? 'Calibre a escala desta página (etapa 1) para sugerir a estrutura.'
    : !temParedes
      ? 'Desenhe as paredes desta página (aba Arquitetura) para sugerir a estrutura.'
      : null;
  const cob = est.cobertura;
  const ferramenta = useLevantamento((s) => s.ferramenta);
  const desenhoAtivo = desenhoDoAlvo(ferramenta.alvo);

  // A ferramenta continua ativa depois de cada desenho: o próximo elemento recebe o próximo rótulo.
  useEffect(() => {
    if (desenhoAtivo === null) return;
    const alvo = alvoDesenho(desenhoAtivo, projeto.elementos, cob.beiral);
    if (alvo.rotulo !== ferramenta.alvo?.rotulo) estado().definirFerramenta({ modo: ferramenta.modo, alvo });
  }, [projeto.elementos, desenhoAtivo]); // eslint-disable-line react-hooks/exhaustive-deps

  const desenhar = (d: Desenho) =>
    estado().definirFerramenta(
      desenhoAtivo === d ? { modo: 'selecionar' } : { modo: MODO_DESENHO[d], alvo: alvoDesenho(d, estado().projeto.elementos, cob.beiral) },
    );
  const funcaoCalha = (e: Elemento) => (e.tipo === 'calha' ? e.props.funcao : null);

  const pendentes = projeto.elementos.filter((e) => e.disciplina === 'estrutura' && e.status === 'pendente');
  const conta = (...tipos: Elemento['tipo'][]) => pendentes.filter((e) => tipos.includes(e.tipo)).length;
  const selecionado = projeto.elementos.find((e) => e.disciplina === 'estrutura' && selecaoIds.includes(e.id));
  const fundacao = est.fundacao;

  return (
    <div>
      <p className="aviso" role="note">
        {AVISO_ESTRUTURA}
      </p>

      <div className="linha">
        <button
          type="button"
          className="primario"
          disabled={motivo !== null}
          title={motivo ?? 'Pilares, vigas, lajes, fundações e cobertura a partir das paredes e ambientes desta página'}
          onClick={() => estado().substituirSugestoes('estrutura', sugerirEstrutura(estado().projeto, pagina), pagina)}
        >
          Sugerir estrutura
        </button>
      </div>
      {motivo && <p className="alerta-faltante">{motivo}</p>}

      {pendentes.length > 0 && (
        <div className="secao">
          <p className="pendente">
            Sugestões pendentes: {conta('pilar')} pilares, {conta('viga-baldrame', 'viga-superior')} vigas, {conta('laje')} lajes,{' '}
            {conta('fundacao')} fundações, {conta('telhado')} telhados,{' '}
            {pendentes.filter((e) => funcaoCalha(e) === 'calha' || funcaoCalha(e) === 'rufo').length} calhas/rufos,{' '}
            {pendentes.filter((e) => funcaoCalha(e) === 'condutor').length} condutores.
          </p>
          <div className="linha">
            <button type="button" className="primario" onClick={() => estado().confirmarPendentes('estrutura')}>
              Aceitar todas
            </button>
            <button type="button" onClick={() => estado().descartarPendentes('estrutura')}>
              Descartar todas
            </button>
          </div>
          <p className="suave">Selecione um elemento na planta para aceitar, editar ou descartar individualmente.</p>
        </div>
      )}

      {selecionado && <ElementoSelecionado key={selecionado.id} elemento={selecionado} />}

      <div className="secao">
        <h3>Pilares e vãos</h3>
        <CampoSecao nome="Pilar" b={est.pilar.secaoB} h={est.pilar.secaoH} aoMudar={(pilar) => mudar({ pilar })} />
        <CampoNumero rotulo="Vão máximo entre pilares (m)" valor={est.vaoMaximo} aoMudar={(vaoMaximo) => mudar({ vaoMaximo })} />
        <CampoNumero rotulo="Distância de fusão (m)" valor={est.distanciaFusao} aoMudar={(distanciaFusao) => mudar({ distanciaFusao })} />
      </div>

      <div className="secao">
        <h3>Vigas</h3>
        <CampoSecao nome="Baldrame" b={est.baldrame.secaoB} h={est.baldrame.secaoH} aoMudar={(baldrame) => mudar({ baldrame })} />
        <label className="linha">
          <input type="checkbox" checked={est.vigaSuperior.ativa} onChange={(e) => mudar({ vigaSuperior: { ativa: e.target.checked } })} />
          Viga superior (cinta/respaldo)
        </label>
        {est.vigaSuperior.ativa && (
          <CampoSecao
            nome="Viga superior"
            b={est.vigaSuperior.secaoB}
            h={est.vigaSuperior.secaoH}
            aoMudar={(vigaSuperior) => mudar({ vigaSuperior })}
          />
        )}
      </div>

      <div className="secao">
        <h3>Concreto e aço</h3>
        <CampoNumero rotulo="fck (MPa)" valor={est.fck} casas={0} aoMudar={(fck) => mudar({ fck })} />
        <CampoNumero rotulo="Cobrimento (cm)" valor={est.cobrimento} fator={CM} casas={1} aoMudar={(cobrimento) => mudar({ cobrimento })} />
        <label className="campo">
          <span>Aço de vigas e pilares</span>
          <select value={est.aco.modo} onChange={(e) => mudar({ aco: { modo: e.target.value as 'taxa' | 'detalhado' } })}>
            <option value="taxa">Por taxa</option>
            <option value="detalhado">Detalhado</option>
          </select>
        </label>
        {est.aco.modo === 'taxa' ? (
          <>
            <CampoNumero rotulo="Taxa — pilares (kg/m³)" valor={est.aco.taxaPilar} casas={0} aoMudar={(taxaPilar) => mudar({ aco: { taxaPilar } })} />
            <CampoNumero rotulo="Taxa — vigas (kg/m³)" valor={est.aco.taxaViga} casas={0} aoMudar={(taxaViga) => mudar({ aco: { taxaViga } })} />
          </>
        ) : (
          <>
            <CampoNumero
              rotulo="Barras longitudinais (nº)"
              valor={est.aco.detalhado.barrasLongitudinais}
              casas={0}
              aoMudar={(n) => mudar({ aco: { detalhado: { barrasLongitudinais: Math.round(n) } } })}
            />
            <CampoNumero
              rotulo="Bitola longitudinal (mm)"
              valor={est.aco.detalhado.bitolaLongitudinalMm}
              casas={1}
              aoMudar={(bitolaLongitudinalMm) => mudar({ aco: { detalhado: { bitolaLongitudinalMm } } })}
            />
            <CampoNumero
              rotulo="Bitola do estribo (mm)"
              valor={est.aco.detalhado.bitolaEstriboMm}
              casas={1}
              aoMudar={(bitolaEstriboMm) => mudar({ aco: { detalhado: { bitolaEstriboMm } } })}
            />
            <CampoNumero
              rotulo="Espaçamento dos estribos (cm)"
              valor={est.aco.detalhado.espacamentoEstribo}
              fator={CM}
              casas={1}
              aoMudar={(espacamentoEstribo) => mudar({ aco: { detalhado: { espacamentoEstribo } } })}
            />
          </>
        )}
        <CampoNumero rotulo="Taxa — lajes maciças (kg/m³)" valor={est.aco.taxaLaje} casas={0} aoMudar={(taxaLaje) => mudar({ aco: { taxaLaje } })} />
        <CampoNumero rotulo="Taxa — fundações (kg/m³)" valor={est.aco.taxaFundacao} casas={0} aoMudar={(taxaFundacao) => mudar({ aco: { taxaFundacao } })} />
      </div>

      <div className="secao">
        <h3>Lajes</h3>
        <label className="campo">
          <span>Tipo</span>
          <select value={est.laje.tipo} onChange={(e) => mudar({ laje: { tipo: e.target.value as TipoLaje } })}>
            {TIPOS_LAJE.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO_LAJE[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Divisão</span>
          <select value={est.laje.modo} onChange={(e) => mudar({ laje: { modo: e.target.value as 'por-ambiente' | 'uniao' } })}>
            <option value="por-ambiente">Por ambiente</option>
            <option value="uniao">União de ambientes</option>
          </select>
        </label>
        <CampoNumero rotulo="Espessura total (cm)" valor={est.laje.espessura} fator={CM} casas={1} aoMudar={(espessura) => mudar({ laje: { espessura } })} />
        {est.laje.tipo !== 'macica' && (
          <CampoNumero rotulo="Intereixo das treliças (cm)" valor={est.laje.intereixo} fator={CM} casas={1} aoMudar={(intereixo) => mudar({ laje: { intereixo } })} />
        )}
      </div>

      <div className="secao">
        <h3>Fundações</h3>
        <label className="campo">
          <span>Tipo</span>
          <select value={fundacao.tipo} onChange={(e) => mudar({ fundacao: { tipo: e.target.value as TipoFundacao } })}>
            {(Object.keys(ROTULO_FUNDACAO) as TipoFundacao[]).map((t) => (
              <option key={t} value={t}>
                {ROTULO_FUNDACAO[t]}
              </option>
            ))}
          </select>
        </label>
        {fundacao.tipo === 'sapata' && (
          <>
            <CampoNumero rotulo="Lado A (m)" valor={fundacao.sapata.ladoA} aoMudar={(ladoA) => mudar({ fundacao: { sapata: { ladoA } } })} />
            <CampoNumero rotulo="Lado B (m)" valor={fundacao.sapata.ladoB} aoMudar={(ladoB) => mudar({ fundacao: { sapata: { ladoB } } })} />
            <CampoNumero rotulo="Altura (m)" valor={fundacao.sapata.altura} aoMudar={(altura) => mudar({ fundacao: { sapata: { altura } } })} />
            <CampoNumero
              rotulo="Profundidade da escavação (m)"
              valor={fundacao.sapata.profundidade}
              aoMudar={(profundidade) => mudar({ fundacao: { sapata: { profundidade } } })}
            />
          </>
        )}
        {fundacao.tipo === 'bloco-estaca' && (
          <>
            <CampoNumero rotulo="Bloco — lado A (m)" valor={fundacao.bloco.ladoA} aoMudar={(ladoA) => mudar({ fundacao: { bloco: { ladoA } } })} />
            <CampoNumero rotulo="Bloco — lado B (m)" valor={fundacao.bloco.ladoB} aoMudar={(ladoB) => mudar({ fundacao: { bloco: { ladoB } } })} />
            <CampoNumero rotulo="Bloco — altura (m)" valor={fundacao.bloco.altura} aoMudar={(altura) => mudar({ fundacao: { bloco: { altura } } })} />
            <CampoNumero
              rotulo="Estacas por bloco (nº)"
              valor={fundacao.bloco.estacasPorBloco}
              casas={0}
              aoMudar={(n) => mudar({ fundacao: { bloco: { estacasPorBloco: Math.round(n) } } })}
            />
            <CampoNumero
              rotulo="Diâmetro da estaca (cm)"
              valor={fundacao.bloco.diametroEstaca}
              fator={CM}
              casas={1}
              aoMudar={(diametroEstaca) => mudar({ fundacao: { bloco: { diametroEstaca } } })}
            />
            <CampoNumero
              rotulo="Comprimento da estaca (m)"
              valor={fundacao.bloco.comprimentoEstaca}
              aoMudar={(comprimentoEstaca) => mudar({ fundacao: { bloco: { comprimentoEstaca } } })}
            />
          </>
        )}
        {fundacao.tipo === 'radier' && (
          <CampoNumero
            rotulo="Espessura do radier (cm)"
            valor={fundacao.radier.espessura}
            fator={CM}
            casas={1}
            aoMudar={(espessura) => mudar({ fundacao: { radier: { espessura } } })}
          />
        )}
        <CampoNumero
          rotulo="Lastro de concreto magro (cm)"
          valor={fundacao.espessuraLastro}
          fator={CM}
          casas={1}
          aoMudar={(espessuraLastro) => mudar({ fundacao: { espessuraLastro } })}
        />
      </div>

      <div className="secao">
        <h3>Cobertura</h3>
        <p className="suave">Telhado sugerido sem tipo de telha: informe no telhado selecionado. Estimativa, não é projeto de cobertura.</p>
        <div className="linha">
          {(Object.keys(MODO_DESENHO) as Desenho[]).map((d) => (
            <button
              key={d}
              type="button"
              disabled={!temEscala}
              className={desenhoAtivo === d ? 'ativo' : ''}
              title={!temEscala ? 'Calibre a escala desta página primeiro' : `Desenhar ${TEXTO_DESENHO[d].toLowerCase()} na planta`}
              onClick={() => desenhar(d)}
            >
              {TEXTO_DESENHO[d]}
            </button>
          ))}
        </div>
        <CampoNumero rotulo="Beiral (m)" valor={cob.beiral} aoMudar={(beiral) => mudar({ cobertura: { beiral } })} />
        {TIPOS_TELHA.map((t) => (
          <CampoNumero
            key={t}
            rotulo={`Inclinação — ${ROTULO_TIPO_TELHA[t].toLowerCase()} (%)`}
            valor={cob.inclinacaoPct[t]}
            casas={0}
            aoMudar={(v) => mudar({ cobertura: { inclinacaoPct: { [t]: v } } })}
          />
        ))}
        <CampoNumero
          rotulo="Calha por condutor (m)"
          valor={cob.calhaPorCondutorM}
          aoMudar={(calhaPorCondutorM) => mudar({ cobertura: { calhaPorCondutorM } })}
        />
        <CampoNumero
          rotulo="Altura do condutor (m)"
          valor={cob.alturaCondutor}
          dica="pé-direito"
          aoMudar={(alturaCondutor) => mudar({ cobertura: { alturaCondutor } })}
          aoLimpar={() => mudar({ cobertura: { alturaCondutor: null } })}
        />
        <CampoNumero
          rotulo="Desenvolvimento da calha (cm)"
          valor={cob.desenvolvimentoCalhaCm}
          casas={0}
          aoMudar={(desenvolvimentoCalhaCm) => mudar({ cobertura: { desenvolvimentoCalhaCm } })}
        />
        <CampoNumero
          rotulo="Desenvolvimento do rufo (cm)"
          valor={cob.desenvolvimentoRufoCm}
          casas={0}
          aoMudar={(desenvolvimentoRufoCm) => mudar({ cobertura: { desenvolvimentoRufoCm } })}
        />
        <CampoNumero
          rotulo="Diâmetro do condutor (mm)"
          valor={cob.diametroCondutorMm}
          casas={0}
          aoMudar={(diametroCondutorMm) => mudar({ cobertura: { diametroCondutorMm } })}
        />
        <p className="suave">Mudanças de parâmetros valem para a próxima sugestão; seções de elementos já criados são editadas no elemento.</p>
      </div>
    </div>
  );
}
