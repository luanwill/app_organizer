/**
 * Quantitativos da estrutura a partir dos ELEMENTOS do projeto (não das paredes). Função PURA.
 * Comprimentos/áreas: geometria × escala da página; seções: props do elemento; taxas, fck e
 * dimensões de fundação: parâmetros. Dado faltante → Alerta e as linhas dependentes não saem.
 */
import type {
  Alerta,
  Elemento,
  ElementoDe,
  LinhaQuantitativo,
  Projeto,
  ResultadoDisciplina,
} from '@/core/model';
import {
  areaPoligono,
  caixaEnvolvente,
  comprimentoPolilinha,
  escalaValida,
  paraM2,
  paraMetros,
  perimetroPoligono,
} from '@/core/calc';
import { DETALHE_ACO_TAXA, GRUPO } from './config';
import { quantitativosBloco, quantitativosRadier, quantitativosSapata, type QuantitativosFundacao } from './fundacoes';
import { quantitativosLaje } from './lajes';
import { quantitativosPilar, quantitativosViga, type ParcelaAco } from './vigas';

type Extra = Partial<Pick<LinhaQuantitativo, 'servico' | 'ehMaterial' | 'detalhe' | 'manual'>>;

/** Altura de cálculo de um pilar (m): manual > própria > pé-direito + viga superior. null = falta o pé-direito. */
export function alturaDoPilar(pilar: ElementoDe<'pilar'>, projeto: Projeto): number | null {
  const manual = pilar.manuais?.altura;
  if (manual !== undefined) return manual;
  if (pilar.props.altura !== undefined && pilar.props.altura !== null) return pilar.props.altura;
  const peDireito = projeto.parametros.gerais.peDireito;
  if (peDireito === null) return null;
  const vigaSuperior = projeto.parametros.estrutura.vigaSuperior;
  return peDireito + (vigaSuperior.ativa ? vigaSuperior.secaoH : 0);
}

