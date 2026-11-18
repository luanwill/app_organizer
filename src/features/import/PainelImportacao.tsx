/** Aba "Importar": reconhecimento do PDF vetorial, DXF, JSON (do próprio app ou parcial) e "Recortes IA" (em breve). */
import { useState } from 'react';
import { OPS } from 'pdfjs-dist';
import type { Ponto } from '@/core/model';
import { escalaValida } from '@/core/calc';
import { useLevantamento } from '@/core/store';
import { abrirPdf } from '@/features/viewer/pdf';
import { NOME_PDF_EM_BRANCO, PAGINA_EM_BRANCO, ROTULO_UNIDADE_DXF, TEXTO_EM_BREVE, type UnidadeDxf } from './config';
import { importarDXF, type ResultadoDXF } from './dxf';
import { aiAnalyzer } from './ia';
import { importarJSON } from './json';
import { gerarPdfEmBranco } from './pdfEmBranco';
import { extrairVetores, paraEntradaDoReconhecimento } from './pdfVetores';
import { ehDoReconhecimentoPdf, MENSAGEM_SEM_ESCALA, reconhecerVetores } from './reconhecimento';

interface Retorno {
  erro?: string;
  resumo?: string;
  pendencias?: string[];
}

/** Confirmação feita na própria tela (o confirm() do navegador pode estar bloqueado). */
interface Confirmacao {
  mensagem: string;
  rotulo: string;
  confirmar(): void;
}

const UNIDADES = Object.keys(ROTULO_UNIDADE_DXF) as UnidadeDxf[];
const LEMBRETE_PENDENTES = 'Tudo o que foi importado está pendente: aceite ou descarte na árvore do levantamento.';
const PENDENCIA_PE_DIREITO = 'Pé-direito não informado: preencha nos dados essenciais para calcular as paredes.';

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

function PedidoDeConfirmacao({ pedido, cancelar }: { pedido: Confirmacao | null; cancelar(): void }) {
  if (!pedido) return null;
  return (
    <div className="aviso" role="alertdialog">
      <p style={{ margin: '0 0 6px' }}>{pedido.mensagem}</p>
      <div className="linha">
        <button className="primario" onClick={pedido.confirmar}>
          {pedido.rotulo}
        </button>
        <button onClick={cancelar}>Cancelar</button>
      </div>
    </div>
  );
}

