/** "Recortes IA": apenas o encaixe para o futuro. NENHUMA chamada de API. */
import type { AIAnalyzer } from '@/core/model';
import { TEXTO_EM_BREVE } from './config';

export const aiAnalyzer: AIAnalyzer = {
  disponivel: false,
  analisarRecorte() {
    return Promise.reject(new Error(`Recortes IA: ${TEXTO_EM_BREVE}.`));
  },
};
