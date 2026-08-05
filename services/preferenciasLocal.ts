import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@pendix/preferencias_aparencia';

export type Tema = 'claro' | 'escuro';

export interface PreferenciasAparencia {
  tema: Tema;
  corPrincipal: string;
}

export const CORES_DISPONIVEIS = ['#7c3aed', '#2563eb', '#059669', '#e11d48', '#d97706', '#0891b2'];

const DEFAULT: PreferenciasAparencia = { tema: 'escuro', corPrincipal: CORES_DISPONIVEIS[0] };

export async function getPreferenciasAparencia(): Promise<PreferenciasAparencia> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT;
  try {
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT;
  }
}

export async function salvarPreferenciasAparencia(prefs: PreferenciasAparencia): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}
