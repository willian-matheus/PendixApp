import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { setSessionUser } from '@/lib/session';

export type PlanType = 'normal' | 'pro';

export type PendixAppUser = {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  role: string;
  officeId?: string;
  companyId?: string;
  telas?: string[];
  companyIds?: string[];
  plano?: PlanType;
};

type AuthContextType = {
  user: PendixAppUser | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, senha: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (fields: { nome?: string; telefone?: string }) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

const ROLES_VALIDOS = ['admin', 'dono_escritorio', 'contador', 'cliente_empresa', 'acesso_completo', 'visualizador'];

// Mesma lógica do AuthProvider do site (src/app/auth/AuthProvider.tsx): busca o
// perfil na tabela `usuarios`, com fallback pro user_metadata do Supabase Auth
// se o registro não existir ou tiver role inválida.
async function fetchUserProfile(userId: string, authEmail: string): Promise<PendixAppUser | null> {
  try {
    const { data, error } = await supabase.from('usuarios').select('*').eq('id', userId).single();

    let fonte: 'tabela' | 'metadata' = 'tabela';
    if (error || !data || !ROLES_VALIDOS.includes(data.role)) fonte = 'metadata';

    let id: string, nome: string, role: string, escritorio_id: string | null,
      empresa_id: string | null, telas: string[], empresa_ids: string[], telefone: string | undefined;

    const { data: authData } = await supabase.auth.getUser();
    const meta = authData?.user?.user_metadata || {};

    if (fonte === 'tabela') {
      id = data.id;
      nome = data.nome;
      role = data.role;
      escritorio_id = data.escritorio_id;
      empresa_id = data.empresa_id;
      telas = data.telas || ['Dashboard'];
      empresa_ids = data.empresa_ids || [];
      telefone = data.telefone || meta.telefone || undefined;
    } else {
      id = userId;
      nome = meta.nome || authEmail;
      role = meta.role || 'dono_escritorio';
      escritorio_id = meta.escritorio_id || null;
      empresa_id = meta.empresa_id || null;
      telas = meta.telas || [];
      empresa_ids = meta.empresa_ids || [];
      telefone = meta.telefone || undefined;
    }

    let plano: PlanType = 'normal';
    if (escritorio_id) {
      const { data: escData } = await supabase.from('escritorios').select('plano').eq('id', escritorio_id).maybeSingle();
      if (escData?.plano === 'pro') plano = 'pro';
    }

    return {
      id, nome, email: authEmail, telefone, role,
      officeId: escritorio_id ?? undefined,
      companyId: empresa_id ?? undefined,
      telas, companyIds: empresa_ids, plano,
    };
  } catch (err) {
    console.error('[Auth] Exceção ao buscar perfil:', err);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PendixAppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSessionUser(user);
  }, [user]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        fetchUserProfile(session.user.id, session.user.email || '').then((profile) => {
          setUser(profile);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
      } else if (session) {
        setLoading(false);
        fetchUserProfile(session.user.id, session.user.email || '').then((profile) => {
          if (profile) setUser(profile);
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, senha: string) => {
    setError(null);
    setLoading(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (signInError) {
        if (signInError.message?.toLowerCase().includes('email not confirmed')) {
          throw new Error('E-mail não confirmado. Verifique sua caixa de entrada.');
        }
        if (signInError.message?.toLowerCase().includes('invalid login credentials')) {
          throw new Error('E-mail ou senha incorretos.');
        }
        throw new Error(signInError.message || 'E-mail ou senha incorretos.');
      }
      if (data.session) {
        const profile = await fetchUserProfile(data.session.user.id, data.session.user.email || '');
        setUser(profile);
      }
    } catch (err: any) {
      setError(err.message || 'Não foi possível fazer login.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const updateProfile = async (fields: { nome?: string; telefone?: string }) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error('Sessão inválida.');

    const { error: metaError } = await supabase.auth.updateUser({ data: { ...fields } });
    if (metaError) throw metaError;

    try {
      await supabase.from('usuarios').update(fields).eq('id', authUser.id);
    } catch {
      // best-effort — nem toda conta tem registro na tabela `usuarios`
    }

    const profile = await fetchUserProfile(authUser.id, authUser.email || '');
    if (profile) setUser(profile);
  };

  const value = useMemo(() => ({ user, loading, error, signIn, signOut, updateProfile }), [user, loading, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
