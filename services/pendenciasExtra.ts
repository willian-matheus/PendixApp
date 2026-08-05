import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PendixPrioridade } from '@/services/pendix';

// Campos do formulário de Pendências que ainda não têm coluna própria no
// banco (tipo cliente/empresa, prioridade na criação, data inicial de
// cobrança, frequência, anexo de exemplo). Guardados localmente por
// pendência, no mesmo espírito do módulo de Empresas.

const STORAGE_KEY = '@pendix/pendencias_extra';

export type FrequenciaCobranca = 'uma_vez' | 'diaria' | 'a_cada_2_dias' | 'semanal' | 'quinzenal' | 'mensal';

export interface PendenciaExtra {
  tipo: 'cliente' | 'empresa';
  empresaId?: string;
  descricao?: string;
  prioridade?: PendixPrioridade;
  dataInicialCobranca?: string;
  frequencia?: FrequenciaCobranca;
  anexoNome?: string;
}

async function readMap(): Promise<Record<string, PendenciaExtra>> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, PendenciaExtra>;
  } catch {
    return {};
  }
}

export async function getPendenciasExtraMap(): Promise<Record<string, PendenciaExtra>> {
  return readMap();
}

export async function getPendenciaExtra(pendenciaId: string): Promise<PendenciaExtra | null> {
  const map = await readMap();
  return map[pendenciaId] ?? null;
}

export async function salvarPendenciaExtra(pendenciaId: string, extra: PendenciaExtra): Promise<void> {
  const map = await readMap();
  map[pendenciaId] = extra;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}
