import type { UserRegisteredPayload } from '@debus/contracts';

export interface ProfileRow {
  userId: string;
  email: string;
  fullName: string;
  role: string;
  dpi: string | null;
  phone: string | null;
  nit: string | null;
  address: string | null;
}

// Staff sign up without the client fields; they start empty and the person can fill them in.
export function toProfileRow({
  userId,
  email,
  fullName,
  role,
  profile,
}: UserRegisteredPayload): ProfileRow {
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
