import { supabase } from '@/lib/supabase';
import { isSuperAdmin, sessionOfficeId } from '@/lib/session';

// Espelha src/pendix/services/empresas.ts do PendixWeb — `pendix_empresas` é
// uma tabela real (migration 0017_pendix_empresas.sql), não mock local.

export type EmpresaStatus = 'ativa' | 'inativa';

export interface Empresa {
  id: string;
  escritorio_id: string;
  nome: string;
  telefone: string;
  email: string;
  observacoes: string;
  status: EmpresaStatus;
  created_at: string;
  updated_at: string;
}

export async function getEmpresas(): Promise<Empresa[]> {
  let q = supabase.from('pendix_empresas').select('*').order('nome');
  if (!isSuperAdmin()) {
    const eid = sessionOfficeId();
    if (eid) q = q.eq('escritorio_id', eid);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Empresa[];
}

export async function criarEmpresa(
  p: Omit<Empresa, 'id' | 'escritorio_id' | 'created_at' | 'updated_at'>
): Promise<Empresa> {
  const eid = sessionOfficeId();
  const { data, error } = await supabase
    .from('pendix_empresas')
    .insert({ ...p, escritorio_id: eid })
    .select().single();
  if (error) throw error;
  return data as Empresa;
}

export async function atualizarEmpresa(
  id: string, p: Partial<Omit<Empresa, 'id' | 'escritorio_id' | 'created_at' | 'updated_at'>>
): Promise<Empresa> {
  const { data, error } = await supabase
    .from('pendix_empresas')
    .update({ ...p, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw error;
  return data as Empresa;
}

export async function excluirEmpresa(id: string): Promise<void> {
  const { error } = await supabase.from('pendix_empresas').delete().eq('id', id);
  if (error) throw error;
}
