/** Registro dos módulos (preenchido pelo orquestrador a cada leva). */
import type { MateriaisApi, ModuloDisciplina } from '@/core/model';
import { moduloArquitetura } from '@/features/arq';
import { moduloEstrutura } from '@/features/estrutura';
import { moduloEletrica } from '@/features/eletrica';
import { moduloHidraulica } from '@/features/hidraulica';
import { COMPOSICOES_PADRAO, calcularMateriais } from '@/features/materiais';

export type DisciplinaComModulo = 'arquitetura' | 'estrutura' | 'eletrica' | 'hidraulica';

export const MODULOS: Partial<Record<DisciplinaComModulo, ModuloDisciplina>> = {
  arquitetura: moduloArquitetura,
  estrutura: moduloEstrutura,
  eletrica: moduloEletrica,
  hidraulica: moduloHidraulica,
};

export const materiaisApi: MateriaisApi | null = { COMPOSICOES_PADRAO, calcularMateriais };
