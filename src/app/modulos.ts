/** Registro dos módulos (preenchido pelo orquestrador a cada leva). */
import type { ComponentType } from 'react';
import type { MateriaisApi, ModuloDisciplina } from '@/core/model';
import { moduloArquitetura, PainelDadosEssenciais } from '@/features/arq';
import { moduloEstrutura } from '@/features/estrutura';
import { moduloEletrica } from '@/features/eletrica';
import { moduloHidraulica } from '@/features/hidraulica';

export type DisciplinaComModulo = 'arquitetura' | 'estrutura' | 'eletrica' | 'hidraulica';

export const MODULOS: Partial<Record<DisciplinaComModulo, ModuloDisciplina>> = {
  arquitetura: moduloArquitetura,
  estrutura: moduloEstrutura,
  eletrica: moduloEletrica,
  hidraulica: moduloHidraulica,
};

export const materiaisApi: MateriaisApi | null = null;

/** Painéis extras da coluna esquerda e a vista 3D. */
export const PAINEIS: {
  DadosEssenciais?: ComponentType;
  Materiais?: ComponentType;
  Exportacao?: ComponentType;
  Importacao?: ComponentType;
  Vista3D?: ComponentType;
} = {
  DadosEssenciais: PainelDadosEssenciais,
};
