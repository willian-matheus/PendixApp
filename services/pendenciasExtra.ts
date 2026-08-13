import AsyncStorage from '@react-native-async-storage/async-storage';

// tipo, descrição, prioridade, data inicial de cobrança, horário de
// notificação, datas de notificação extra e anexo de exemplo agora são
// colunas reais em pendix_pendencias (mesmo schema usado pelo PendixWeb —
// ver supabase/migrations/0011, 0013 e 0014 do site). O que resta aqui é só
// o vínculo com "empresa" (agrupador que ainda vive só no dispositivo, sem
// tabela no Supabase — ver services/empresasLocal.ts), no mesmo espírito do
// site (ver "Extras locais da pendência" em pendix.ts do PendixWeb).

const STORAGE_KEY = '@pendix/pendencias_extra';

export interface PendenciaExtra {
  empresaId?: string;
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
