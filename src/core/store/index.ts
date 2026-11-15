// STUB do orquestrador — o subagente S3 substitui pela store real (Zustand + Dexie).
import type { StoreApi, UseBoundStore } from 'zustand';
import type { LevantamentoStore } from '@/core/model';
export const useLevantamento = null as unknown as UseBoundStore<StoreApi<LevantamentoStore>>;
