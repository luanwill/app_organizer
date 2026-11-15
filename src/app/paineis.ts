/** Painéis extras da coluna esquerda e a vista 3D (só a casca do app importa este arquivo). */
import type { ComponentType } from 'react';
import { PainelDadosEssenciais } from '@/features/arq';
import { PainelMateriais } from '@/features/materiais';
import { PainelExportacao } from '@/features/export';

export const PAINEIS: {
  DadosEssenciais?: ComponentType;
  Materiais?: ComponentType;
  Exportacao?: ComponentType;
  Importacao?: ComponentType;
  Vista3D?: ComponentType;
} = {
  DadosEssenciais: PainelDadosEssenciais,
  Materiais: PainelMateriais,
  Exportacao: PainelExportacao,
};
