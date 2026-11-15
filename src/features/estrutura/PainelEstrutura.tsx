/** Etapa 3, aba Estrutura: aviso fixo, sugestão automática, pendentes, elemento selecionado e parâmetros. */
import { useEffect, useState } from 'react';
import type { Elemento, PatchParametros, TipoFundacao, TipoLaje } from '@/core/model';
import { AVISO_ESTRUTURA } from '@/core/model';
import { arredondar, escalaValida, formatarNumero, lerNumero } from '@/core/calc';
import { useLevantamento } from '@/core/store';
import { alturaDoPilar } from './calcular';
import { ROTULO_TIPO_LAJE } from './config';
import { sugerirEstrutura } from './sugerir';

const CM = 100; // fator de exibição: metros → centímetros
const CASAS_GRAVACAO = 6;
const TIPOS_LAJE = Object.keys(ROTULO_TIPO_LAJE) as TipoLaje[];
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
  const temParedes = projeto.elementos.some((e) => e.tipo === 'parede' && e.pagina === pagina);
  const motivo = !temEscala
    ? 'Calibre a escala desta página (etapa 1) para sugerir a estrutura.'
    : !temParedes
      ? 'Desenhe as paredes desta página (aba Arquitetura) para sugerir a estrutura.'
      : null;

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
          title={motivo ?? 'Pilares, vigas, lajes e fundações a partir das paredes e ambientes desta página'}
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
            {conta('fundacao')} fundações.
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
        <p className="suave">Mudanças de parâmetros valem para a próxima sugestão; seções de elementos já criados são editadas no elemento.</p>
      </div>
    </div>
  );
}
