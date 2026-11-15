/** Etapa "2. Dados essenciais": pé-direito, espessura das paredes, nº de pessoas e regras de arquitetura. */
import type { ModoDescontoVao } from '@/core/model';
import { useLevantamento } from '@/core/store';
import { EntradaNumero, naoNegativo } from './campos';
import { DEMAOS_MINIMO } from './config';
import './arq.css';

const ROTULO_MODO_DESCONTO: Record<ModoDescontoVao, string> = {
  'acima-do-limite': 'Só vãos acima do limite',
  todos: 'Todos os vãos',
  nenhum: 'Não descontar',
};

const inteiroPositivo = (v: number) => Number.isInteger(v) && v > 0;
const demaosValidas = (v: number) => Number.isInteger(v) && v >= DEMAOS_MINIMO;

function Faltante({ texto }: { texto: string }) {
  return (
    <p className="alerta-faltante arq-nota">
      <strong>Dado faltante</strong> — {texto}
    </p>
  );
}

export function PainelDadosEssenciais() {
  const gerais = useLevantamento((s) => s.projeto.parametros.gerais);
  const arq = useLevantamento((s) => s.projeto.parametros.arquitetura);
  const atualizar = useLevantamento((s) => s.atualizarParametros);

  return (
    <div>
      <h3>Dados essenciais</h3>
      <p className="suave arq-nota">Nada é assumido: enquanto um dado não for informado, o que depende dele não é calculado.</p>

      <label className="campo">
        <span>Pé-direito (m)</span>
        <EntradaNumero valor={gerais.peDireito} permiteVazio placeholder="ex.: 2,80" aoMudar={(v) => atualizar({ gerais: { peDireito: v } })} />
      </label>
      {gerais.peDireito === null && (
        <Faltante texto="sem o pé-direito não são calculadas área de parede, pintura, revestimento, chapisco/emboço/reboco e alvenaria (exceto onde houver altura própria)." />
      )}

      <label className="campo">
        <span>Espessura padrão das paredes (m)</span>
        <EntradaNumero valor={gerais.espessuraParede} permiteVazio placeholder="ex.: 0,15" aoMudar={(v) => atualizar({ gerais: { espessuraParede: v } })} />
      </label>
      {gerais.espessuraParede === null && (
        <Faltante texto="as paredes novas nascem sem espessura e ficam com alerta até você informar em cada uma." />
      )}

      <label className="campo">
        <span>Nº de pessoas</span>
        <EntradaNumero valor={gerais.numeroPessoas} permiteVazio aceita={inteiroPositivo} placeholder="ex.: 4" aoMudar={(v) => atualizar({ gerais: { numeroPessoas: v } })} />
      </label>
      {gerais.numeroPessoas === null && <Faltante texto="sem o nº de pessoas o reservatório de água não é dimensionado." />}

      <div className="secao">
        <h3>Regras de arquitetura</h3>
        <label className="campo">
          <span>Desconto de vãos</span>
          <select
            value={arq.modoDescontoVao}
            onChange={(e) => atualizar({ arquitetura: { modoDescontoVao: e.target.value as ModoDescontoVao } })}
          >
            {(Object.keys(ROTULO_MODO_DESCONTO) as ModoDescontoVao[]).map((m) => (
              <option key={m} value={m}>
                {ROTULO_MODO_DESCONTO[m]}
              </option>
            ))}
          </select>
        </label>
        {arq.modoDescontoVao === 'acima-do-limite' && (
          <label className="campo">
            <span>Limite do vão (m²)</span>
            <EntradaNumero
              valor={arq.limiteDescontoVaoM2}
              aceita={naoNegativo}
              aoMudar={(v) => v !== null && atualizar({ arquitetura: { limiteDescontoVaoM2: v } })}
            />
          </label>
        )}
        <p className="suave arq-nota">
          {arq.modoDescontoVao === 'acima-do-limite' && 'Vãos maiores que o limite são descontados por inteiro das áreas de parede e de alvenaria.'}
          {arq.modoDescontoVao === 'todos' && 'Todos os vãos são descontados das áreas de parede e de alvenaria.'}
          {arq.modoDescontoVao === 'nenhum' && 'Nenhum vão é descontado das áreas de parede e de alvenaria.'}
        </p>
        <label className="campo">
          <span>Subida da impermeabilização (m)</span>
          <EntradaNumero
            valor={arq.subidaImpermeabilizacao}
            aceita={naoNegativo}
            aoMudar={(v) => v !== null && atualizar({ arquitetura: { subidaImpermeabilizacao: v } })}
          />
        </label>
        <label className="campo">
          <span>Demãos de pintura</span>
          <EntradaNumero
            valor={arq.demaosPintura}
            aceita={demaosValidas}
            aoMudar={(v) => v !== null && atualizar({ arquitetura: { demaosPintura: v } })}
          />
        </label>
      </div>
    </div>
  );
}