export function calcularEstrutura(projeto: Projeto): ResultadoDisciplina {
  const estrutura = projeto.parametros.estrutura;
  const fck = `fck ${estrutura.fck}`;
  const linhas: LinhaQuantitativo[] = [];
  const alertas: Alerta[] = [];
  const alertados = new Set<string>();

  const alertar = (campo: string, mensagem: string, elementoId?: string): void => {
    const chave = `${campo}|${elementoId ?? ''}|${mensagem}`;
    if (alertados.has(chave)) return;
    alertados.add(chave);
    alertas.push({ disciplina: 'estrutura', campo, mensagem, ...(elementoId ? { elementoId } : {}) });
  };
  const linha = (
    el: Elemento,
    grupo: string,
    chave: string,
    descricao: string,
    unidade: string,
    quantidade: number,
    extra: Extra = {},
  ): void => {
    linhas.push({
      id: `${el.id}:${chave}`,
      disciplina: 'estrutura',
      grupo,
      descricao,
      unidade,
      quantidade,
      status: el.status,
      elementoIds: [el.id],
      ...extra,
    });
  };
  const manualSe = (manual: boolean): Extra => (manual ? { manual: true } : {});
  const linhasDeAco = (el: Elemento, grupo: string, nome: string, parcelas: ParcelaAco[] | null, extra: Extra): void => {
    if (parcelas === null) {
      alertar('espacamentoEstribo', 'Informe o espaçamento dos estribos para calcular o aço detalhado.');
      return;
    }
    for (const p of parcelas) linha(el, grupo, p.chave, `Aço — ${nome}`, 'kg', p.kg, { servico: 'aco', detalhe: p.detalhe, ...extra });
  };
  const linhasDeFundacao = (el: Elemento, nome: string, q: QuantitativosFundacao): void => {
    linha(el, GRUPO.fundacoes, 'escavacao', `Escavação — ${nome}`, 'm³', q.escavacao, { servico: 'escavacao' });
    linha(el, GRUPO.fundacoes, 'lastro', `Lastro — ${nome}`, 'm³', q.lastro, { servico: 'lastro' });
    linha(el, GRUPO.fundacoes, 'forma', `Forma — ${nome}`, 'm²', q.forma, { servico: 'forma' });
    linha(el, GRUPO.fundacoes, 'concreto', `Concreto — ${nome}`, 'm³', q.concreto, { servico: 'concreto', detalhe: fck });
    linha(el, GRUPO.fundacoes, 'aco', `Aço — ${nome}`, 'kg', q.aco, { servico: 'aco', detalhe: DETALHE_ACO_TAXA });
  };

  for (const el of projeto.elementos) {
    if (el.disciplina !== 'estrutura') continue;
    const escala = projeto.paginas[el.pagina]?.escala;
    if (!escalaValida(escala)) {
      alertar('escala', `Página ${el.pagina} sem escala: calibre para medir a estrutura.`);
      continue;
    }

    switch (el.tipo) {
      case 'pilar': {
        linha(el, GRUPO.pilares, 'contagem', 'Pilares (un)', 'un', 1);
        const altura = alturaDoPilar(el, projeto);
        if (altura === null) {
          alertar('peDireito', 'Informe o pé-direito para calcular concreto, forma e aço dos pilares.');
          break;
        }
        const extra = manualSe(el.manuais?.altura !== undefined);
        const q = quantitativosPilar(altura, el.props.secaoB, el.props.secaoH, estrutura);
        linha(el, GRUPO.pilares, 'concreto', 'Concreto — pilares', 'm³', q.concreto, { servico: 'concreto', detalhe: fck, ...extra });
        linha(el, GRUPO.pilares, 'forma', 'Forma — pilares', 'm²', q.forma, { servico: 'forma', ...extra });
        linhasDeAco(el, GRUPO.pilares, 'pilares', q.aco, extra);
        break;
      }

      case 'viga-baldrame':
      case 'viga-superior': {
        const baldrame = el.tipo === 'viga-baldrame';
        const grupo = baldrame ? GRUPO.baldrame : GRUPO.superiores;
        const nome = baldrame ? 'baldrame' : 'vigas superiores';
        const manual = el.manuais?.comprimento;
        const comprimento =
          manual ?? (el.geometria.tipo === 'polilinha' ? paraMetros(comprimentoPolilinha(el.geometria.pontos), escala) : 0);
        const extra = manualSe(manual !== undefined);
        const q = quantitativosViga(comprimento, el.props.secaoB, el.props.secaoH, estrutura);
        linha(el, grupo, 'comprimento', `${baldrame ? 'Vigas baldrame' : 'Vigas superiores'} — comprimento`, 'm', comprimento, extra);
        linha(el, grupo, 'forma', `Forma — ${nome}`, 'm²', q.forma, { servico: 'forma', ...extra });
        linha(el, grupo, 'concreto', `Concreto — ${nome}`, 'm³', q.concreto, { servico: 'concreto', detalhe: fck, ...extra });
        linhasDeAco(el, grupo, nome, q.aco, extra);
        if (baldrame) {
          linha(el, grupo, 'impermeabilizacao', 'Impermeabilização — baldrame', 'm²', q.impermeabilizacao, {
            servico: 'impermeabilizacao',
            ...extra,
          });
        }
        break;
      }

      case 'laje': {
        if (el.geometria.tipo !== 'poligono') break;
        const manual = el.manuais?.area;
        const area = manual ?? paraM2(areaPoligono(el.geometria.pontos), escala);
        const extra = manualSe(manual !== undefined);
        const caixa = caixaEnvolvente(el.geometria.pontos);
        const q = quantitativosLaje(
          area,
          paraMetros(caixa.maxX - caixa.minX, escala),
          paraMetros(caixa.maxY - caixa.minY, escala),
          el.props,
          estrutura,
        );
        linha(el, GRUPO.lajes, 'area', 'Lajes — área', 'm²', area, extra);
        linha(el, GRUPO.lajes, 'concreto', 'Concreto — lajes', 'm³', q.concreto, { servico: 'concreto', detalhe: fck, ...extra });
        if (el.props.tipoLaje === 'macica') {
          linha(el, GRUPO.lajes, 'aco', 'Aço — lajes', 'kg', q.aco ?? 0, { servico: 'aco', detalhe: DETALHE_ACO_TAXA, ...extra });
        } else {
          if (q.trelicas === undefined || q.enchimento === undefined) {
            alertar('intereixo', 'Informe o intereixo das lajes treliçadas para calcular vigotas e enchimento.');
          } else {
            const eps = el.props.tipoLaje === 'trelicada-eps';
            linha(el, GRUPO.lajes, 'trelicas', 'Vigotas treliçadas', 'm', q.trelicas, { ehMaterial: true });
            linha(el, GRUPO.lajes, 'enchimento', eps ? 'EPS para laje (peças)' : 'Lajotas cerâmicas', 'un', q.enchimento, {
              ehMaterial: true,
            });
          }
          linha(el, GRUPO.lajes, 'tela', 'Tela de distribuição', 'm²', q.tela ?? 0, { ehMaterial: true, ...extra });
        }
        linha(el, GRUPO.lajes, 'escoramento', 'Escoramento — lajes', 'm²', q.escoramento, extra);
        break;
      }

      case 'fundacao': {
        if (el.props.tipoFundacao === 'radier') {
          if (el.geometria.tipo !== 'poligono') {
            alertar('geometria', 'Radier sem contorno: desenhe o radier como polígono.', el.id);
            break;
          }
          const area = paraM2(areaPoligono(el.geometria.pontos), escala);
          const perimetro = paraMetros(perimetroPoligono(el.geometria.pontos), escala);
          linha(el, GRUPO.fundacoes, 'area', 'Radier — área', 'm²', area);
          linhasDeFundacao(el, 'radier', quantitativosRadier(area, perimetro, estrutura));
        } else if (el.props.tipoFundacao === 'sapata') {
          linha(el, GRUPO.fundacoes, 'contagem', 'Sapatas (un)', 'un', 1);
          linhasDeFundacao(el, 'sapatas', quantitativosSapata(estrutura));
        } else {
          const q = quantitativosBloco(estrutura);
          linha(el, GRUPO.fundacoes, 'contagem', 'Blocos (un)', 'un', 1);
          linhasDeFundacao(el, 'blocos', q);
          linha(el, GRUPO.fundacoes, 'estacas', 'Estacas (un)', 'un', q.estacas);
          linha(el, GRUPO.fundacoes, 'concreto-estacas', 'Concreto — estacas', 'm³', q.concretoEstacas, {
            servico: 'concreto',
            detalhe: fck,
          });
          linha(el, GRUPO.fundacoes, 'perfuracao', 'Perfuração de estacas', 'm', q.perfuracao);
        }
        break;
      }

      default:
        break;
    }
  }

  return { linhas, alertas };
}
