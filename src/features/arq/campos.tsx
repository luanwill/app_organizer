/** Campos de entrada compactos: confirmam no blur/Enter (uma alteração por edição, não por tecla). */
import { useEffect, useState, type KeyboardEvent } from 'react';
import { lerNumero } from '@/core/calc';

const aoTeclar = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur();
};

/** Número → texto pt-BR sem arredondar (0.145 → "0,145"). */
function textoDoNumero(valor: number | null): string {
  return valor === null ? '' : String(valor).replace('.', ',');
}

export const positivo = (v: number) => v > 0;
export const naoNegativo = (v: number) => v >= 0;

interface EntradaNumeroProps {
  valor: number | null;
  /** Recebe null somente quando `permiteVazio` e o campo foi esvaziado. */
  aoMudar: (valor: number | null) => void;
  permiteVazio?: boolean;
  /** Validação do número digitado (padrão: positivo). Valor recusado → volta ao anterior. */
  aceita?: (valor: number) => boolean;
  rotuloAcessivel?: string;
  placeholder?: string;
}

/** Entrada numérica pt-BR (aceita "3,07" e "3.07"). */
export function EntradaNumero({ valor, aoMudar, permiteVazio = false, aceita = positivo, rotuloAcessivel, placeholder }: EntradaNumeroProps) {
  const [texto, setTexto] = useState(textoDoNumero(valor));
  useEffect(() => setTexto(textoDoNumero(valor)), [valor]);

  const confirmar = () => {
    const limpo = texto.trim();
    if (limpo === '') {
      if (permiteVazio && valor !== null) aoMudar(null);
      else setTexto(textoDoNumero(valor));
      return;
    }
    const n = lerNumero(limpo);
    if (n === null || !aceita(n) || n === valor) {
      setTexto(textoDoNumero(valor));
      return;
    }
    aoMudar(n);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={texto}
      placeholder={placeholder}
      aria-label={rotuloAcessivel}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={aoTeclar}
    />
  );
}

interface EntradaTextoProps {
  valor: string;
  aoMudar: (valor: string) => void;
  rotuloAcessivel?: string;
}

/** Entrada de texto; vazio não é aceito (volta ao valor anterior). */
export function EntradaTexto({ valor, aoMudar, rotuloAcessivel }: EntradaTextoProps) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);

  const confirmar = () => {
    const limpo = texto.trim();
    if (limpo === '' || limpo === valor) setTexto(valor);
    else aoMudar(limpo);
  };

  return (
    <input
      type="text"
      value={texto}
      aria-label={rotuloAcessivel}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={aoTeclar}
    />
  );
}
