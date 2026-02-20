import type { UserRole } from '@tfsdc/kernel';
import type { AuthContext, IJwtVerifier } from '../types.js';

export type AuthResult =
  | { success: true; context: AuthContext }
  | { success: false; status: number; error: string };

export async function authenticate(
  authorizationHeader: string | undefined,
  jwtVerifier: IJwtVerifier,
): Promise<AuthResult> {
  const token = authorizationHeader?.replace('Bearer ', '');

  if (!token) {
    return { success: false, status: 401, error: 'Unauthorized' };
  }

  try {
    const payload = await jwtVerifier.verify(token);
    return {
      success: true,
      context: {
        actor: payload.sub,
        role: payload.role as UserRole,
      },
    };
  } catch {
    return { success: false, status: 401, error: 'Invalid token' };
  }
}
