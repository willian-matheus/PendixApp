import { supabase } from '@/lib/supabase';

// Espelha src/pendix/services/contratantes.ts do PendixWeb. RLS da tabela
// `contratantes` só libera para roles admin/master/super_admin — ver
// policy "contratantes_admin_all".

export type Formapagamento = 'cartao' | 'pix' | 'boleto';

export interface Contratante {
  id: string;
  nome: string;
  cpf: string | null;
  email: string;
  forma_pagamento: Formapagamento | null;
  isento: boolean;
  user_id: string | null;
  created_at: string;
}

export interface ContratanteInput {
  nome: string;
  cpf?: string;
  email: string;
  forma_pagamento?: Formapagamento;
  isento?: boolean;
}

export async function getContratantes(): Promise<Contratante[]> {
  const { data, error } = await supabase
    .from('contratantes')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createContratante(input: ContratanteInput): Promise<Contratante> {
  const { data, error } = await supabase
    .from('contratantes')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateContratante(id: string, input: Partial<ContratanteInput>): Promise<void> {
  const { error } = await supabase.from('contratantes').update(input).eq('id', id);
  if (error) throw error;
}

export async function deleteContratante(id: string): Promise<void> {
  const { error } = await supabase.from('contratantes').delete().eq('id', id);
  if (error) throw error;
}
