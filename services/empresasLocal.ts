import AsyncStorage from '@react-native-async-storage/async-storage';

// Empresas ainda não têm uma tabela própria no banco (só existe o domínio de
// clientes/pendências). Enquanto isso, este módulo guarda os dados localmente
// no aparelho (AsyncStorage) para a interface funcionar de ponta a ponta.

const STORAGE_KEY = '@pendix/empresas';

export type EmpresaStatus = 'ativa' | 'inativa';

export interface Empresa {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  observacoes: string;
  status: EmpresaStatus;
  created_at: string;
}

const SEED: Empresa[] = [
  {
    id: 'seed-1', nome: 'Alfa Contabilidade Ltda', telefone: '(11) 4002-8922', email: 'contato@alfacont.com.br',
    observacoes: 'Cliente desde 2022, faturamento mensal recorrente.', status: 'ativa', created_at: new Date().toISOString(),
  },
  {
    id: 'seed-2', nome: 'Beta Comércio de Peças', telefone: '(21) 3555-0199', email: 'financeiro@betapecas.com.br',
    observacoes: '', status: 'ativa', created_at: new Date().toISOString(),
  },
];

function uid() {
  return `emp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readAll(): Promise<Empresa[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(SEED));
    return SEED;
  }
  try {
    return JSON.parse(raw) as Empresa[];
  } catch {
    return [];
  }
}

async function writeAll(empresas: Empresa[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(empresas));
}

export async function getEmpresas(): Promise<Empresa[]> {
  const all = await readAll();
  return [...all].sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function criarEmpresa(p: Omit<Empresa, 'id' | 'created_at'>): Promise<Empresa> {
  const all = await readAll();
  const nova: Empresa = { ...p, id: uid(), created_at: new Date().toISOString() };
  await writeAll([nova, ...all]);
  return nova;
}

export async function atualizarEmpresa(id: string, p: Partial<Omit<Empresa, 'id' | 'created_at'>>): Promise<Empresa> {
  const all = await readAll();
  const idx = all.findIndex((e) => e.id === id);
  if (idx === -1) throw new Error('Empresa não encontrada.');
  const atualizada = { ...all[idx], ...p };
  all[idx] = atualizada;
  await writeAll(all);
  return atualizada;
}

export async function excluirEmpresa(id: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter((e) => e.id !== id));
}

// ── Vínculo cliente → empresa ────────────────────────────────────────────────
// Assim como as próprias empresas, esse vínculo não existe no banco ainda
// (a tabela pendix_clientes não tem coluna de empresa). Guardado localmente
// como um mapa simples { clienteId: empresaId }.

const VINCULOS_KEY = '@pendix/clientes_empresas';

async function readVinculos(): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(VINCULOS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function getVinculosEmpresa(): Promise<Record<string, string>> {
  return readVinculos();
}

export async function setVinculoEmpresa(clienteId: string, empresaId: string | null): Promise<void> {
  const map = await readVinculos();
  if (empresaId) map[clienteId] = empresaId;
  else delete map[clienteId];
  await AsyncStorage.setItem(VINCULOS_KEY, JSON.stringify(map));
}
