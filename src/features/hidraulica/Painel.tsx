/** Painel da etapa 3, aba Hidráulica: sugestão de pontos, posicionamento, edição e parâmetros. */
import { useState } from 'react';
import type { Aparelho, ElementoDe, PropsPontoHidraulico, PropsTubo, SistemaHidraulico } from '@/core/model';
import { escalaValida, formatarNumero, lerNumero } from '@/core/calc';
import { useLevantamento } from '@/core/store';
import {
  APARELHOS,
  CASAS_COMPRIMENTO,
  LIGACOES_APARELHO,
  NOME_APARELHO,
  NOME_SISTEMA,
  ROTULO_APARELHO,
  ROTULO_CAIXA_INSPECAO,
  ROTULO_RESERVATORIO,
  SISTEMAS,
} from './config';
import { ambientesDaPagina, aparelhosDoAmbiente, propsPadraoPonto, sugerirHidraulica } from './sugestao';

type PontoH = ElementoDe<'ponto-hidraulico'>;
type Tubo = ElementoDe<'tubo'>;

const acoes = () => useLevantamento.getState();

const formatarCampo = (valor: number): string =>
  formatarNumero(valor, Number.isInteger(valor) ? 0 : CASAS_COMPRIMENTO);

interface CampoNumeroProps {
  rotulo: string;
  valor: number | null | undefined;
  aoMudar: (valor: number | null) => void;
  /** Campo vazio grava null (dado faltante / usar o parâmetro). */
  anulavel?: boolean;
  permiteZero?: boolean;
  placeholder?: string;
  faltante?: boolean;
}

