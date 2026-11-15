import { criarPersistenciaDexie } from './persistencia';
import { criarStore } from './store';

export { criarStore, novoId } from './store';
export { criarPersistenciaDexie, criarPersistenciaMemoria } from './persistencia';
export type { DadosSalvos, Persistencia } from './persistencia';

export const useLevantamento = criarStore(criarPersistenciaDexie());
