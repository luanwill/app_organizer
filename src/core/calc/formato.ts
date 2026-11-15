/**
 * Arredondamento e formatação pt-BR (vírgula decimal, ponto de milhar).
 * Implementação manual (sem Intl) para ser determinística em qualquer ambiente.
 */
import {
  CASAS_PADRAO,
  DIGITOS_SIGNIFICATIVOS,
  SEPARADOR_DECIMAL,
  SEPARADOR_MILHAR,
  TEXTO_VALOR_INVALIDO,
} from './config';

function normalizarCasas(casas: number): number {
  return Number.isFinite(casas) ? Math.max(0, Math.trunc(casas)) : CASAS_PADRAO;
}

/**
 * Arredonda "meio para longe do zero" sem o erro binário clássico (1.005 → 1.01; -1.005 → -1.01).
 * NaN/infinito são devolvidos como estão.
 */
export function arredondar(valor: number, casas: number = CASAS_PADRAO): number {
  if (!Number.isFinite(valor)) return valor;
  const fator = 10 ** normalizarCasas(casas);
  // toPrecision remove o ruído binário do produto (100.49999999999999 → 100.5) antes do round.
  const escalado = Number((Math.abs(valor) * fator).toPrecision(DIGITOS_SIGNIFICATIVOS));
  const resultado = Math.round(escalado) / fator;
  if (resultado === 0) return 0; // evita -0
  return valor < 0 ? -resultado : resultado;
}

/** "1.234,56". Valor não finito → "—". */
export function formatarNumero(valor: number, casas: number = CASAS_PADRAO): string {
  if (!Number.isFinite(valor)) return TEXTO_VALOR_INVALIDO;
  const n = normalizarCasas(casas);
  const arredondado = arredondar(valor, n);
  const [inteira = '0', decimal] = Math.abs(arredondado).toFixed(n).split('.');
  const comMilhar = inteira.replace(/\B(?=(\d{3})+(?!\d))/g, SEPARADOR_MILHAR);
  const sinal = arredondado < 0 ? '-' : '';
  return decimal === undefined ? `${sinal}${comMilhar}` : `${sinal}${comMilhar}${SEPARADOR_DECIMAL}${decimal}`;
}

/** "12,10 m". Unidade vazia → só o número. */
export function formatarQuantidade(valor: number, unidade: string, casas: number = CASAS_PADRAO): string {
  const numero = formatarNumero(valor, casas);
  const un = unidade.trim();
  return un === '' ? numero : `${numero} ${un}`;
}

const RE_COM_VIRGULA = /^[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+)?(?:,\d*)?$/;
const RE_MILHARES_SEM_VIRGULA = /^[+-]?\d{1,3}(?:\.\d{3}){2,}$/;
const RE_DECIMAL_COM_PONTO = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

/**
 * Lê um número digitado em pt-BR ou com ponto decimal. Inválido/vazio → null.
 *  - com vírgula: vírgula é o decimal e pontos são milhares ("3,07", "1.234,56", ",5");
 *  - sem vírgula, um único ponto: ponto é o decimal ("3.07"; atenção: "1.234" → 1,234);
 *  - sem vírgula, dois ou mais grupos de milhar: "1.234.567" → 1234567.
 */
export function lerNumero(texto: string): number | null {
  if (typeof texto !== 'string') return null;
  const t = texto.replace(/[\s ]/g, '');
  if (t === '' || !/\d/.test(t)) return null;
  let normalizado: string;
  if (t.includes(SEPARADOR_DECIMAL)) {
    if (!RE_COM_VIRGULA.test(t)) return null;
    normalizado = t.split(SEPARADOR_MILHAR).join('').replace(SEPARADOR_DECIMAL, '.');
  } else if (RE_MILHARES_SEM_VIRGULA.test(t)) {
    normalizado = t.split(SEPARADOR_MILHAR).join('');
  } else if (RE_DECIMAL_COM_PONTO.test(t)) {
    normalizado = t;
  } else {
    return null;
  }
  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}
