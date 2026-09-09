import { User } from '@/src/types';

export function getStoredAuthUser(): User | null {
  const storedUser = localStorage.getItem('auth_user');
  if (!storedUser) return null;

  try {
    const user = JSON.parse(storedUser) as User;
    if (!user || typeof user !== 'object' || typeof user.id !== 'string' || !user.role) {
      throw new Error('Invalid stored auth user');
    }
    return user;
  } catch {
    localStorage.removeItem('auth_user');
    return null;
  }
}
