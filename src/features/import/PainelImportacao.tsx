/** Aba "Importar": DXF, JSON (do próprio app ou parcial) e o botão "Recortes IA" (em breve). */
import { useState } from 'react';
import { escalaValida } from '@/core/calc';
import { useLevantamento } from '@/core/store';
import { NOME_PDF_EM_BRANCO, PAGINA_EM_BRANCO, ROTULO_UNIDADE_DXF, TEXTO_EM_BREVE, type UnidadeDxf } from './config';
import { importarDXF } from './dxf';
import { aiAnalyzer } from './ia';
import { importarJSON } from './json';
import { gerarPdfEmBranco } from './pdfEmBranco';

interface Retorno {
  erro?: string;
  resumo?: string;
  pendencias?: string[];
}

const UNIDADES = Object.keys(ROTULO_UNIDADE_DXF) as UnidadeDxf[];
const LEMBRETE_PENDENTES = 'Tudo o que foi importado está pendente: aceite ou descarte na árvore do levantamento.';

const EXEMPLO_JSON = `{ "parametros": { "peDireito": 2.8, "espessuraParede": 0.15, "numeroPessoas": 4 },
  "ambientes": [{ "nome": "Sala", "tipo": "sala", "pontos": [[0, 0], [4, 0], [4, 3], [0, 3]] }],
  "paredes": [{ "pontos": [[0, 0], [4, 0]], "espessura": 0.15 }],
  "esquadrias": [{ "codigo": "P1", "categoria": "porta", "largura": 0.8, "altura": 2.1, "peitoril": 0, "quantidade": 3 }] }`;

const contar = (n: number, singular: string, plural: string): string => `${n} ${n === 1 ? singular : plural}`;

