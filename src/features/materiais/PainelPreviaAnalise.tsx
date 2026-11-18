/**
 * "Prévia da análise": enquanto a planta é analisada, as quantidades e os materiais vão surgindo.
 * É uma PRÉVIA — o app calcula `previa` sobre uma cópia do projeto com os pendentes da análise
 * tratados como confirmados; nada disso entra nos totais até o usuário aceitar as sugestões.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Levantamento } from '@/core/model';
import { COR_DISCIPLINA, ROTULO_DISCIPLINA } from '@/core/model';
import {
  andamento,
  estadoCascata,
  formatarValorPrevia,
  indiceFase,
  progressoGeral,
  resumirPrevia,
  valorContagem,
  type SecaoPrevia,
} from './previa';
import {
  FASE_MATERIAIS,
  ROTULO_FASE_PREVIA,
  TEXTO_AGUARDANDO_MATERIAIS,
  TEXTO_CHAMADA_FINAL,
  TEXTO_NADA,
  TEXTO_PREVIA,
  type FasePrevia,
} from './previaConfig';
import './previa.css';

export interface PropsPainelPreviaAnalise {
  fase: FasePrevia;
  /** 0..1 dentro da fase atual. */
  progresso: number;
  previa: Levantamento;
  aoPular(): void;
  aoFechar(): void;
}

const CONSULTA_MOVIMENTO = '(prefers-reduced-motion: reduce)';

const consultaMovimento = (): MediaQueryList | null =>
  typeof matchMedia === 'function' ? matchMedia(CONSULTA_MOVIMENTO) : null;

function useMovimentoReduzido(): boolean {
  const [reduzido, definir] = useState(() => consultaMovimento()?.matches ?? false);
  useEffect(() => {
    const consulta = consultaMovimento();
    if (!consulta) return;
    const aoMudar = () => definir(consulta.matches);
    aoMudar();
    consulta.addEventListener('change', aoMudar);
    return () => consulta.removeEventListener('change', aoMudar);
  }, []);
  return reduzido;
}

const estiloCor = (cor: string): CSSProperties => ({ '--cor': cor }) as CSSProperties;

function Secao({ secao, fase, progresso, reduzido }: { secao: SecaoPrevia; fase: FasePrevia; progresso: number; reduzido: boolean }) {
  const { disciplina } = secao;
  const ativa = secao.fasesDestaques.includes(fase);
  const encerrada = secao.fasesDestaques.every((f) => indiceFase(fase) > indiceFase(f));
  const visiveis = secao.destaques.flatMap((d) => {
    const t = andamento(d.fase, fase, progresso);
    return t === null ? [] : [{ ...d, t: reduzido ? 1 : t }];
  });

  return (
    <section className={`prev-cartao prev-entrar${ativa ? ' prev-ativo' : ''}`} style={estiloCor(COR_DISCIPLINA[disciplina])}>
      <header className="prev-cartao-titulo">
        <span className="bolinha" style={{ background: COR_DISCIPLINA[disciplina] }} />
        <span>{secao.rotulo}</span>
        {secao.faltantesNomeados.map((nome) => (
          <span key={nome} className="prev-faltantes" title={`Dado faltante: ${nome}`}>
            ⚠ Falta: {nome}
          </span>
        ))}
        {secao.faltantes > 0 && (
          <span className="prev-faltantes" title="Dados faltantes: veja os alertas na árvore">
            ⚠ {secao.faltantes} {secao.faltantes === 1 ? 'dado faltante' : 'dados faltantes'}
          </span>
        )}
      </header>
      {visiveis.length === 0 ? (
        encerrada ? <div className="suave prev-vazio">{TEXTO_NADA}</div> : <div className="prev-esqueleto" aria-hidden="true" />
      ) : (
        <dl className="prev-destaques">
          {visiveis.map((d) => (
            <div key={d.rotulo} className="prev-destaque prev-entrar">
              <dt>{d.rotulo}</dt>
              <dd>{formatarValorPrevia(valorContagem(d.valor, d.t, d.unidade), d.unidade)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

export function PainelPreviaAnalise({ fase, progresso, previa, aoPular, aoFechar }: PropsPainelPreviaAnalise) {
  const reduzido = useMovimentoReduzido();
  const resumo = useMemo(() => resumirPrevia(previa), [previa]);
  const concluida = fase === 'concluida';
  const geral = progressoGeral(fase, progresso);
  const secoes = resumo.secoes.filter((s) => andamento(s.fase, fase, progresso) !== null);
  const materiaisVisiveis = andamento(FASE_MATERIAIS, fase, progresso) !== null;
  const total = resumo.materiais.length;

  return (
    <div className={`prev-painel${reduzido ? ' prev-sem-movimento' : ''}`} aria-label="Prévia da análise">
      <div className="prev-topo">
        <div className="prev-topo-texto">
          <h3>Prévia da análise</h3>
          <div className="prev-fase" role="status" aria-live="polite">
            {ROTULO_FASE_PREVIA[fase]}
          </div>
        </div>
        {concluida ? (
          <button className="primario" onClick={aoFechar}>
            Fechar
          </button>
        ) : (
          <button onClick={aoPular}>Pular animação</button>
        )}
      </div>
      <div
        className="prev-barra"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(geral * 100)}
        aria-label="Andamento da análise"
      >
        <div className={`prev-barra-cheia${concluida ? ' prev-barra-fim' : ''}`} style={{ width: `${geral * 100}%` }} />
      </div>

      <p className="prev-aviso">{TEXTO_PREVIA}</p>

      {fase === 'varredura' && <div className="prev-cartao prev-varredura" aria-hidden="true" />}

      <div className="prev-secoes">
        {secoes.map((s) => (
          <Secao key={s.id} secao={s} fase={fase} progresso={progresso} reduzido={reduzido} />
        ))}
      </div>

      {materiaisVisiveis && (
        <section
          className={`prev-cartao prev-entrar prev-materiais${fase === 'materiais' ? ' prev-ativo' : ''}`}
          style={estiloCor(COR_DISCIPLINA.materiais)}
        >
          <header className="prev-cartao-titulo">
            <span className="bolinha" style={{ background: COR_DISCIPLINA.materiais }} />
            <span>{ROTULO_DISCIPLINA.materiais}</span>
            <span className="suave">{total}</span>
          </header>
          {total === 0 ? (
            <div className="suave prev-vazio">{TEXTO_NADA}</div>
          ) : (
            <ul className="prev-lista">
              {resumo.materiais.map((m, i) => {
                const e = reduzido ? { visivel: true, t: 1 } : estadoCascata(i, total, fase, progresso);
                if (!e.visivel) return null;
                return (
                  <li key={m.chave} className="prev-entrar">
                    <span className="prev-material">{m.material}</span>
                    <span className="prev-qtd">{formatarValorPrevia(valorContagem(m.quantidade, e.t, m.unidade), m.unidade)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
      {!materiaisVisiveis && !concluida && <p className="suave prev-nota">{TEXTO_AGUARDANDO_MATERIAIS}</p>}

      {concluida && <div className="prev-chamada prev-entrar">{TEXTO_CHAMADA_FINAL}</div>}
    </div>
  );
}
