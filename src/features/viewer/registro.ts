/** Registro (em módulo) do capturador da planta montada, para a exportação. */
type Capturador = () => Promise<string | null>;

let capturadorAtual: Capturador | null = null;

/** O Visualizador montado registra aqui como capturar a página atual. Devolve a função de limpeza. */
export function registrarCapturador(capturador: Capturador): () => void {
  capturadorAtual = capturador;
  return () => {
    if (capturadorAtual === capturador) capturadorAtual = null;
  };
}

/** PNG (data URL) da página atual com as camadas visíveis; null se não houver planta. */
export async function capturarPlantaComCamadas(): Promise<string | null> {
  return capturadorAtual ? capturadorAtual() : null;
}
