export interface AuthSettings {
  privateKey: string;
  webUrl: string;
  bootstrapAdminEmail: string | null;
}

export const AUTH_SETTINGS = Symbol('AUTH_SETTINGS');

export function loadAuthSettings(env: Record<string, string | undefined>): AuthSettings {
  if (!env.JWT_PRIVATE_KEY) throw new Error('JWT_PRIVATE_KEY is required');
  const local = (env.DEBUS_ENV ?? 'local') === 'local';
  if (!env.WEB_URL && !local) throw new Error('WEB_URL is required');
  const admin = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  return {
    privateKey: env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    webUrl: (env.WEB_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
    bootstrapAdminEmail: admin || null,
  };
}
