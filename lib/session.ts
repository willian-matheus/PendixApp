import type { PendixAppUser } from '@/context/AuthContext';

// Espelho síncrono do usuário autenticado (o equivalente RN do
// localStorage.getItem('flash_user') usado pelo services/pendix.ts no site).
// O AuthContext atualiza isso toda vez que o estado de user muda; os serviços
// de dados leem daqui em vez de precisar de acesso assíncrono ao AsyncStorage.
let currentUser: PendixAppUser | null = null;

export function setSessionUser(user: PendixAppUser | null) {
  currentUser = user;
}

export function getSessionUser(): PendixAppUser | null {
  return currentUser;
}

export function isSuperAdmin(): boolean {
  const role = currentUser?.role;
  return role === 'super_admin' || role === 'admin';
}

export function sessionOfficeId(): string | null {
  return currentUser?.officeId ?? null;
}