export function PainelImportacao() {
  const temPlanta = useLevantamento((s) => s.pdfDados !== null && s.projeto.totalPaginas > 0);
  const pagina = useLevantamento((s) => s.paginaAtual);
  const calibrada = useLevantamento((s) => escalaValida(s.projeto.paginas[s.paginaAtual]?.escala));
  /** Região: uma medição de área (polígono/retângulo) selecionada na página atual limita o reconhecimento. */
  const temRegiao = useLevantamento((s) => regiaoSelecionada(s.projeto.elementos, s.selecaoIds, s.paginaAtual) !== null);

  const [reconhecendo, setReconhecendo] = useState(false);
  const [retornoPdf, setRetornoPdf] = useState<Retorno | null>(null);
  const [arquivoDxf, setArquivoDxf] = useState<File | null>(null);
  const [unidade, setUnidade] = useState<UnidadeDxf | ''>('');
  const [retornoDxf, setRetornoDxf] = useState<Retorno | null>(null);
  const [confirmacaoDxf, setConfirmacaoDxf] = useState<Confirmacao | null>(null);
  const [arquivoJson, setArquivoJson] = useState<File | null>(null);
  const [retornoJson, setRetornoJson] = useState<Retorno | null>(null);
  const [confirmacaoJson, setConfirmacaoJson] = useState<Confirmacao | null>(null);

  // ------------------------------------------------------------ PDF vetorial
  async function aoReconhecerPdf(): Promise<void> {
    const st = useLevantamento.getState();
    const paginaAlvo = st.paginaAtual;
    const escala = st.projeto.paginas[paginaAlvo]?.escala;
    if (!st.pdfDados) return;
    if (!escalaValida(escala)) {
      setRetornoPdf({ erro: `${MENSAGEM_SEM_ESCALA}.` });
      return;
    }
    setReconhecendo(true);
    setRetornoPdf(null);
    try {
      const documento = await abrirPdf(st.pdfDados);
      let vetores;
      try {
        vetores = await extrairVetores(await documento.getPage(paginaAlvo), OPS as unknown as Record<string, number>);
      } finally {
        void documento.destroy();
      }
      const regiao = regiaoSelecionada(st.projeto.elementos, st.selecaoIds, paginaAlvo);
      const resultado = reconhecerVetores(paraEntradaDoReconhecimento(vetores), {
        pagina: paginaAlvo,
        escala,
        ...(regiao ? { regiao } : {}),
      });
      if (resultado.situacao !== 'ok') {
        setRetornoPdf({ erro: resultado.mensagem ?? 'Não foi possível reconhecer a planta.' });
        return;
      }

      // rodar de novo não duplica: saem os candidatos ainda pendentes do reconhecimento anterior desta página
      const atual = useLevantamento.getState();
      const anteriores = atual.projeto.elementos
        .filter((e) => e.pagina === paginaAlvo && e.status === 'pendente' && ehDoReconhecimentoPdf(e))
        .map((e) => e.id);
      if (anteriores.length > 0) atual.removerElementos(anteriores);
      atual.adicionarElementos(resultado.elementos);

      const ambientes = resultado.elementos.filter((e) => e.tipo === 'ambiente').length;
      const paredes = resultado.elementos.filter((e) => e.tipo === 'parede').length;
      const pendencias = [...resultado.pendencias];
      if (atual.projeto.parametros.gerais.peDireito === null) pendencias.push(PENDENCIA_PE_DIREITO);
      if (vetores.curvasIgnoradas > 0) pendencias.push(`${contar(vetores.curvasIgnoradas, 'trecho curvo foi ignorado', 'trechos curvos foram ignorados')}.`);
      setRetornoPdf({
        resumo:
          `Reconhecido na página ${paginaAlvo}${regiao ? ' (dentro da região selecionada)' : ''}: ` +
          `${contar(paredes, 'parede', 'paredes')} e ${contar(ambientes, 'ambiente', 'ambientes')}` +
          `${anteriores.length > 0 ? `; ${contar(anteriores.length, 'candidato anterior ainda pendente foi substituído', 'candidatos anteriores ainda pendentes foram substituídos')}` : ''}. ` +
          LEMBRETE_PENDENTES,
        pendencias,
      });
    } catch (e) {
      setRetornoPdf({ erro: e instanceof Error ? `Não foi possível ler o PDF: ${e.message}` : 'Não foi possível ler o PDF.' });
    } finally {
      setReconhecendo(false);
    }
  }

  // ------------------------------------------------------------ DXF
  function aplicarDxf(resultado: ResultadoDXF, paginaAlvo: number, semPlanta: boolean, largura: number, altura: number): void {
    const st = useLevantamento.getState();
    if (semPlanta) st.definirPdf(NOME_PDF_EM_BRANCO, gerarPdfEmBranco(largura, altura), 1);
    st.calibrarPagina(paginaAlvo, resultado.escala);
    st.adicionarElementos(resultado.elementos);
    const ambientes = resultado.elementos.filter((e) => e.tipo === 'ambiente').length;
    const paredes = resultado.elementos.filter((e) => e.tipo === 'parede').length;
    setConfirmacaoDxf(null);
    setRetornoDxf({
      resumo:
        `Importado: ${contar(ambientes, 'ambiente', 'ambientes')} e ${contar(paredes, 'parede', 'paredes')}` +
        `${semPlanta ? ' numa planta em branco' : ` na página ${paginaAlvo}`}. ${LEMBRETE_PENDENTES}`,
      pendencias: resultado.pendencias,
    });
  }

  async function aoImportarDxf(): Promise<void> {
    if (!arquivoDxf || unidade === '') return;
    setConfirmacaoDxf(null);
    try {
      const texto = await arquivoDxf.text();
      const st = useLevantamento.getState();
      const semPlanta = st.projeto.totalPaginas === 0 || st.pdfDados === null;
      const paginaAlvo = semPlanta ? 1 : st.paginaAtual;
      const info = st.projeto.paginas[paginaAlvo];
      const largura = info?.largura ?? (semPlanta ? PAGINA_EM_BRANCO.largura : undefined);
      const altura = info?.altura ?? (semPlanta ? PAGINA_EM_BRANCO.altura : undefined);
      if (largura === undefined || altura === undefined) {
        setRetornoDxf({ erro: 'A planta ainda está carregando. Aguarde a página aparecer e tente de novo.' });
        return;
      }
      const resultado = importarDXF(texto, { pagina: paginaAlvo, unidadeDxf: unidade, larguraPagina: largura, alturaPagina: altura });
      if (escalaValida(info?.escala)) {
        setRetornoDxf(null);
        setConfirmacaoDxf({
          mensagem:
            `A página ${paginaAlvo} já tem escala calibrada. A importação vai usar as dimensões da página e RECALIBRAR a escala ` +
            'para a do DXF — as medidas dos elementos já desenhados nesta página mudam.',
          rotulo: 'Importar e recalibrar',
          confirmar: () => aplicarDxf(resultado, paginaAlvo, semPlanta, largura, altura),
        });
        return;
      }
      aplicarDxf(resultado, paginaAlvo, semPlanta, largura, altura);
    } catch (e) {
      setRetornoDxf({ erro: e instanceof Error ? e.message : 'Não foi possível importar o DXF.' });
    }
  }

  // ------------------------------------------------------------ JSON
  async function aoImportarJson(): Promise<void> {
    if (!arquivoJson) return;
    setConfirmacaoJson(null);
    try {
      const texto = await arquivoJson.text();
      const st = useLevantamento.getState();
      const escala = st.projeto.paginas[st.paginaAtual]?.escala;
      const resultado = importarJSON(texto, { pagina: st.paginaAtual, escala: escalaValida(escala) ? escala : null });

      if (resultado.tipo === 'erro') {
        setRetornoJson({ erro: resultado.mensagem });
        return;
      }
      if (resultado.tipo === 'projeto') {
        setRetornoJson(null);
        setConfirmacaoJson({
          mensagem: `Abrir o projeto "${resultado.projeto.nome}"? Ele SUBSTITUI o levantamento atual (exporte antes, se quiser guardá-lo).`,
          rotulo: 'Substituir o levantamento',
          confirmar: () => {
            useLevantamento.getState().carregarProjeto(resultado.projeto);
            setConfirmacaoJson(null);
            setRetornoJson({
              resumo: `Projeto "${resultado.projeto.nome}" carregado: ${contar(resultado.projeto.elementos.length, 'elemento', 'elementos')}.`,
              pendencias: resultado.pendencias,
            });
          },
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
        <h4>PDF vetorial (planta carregada)</h4>
        <p className="suave">
          Lê os vetores da página atual de um PDF exportado de CAD ou de planta humanizada: paredes em traço duplo
          ou preenchidas (poché) viram paredes (no eixo), os contornos fechados por paredes viram ambientes (pela face
          interna) e os textos dão os nomes. Portas e janelas só fecham o vão quando estão desenhadas. Só fica a planta
          que tem cômodos com nome; cortes, elevações e carimbo são descartados. Para limitar a região, selecione antes
          uma medição de área desenhada em volta da planta.
        </p>
        {!temPlanta && <p className="suave">Carregue uma planta em PDF para usar o reconhecimento.</p>}
        {temPlanta && !calibrada && (
          <p className="alerta-faltante">
            <strong>Dado faltante</strong> — {MENSAGEM_SEM_ESCALA}: a espessura das paredes é medida em metros (etapa 1,
            página {pagina}).
          </p>
        )}
        {temPlanta && calibrada && temRegiao && <p className="suave">Região: só o que estiver dentro da medição selecionada.</p>}
        <button
          className="primario"
          disabled={!temPlanta || !calibrada || reconhecendo}
          title={!temPlanta ? 'Carregue uma planta em PDF' : !calibrada ? MENSAGEM_SEM_ESCALA : undefined}
          onClick={() => void aoReconhecerPdf()}
        >
          {reconhecendo ? 'Reconhecendo…' : 'Reconhecer paredes e ambientes do PDF'}
        </button>
        <Resultado retorno={retornoPdf} />
      </div>

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
            setConfirmacaoDxf(null);
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
        <PedidoDeConfirmacao pedido={confirmacaoDxf} cancelar={() => setConfirmacaoDxf(null)} />
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
            setConfirmacaoJson(null);
          }}
        />
        <div className="linha" style={{ marginTop: 6 }}>
          <button className="primario" disabled={!arquivoJson} onClick={() => void aoImportarJson()}>
            Importar JSON
          </button>
        </div>
        <PedidoDeConfirmacao pedido={confirmacaoJson} cancelar={() => setConfirmacaoJson(null)} />
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

/** Polígono da única medição de área selecionada na página, ou null. */
function regiaoSelecionada(
  elementos: ReturnType<typeof useLevantamento.getState>['projeto']['elementos'],
  selecaoIds: string[],
  pagina: number,
): Ponto[] | null {
  if (selecaoIds.length !== 1) return null;
  const el = elementos.find((e) => e.id === selecaoIds[0]);
  if (!el || el.tipo !== 'medicao' || el.pagina !== pagina || el.geometria.tipo !== 'poligono') return null;
  return el.geometria.pontos;
}
