import type { UserRegisteredPayload } from '@debus/contracts';
import type { ClientProfile } from '../generated/prisma/client';

export type NewProfile = Omit<ClientProfile, 'createdAt' | 'updatedAt'>;

// Staff sign up without the client fields; they start empty and the person can fill them in.
export function toProfileRow({
  userId,
  email,
  fullName,
  role,
  profile,
}: UserRegisteredPayload): NewProfile {
  return {
    userId,
    email,
    fullName,
    role,
    dpi: profile?.dpi ?? null,
    phone: profile?.phone ?? null,
    nit: profile?.nit ?? null,
    address: profile?.address ?? null,
  };
}