/** Campo numérico pt-BR (aceita vírgula); grava ao sair do campo ou com Enter. */
function CampoNumero({ rotulo, valor, aoMudar, anulavel, permiteZero, placeholder, faltante }: CampoNumeroProps) {
  const [texto, definirTexto] = useState<string | null>(null);
  const exibido = texto ?? (valor === null || valor === undefined ? '' : formatarCampo(valor));
  const confirmar = () => {
    if (texto === null) return;
    const limpo = texto.trim();
    if (limpo === '') {
      if (anulavel) aoMudar(null);
    } else {
      const n = lerNumero(limpo);
      if (n !== null && (n > 0 || (permiteZero === true && n === 0))) aoMudar(n);
    }
    definirTexto(null);
  };
  return (
    <label className="campo">
      <span className={faltante ? 'alerta-faltante' : undefined}>{rotulo}</span>
      <input
        type="text"
        inputMode="decimal"
        value={exibido}
        placeholder={placeholder}
        onChange={(e) => definirTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}

function EditorPonto({ ponto }: { ponto: PontoH }) {
  const params = useLevantamento((s) => s.projeto.parametros.hidraulica);
  const { props } = ponto;
  const gravar = (patch: Partial<PropsPontoHidraulico>) => acoes().atualizarElemento(ponto.id, { props: patch });
  const trocarAparelho = (aparelho: Aparelho) =>
    acoes().atualizarElemento(ponto.id, {
      rotulo: ROTULO_APARELHO[aparelho],
      props: { ...propsPadraoPonto(aparelho, props.aguaQuente), diametroAF: null, diametroAQ: null, diametroEsgoto: null },
    });
  const marcar = (campo: 'aguaFria' | 'aguaQuente' | 'esgoto', rotulo: string) => (
    <label>
      <input type="checkbox" checked={props[campo]} onChange={(e) => gravar({ [campo]: e.target.checked })} /> {rotulo}
    </label>
  );
  return (
    <div className="secao">
      <h3>
        Ponto selecionado {ponto.status === 'pendente' && <span className="pendente">(pendente)</span>}
      </h3>
      <label className="campo">
        <span>Aparelho</span>
        <select value={props.aparelho} onChange={(e) => trocarAparelho(e.target.value as Aparelho)}>
          {APARELHOS.map((a) => (
            <option key={a} value={a}>
              {NOME_APARELHO[a]}
            </option>
          ))}
        </select>
      </label>
      <div className="linha">
        {marcar('aguaFria', 'Água fria')}
        {marcar('aguaQuente', 'Água quente')}
        {marcar('esgoto', 'Esgoto')}
      </div>
      {props.aguaFria && (
        <CampoNumero
          rotulo="Ø água fria (mm)"
          valor={props.diametroAF}
          placeholder={formatarCampo(params.diametroAFmm)}
          anulavel
          aoMudar={(v) => gravar({ diametroAF: v })}
        />
      )}
      {props.aguaQuente && (
        <CampoNumero
          rotulo="Ø água quente (mm)"
          valor={props.diametroAQ}
          placeholder={formatarCampo(params.diametroAQmm)}
          anulavel
          aoMudar={(v) => gravar({ diametroAQ: v })}
        />
      )}
      {props.esgoto && (
        <CampoNumero
          rotulo="Ø esgoto (mm)"
          valor={props.diametroEsgoto}
          placeholder={formatarCampo(params.diametroEsgotoMm[props.aparelho])}
          anulavel
          aoMudar={(v) => gravar({ diametroEsgoto: v })}
        />
      )}
      <p className="suave">Diâmetro vazio = valor dos parâmetros.</p>
      <div className="linha">
        {ponto.status === 'pendente' && (
          <button type="button" className="primario" onClick={() => acoes().confirmarElementos([ponto.id])}>
            Aceitar
          </button>
        )}
        <button type="button" onClick={() => acoes().removerElementos([ponto.id])}>
          {ponto.status === 'pendente' ? 'Descartar' : 'Remover'}
        </button>
      </div>
    </div>
  );
}

function EditorTubo({ tubo }: { tubo: Tubo }) {
  const gravar = (patch: Partial<PropsTubo>) => acoes().atualizarElemento(tubo.id, { props: patch });
  return (
    <div className="secao">
      <h3>Tubo selecionado — {NOME_SISTEMA[tubo.props.sistema]}</h3>
      <CampoNumero
        rotulo="Ø do tubo (mm)"
        valor={tubo.props.diametroMm}
        placeholder="do ponto"
        anulavel
        aoMudar={(v) => gravar({ diametroMm: v })}
      />
      <div className="linha">
        <button type="button" onClick={() => acoes().removerElementos([tubo.id])}>
          Remover
        </button>
      </div>
    </div>
  );
}

export function PainelHidraulica() {
  const projeto = useLevantamento((s) => s.projeto);
  const pagina = useLevantamento((s) => s.paginaAtual);
  const selecaoIds = useLevantamento((s) => s.selecaoIds);
  const [aparelhoManual, definirAparelhoManual] = useState<Aparelho>('lavatorio');
  const [sistemaRamal, definirSistemaRamal] = useState<SistemaHidraulico>('AF');

  const params = projeto.parametros.hidraulica;
  const pessoas = projeto.parametros.gerais.numeroPessoas;
  const temEscala = escalaValida(projeto.paginas[pagina]?.escala);
  const ambientes = ambientesDaPagina(projeto, pagina);
  const ambientesMolhados = ambientes.filter((a) => aparelhosDoAmbiente(a).length > 0);
  const pendentes = projeto.elementos.filter((e) => e.disciplina === 'hidraulica' && e.status === 'pendente').length;
  const selecionado = projeto.elementos.find((e) => selecaoIds.includes(e.id) && e.disciplina === 'hidraulica');

  const dicaSugerir = !temEscala
    ? 'Calibre a escala desta página primeiro.'
    : ambientesMolhados.length === 0
      ? 'Marque ambientes de banheiro, cozinha ou área de serviço nesta página.'
      : null;

  const gravarParametros = (patch: Partial<typeof params>) => acoes().atualizarParametros({ hidraulica: patch });
  const posicionar = (ferramenta: Parameters<ReturnType<typeof acoes>['definirFerramenta']>[0]) =>
    acoes().definirFerramenta(ferramenta);

  /** Grava a água quente no ambiente e nos pontos dele que aceitam água quente. */
  const definirAguaQuente = (ambienteId: string, aguaQuente: boolean) => {
    acoes().atualizarElemento(ambienteId, { props: { aguaQuente } });
    for (const e of projeto.elementos) {
      if (
        e.tipo === 'ponto-hidraulico' &&
        e.vinculos.ambienteId === ambienteId &&
        LIGACOES_APARELHO[e.props.aparelho].aceitaAguaQuente &&
        e.props.aguaQuente !== aguaQuente
      ) {
        acoes().atualizarElemento(e.id, { props: { aguaQuente } });
      }
    }
  };

  return (
    <div>
      <h3>Hidráulica e sanitária</h3>
      <div className="linha">
        <button
          type="button"
          className="primario"
          disabled={dicaSugerir !== null}
          title={dicaSugerir ?? undefined}
          onClick={() => acoes().substituirSugestoes('hidraulica', sugerirHidraulica(projeto, pagina), pagina)}
        >
          Sugerir pontos hidráulicos
        </button>
      </div>
      {dicaSugerir && <p className="suave">{dicaSugerir}</p>}
      {pendentes > 0 && (
        <div className="linha">
          <span className="pendente">{pendentes} pendente(s)</span>
          <button type="button" onClick={() => acoes().confirmarPendentes('hidraulica')}>
            Aceitar todas
          </button>
          <button type="button" onClick={() => acoes().descartarPendentes('hidraulica')}>
            Descartar todas
          </button>
        </div>
      )}

      {selecionado?.tipo === 'ponto-hidraulico' && <EditorPonto key={selecionado.id} ponto={selecionado} />}
      {selecionado?.tipo === 'tubo' && <EditorTubo key={selecionado.id} tubo={selecionado} />}

      <div className="secao">
        <h3>Posicionar na planta</h3>
        <div className="linha">
          <button
            type="button"
            disabled={!temEscala}
            onClick={() =>
              posicionar({ modo: 'ponto', alvo: { tipo: 'reservatorio', props: {}, rotulo: ROTULO_RESERVATORIO } })
            }
          >
            Posicionar reservatório
          </button>
          <button
            type="button"
            disabled={!temEscala}
            onClick={() =>
              posicionar({ modo: 'ponto', alvo: { tipo: 'caixa-inspecao', props: {}, rotulo: ROTULO_CAIXA_INSPECAO } })
            }
          >
            Posicionar caixa de inspeção
          </button>
        </div>
        <div className="linha">
          <select value={aparelhoManual} onChange={(e) => definirAparelhoManual(e.target.value as Aparelho)}>
            {APARELHOS.map((a) => (
              <option key={a} value={a}>
                {NOME_APARELHO[a]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!temEscala}
            onClick={() =>
              posicionar({
                modo: 'ponto',
                alvo: {
                  tipo: 'ponto-hidraulico',
                  props: propsPadraoPonto(aparelhoManual, false),
                  rotulo: ROTULO_APARELHO[aparelhoManual],
                },
              })
            }
          >
            Adicionar ponto
          </button>
        </div>
        <div className="linha">
          <select value={sistemaRamal} onChange={(e) => definirSistemaRamal(e.target.value as SistemaHidraulico)}>
            {SISTEMAS.filter((s) => s !== 'pluvial' || params.pluvial).map((s) => (
              <option key={s} value={s}>
                {NOME_SISTEMA[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!temEscala}
            title="Desenhe a rota começando ou terminando sobre o ponto atendido"
            onClick={() => posicionar({ modo: 'polilinha', alvo: { tipo: 'tubo', props: { sistema: sistemaRamal } } })}
          >
            Redesenhar ramal
          </button>
        </div>
        <p className="suave">O ramal redesenhado deve começar ou terminar sobre o ponto que ele atende.</p>
      </div>

      {ambientesMolhados.length > 0 && (
        <div className="secao">
          <h3>Água quente por ambiente</h3>
          {ambientesMolhados.map((a) => (
            <label key={a.id} className="linha">
              <input
                type="checkbox"
                checked={a.props.aguaQuente === true}
                onChange={(e) => definirAguaQuente(a.id, e.target.checked)}
              />
              {a.props.nome || a.rotulo || 'Ambiente'} — água quente
            </label>
          ))}
        </div>
      )}

      <div className="secao">
        <h3>Parâmetros</h3>
        <CampoNumero
          rotulo={pessoas === null ? 'Nº de pessoas — dado faltante' : 'Nº de pessoas'}
          valor={pessoas}
          faltante={pessoas === null}
          anulavel
          aoMudar={(v) => acoes().atualizarParametros({ gerais: { numeroPessoas: v } })}
        />
        <CampoNumero
          rotulo="Consumo per capita (L/dia)"
          valor={params.consumoPerCapitaL}
          aoMudar={(v) => v !== null && gravarParametros({ consumoPerCapitaL: v })}
        />
        <CampoNumero
          rotulo="Dias de reserva"
          valor={params.diasReserva}
          aoMudar={(v) => v !== null && gravarParametros({ diasReserva: v })}
        />
        <CampoNumero
          rotulo="Ø água fria (mm)"
          valor={params.diametroAFmm}
          aoMudar={(v) => v !== null && gravarParametros({ diametroAFmm: v })}
        />
        <CampoNumero
          rotulo="Ø água quente (mm)"
          valor={params.diametroAQmm}
          aoMudar={(v) => v !== null && gravarParametros({ diametroAQmm: v })}
        />
        <CampoNumero
          rotulo="Conexões diversas (%)"
          valor={params.percentualConexoesDiversas}
          permiteZero
          aoMudar={(v) => v !== null && gravarParametros({ percentualConexoesDiversas: v })}
        />
        <label className="linha">
          <input
            type="checkbox"
            checked={params.pluvial}
            onChange={(e) => gravarParametros({ pluvial: e.target.checked })}
          />
          Somar tubos de águas pluviais desenhados
        </label>
        <details>
          <summary className="suave">Ø de esgoto por aparelho (mm)</summary>
          {APARELHOS.filter((a) => LIGACOES_APARELHO[a].esgoto).map((a) => (
            <CampoNumero
              key={a}
              rotulo={NOME_APARELHO[a]}
              valor={params.diametroEsgotoMm[a]}
              aoMudar={(v) => v !== null && acoes().atualizarParametros({ hidraulica: { diametroEsgotoMm: { [a]: v } } })}
            />
          ))}
        </details>
      </div>
    </div>
  );
}
