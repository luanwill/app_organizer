/** Painéis extras da coluna esquerda e a vista 3D (só a casca do app importa este arquivo). */
import type { ComponentType } from 'react';
import { PainelDadosEssenciais } from '@/features/arq';
import { PainelMateriais } from '@/features/materiais';
import { PainelExportacao } from '@/features/export';
import { PainelImportacao } from '@/features/import';
import { Visualizacao3D } from '@/features/3d';

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
  Importacao: PainelImportacao,
  Vista3D: Visualizacao3D,
};