function Resultado({ retorno }: { retorno: Retorno | null }) {
  if (!retorno) return null;
  return (
    <div>
      {retorno.erro && <p className="aviso">{retorno.erro}</p>}
      {retorno.resumo && <p>{retorno.resumo}</p>}
      {retorno.pendencias && retorno.pendencias.length > 0 && (
        <>
          <p className="alerta-faltante">O que falta preencher / conferir:</p>
          <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
            {retorno.pendencias.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function PainelImportacao() {
  const [arquivoDxf, setArquivoDxf] = useState<File | null>(null);
  const [unidade, setUnidade] = useState<UnidadeDxf | ''>('');
  const [retornoDxf, setRetornoDxf] = useState<Retorno | null>(null);
  const [arquivoJson, setArquivoJson] = useState<File | null>(null);
  const [retornoJson, setRetornoJson] = useState<Retorno | null>(null);

  async function aoImportarDxf(): Promise<void> {
    if (!arquivoDxf || unidade === '') return;
    try {
      const texto = await arquivoDxf.text();
      const st = useLevantamento.getState();
      const semPlanta = st.projeto.totalPaginas === 0 || st.pdfDados === null;
      const pagina = semPlanta ? 1 : st.paginaAtual;
      const info = st.projeto.paginas[pagina];
      const largura = info?.largura ?? (semPlanta ? PAGINA_EM_BRANCO.largura : undefined);
      const altura = info?.altura ?? (semPlanta ? PAGINA_EM_BRANCO.altura : undefined);
      if (largura === undefined || altura === undefined) {
        setRetornoDxf({ erro: 'A planta ainda está carregando. Aguarde a página aparecer e tente de novo.' });
        return;
      }

      const resultado = importarDXF(texto, { pagina, unidadeDxf: unidade, larguraPagina: largura, alturaPagina: altura });

      if (escalaValida(info?.escala)) {
        const confirmou = window.confirm(
          `A página ${pagina} já tem escala calibrada. A importação vai usar as dimensões da página e RECALIBRAR a escala ` +
            'para a do DXF — as medidas dos elementos já desenhados nesta página mudam. Continuar?',
        );
        if (!confirmou) {
          setRetornoDxf({ resumo: 'Importação cancelada.' });
          return;
        }
      }

      if (semPlanta) st.definirPdf(NOME_PDF_EM_BRANCO, gerarPdfEmBranco(largura, altura), 1);
      st.calibrarPagina(pagina, resultado.escala);
      st.adicionarElementos(resultado.elementos);

      const ambientes = resultado.elementos.filter((e) => e.tipo === 'ambiente').length;
      const paredes = resultado.elementos.filter((e) => e.tipo === 'parede').length;
      setRetornoDxf({
        resumo:
          `Importado: ${contar(ambientes, 'ambiente', 'ambientes')} e ${contar(paredes, 'parede', 'paredes')}` +
          `${semPlanta ? ' numa planta em branco' : ` na página ${pagina}`}. ${LEMBRETE_PENDENTES}`,
        pendencias: resultado.pendencias,
      });
    } catch (e) {
      setRetornoDxf({ erro: e instanceof Error ? e.message : 'Não foi possível importar o DXF.' });
    }
  }

  async function aoImportarJson(): Promise<void> {
    if (!arquivoJson) return;
    try {
      const texto = await arquivoJson.text();
      const st = useLevantamento.getState();
      const pagina = st.paginaAtual;
      const escala = st.projeto.paginas[pagina]?.escala;
      const resultado = importarJSON(texto, { pagina, escala: escalaValida(escala) ? escala : null });

      if (resultado.tipo === 'erro') {
        setRetornoJson({ erro: resultado.mensagem });
        return;
      }
      if (resultado.tipo === 'projeto') {
        const confirmou = window.confirm(
          `Abrir o projeto "${resultado.projeto.nome}"? Ele SUBSTITUI o levantamento atual (exporte antes, se quiser guardá-lo).`,
        );
        if (!confirmou) {
          setRetornoJson({ resumo: 'Importação cancelada.' });
          return;
        }
        st.carregarProjeto(resultado.projeto);
        setRetornoJson({
          resumo: `Projeto "${resultado.projeto.nome}" carregado: ${contar(resultado.projeto.elementos.length, 'elemento', 'elementos')}.`,
          pendencias: resultado.pendencias,
        });
        return;
      }
      st.adicionarElementos(resultado.elementos);
      for (const esquadria of resultado.esquadrias) st.salvarEsquadria(esquadria);
      if (Object.keys(resultado.parametros).length > 0) st.atualizarParametros(resultado.parametros);
      const parametros = Object.keys(resultado.parametros.gerais ?? {}).length;
      setRetornoJson({
        resumo:
          `Importado: ${contar(resultado.elementos.length, 'elemento', 'elementos')}, ` +
          `${contar(resultado.esquadrias.length, 'tipo de esquadria', 'tipos de esquadria')} e ` +
          `${contar(parametros, 'parâmetro', 'parâmetros')}. ${resultado.elementos.length > 0 ? LEMBRETE_PENDENTES : ''}`,
        pendencias: resultado.pendencias,
      });
    } catch (e) {
      setRetornoJson({ erro: e instanceof Error ? e.message : 'Não foi possível importar o JSON.' });
    }
  }

  return (
    <div>
      <h3>Importar</h3>
      <p className="suave">{LEMBRETE_PENDENTES}</p>

      <div className="secao">
        <h4>DXF</h4>
        <p className="suave">
          Polilinhas fechadas viram ambientes, textos viram nomes e pares de linhas paralelas viram paredes. Sem planta
          carregada, o desenho entra numa planta em branco.
        </p>
        <input
          type="file"
          accept=".dxf"
          aria-label="Arquivo DXF"
          onChange={(e) => {
            setArquivoDxf(e.target.files?.[0] ?? null);
            setRetornoDxf(null);
          }}
        />
        <label className="campo" style={{ gridTemplateColumns: '1fr 150px' }}>
          <span>Unidade do desenho (obrigatória)</span>
          <select value={unidade} onChange={(e) => setUnidade(e.target.value as UnidadeDxf | '')}>
            <option value="">— escolha —</option>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {ROTULO_UNIDADE_DXF[u]}
              </option>
            ))}
          </select>
        </label>
        {arquivoDxf && unidade === '' && <p className="alerta-faltante">Escolha a unidade do desenho: ela não é presumida.</p>}
        <button className="primario" disabled={!arquivoDxf || unidade === ''} onClick={() => void aoImportarDxf()}>
          Importar DXF
        </button>
        <Resultado retorno={retornoDxf} />
      </div>

      <div className="secao">
        <h4>JSON</h4>
        <p className="suave">
          Aceita o arquivo exportado por este app (substitui o levantamento atual) ou um JSON com dados parciais — todos os
          campos são opcionais. Coordenadas em metros, a partir do canto superior esquerdo da página (y para baixo); o
          ambiente pode vir com "pontos" ou com "largura", "comprimento", "x" e "y". A página precisa estar calibrada
          para receber geometrias.
        </p>
        <pre className="suave" style={{ whiteSpace: 'pre-wrap', fontSize: 11, margin: '4px 0' }}>
          {EXEMPLO_JSON}
        </pre>
        <input
          type="file"
          accept=".json,application/json"
          aria-label="Arquivo JSON"
          onChange={(e) => {
            setArquivoJson(e.target.files?.[0] ?? null);
            setRetornoJson(null);
          }}
        />
        <div className="linha" style={{ marginTop: 6 }}>
          <button className="primario" disabled={!arquivoJson} onClick={() => void aoImportarJson()}>
            Importar JSON
          </button>
        </div>
        <Resultado retorno={retornoJson} />
      </div>

      <div className="secao">
        <h4>Recortes IA</h4>
        <div className="linha">
          <button disabled={!aiAnalyzer.disponivel} title={TEXTO_EM_BREVE}>
            Analisar recorte da planta
          </button>
          <small className="suave">{TEXTO_EM_BREVE}</small>
        </div>
      </div>
    </div>
  );
}
