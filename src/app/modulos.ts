/** Registro dos módulos (preenchido pelo orquestrador a cada leva). */
import type { MateriaisApi, ModuloDisciplina } from '@/core/model';

export const MODULOS: Partial<Record<'arquitetura' | 'estrutura' | 'eletrica' | 'hidraulica', ModuloDisciplina>> = {};

export const materiaisApi: MateriaisApi | null = null;
