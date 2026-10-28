import type {
  ProfileUpdatedPayload,
  UserRegisteredPayload,
  UserUpdatedPayload,
} from '@debus/contracts';
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

// A republished account stands in for a registration that never arrived. The client fields are
// not part of the event, so the person writes them again; a deactivated account gets no profile.
export function toRecoveredProfileRow({
  userId,
  email,
  fullName,
  role,
  active,
}: UserUpdatedPayload): NewProfile | null {
  if (!active) return null;
  return { userId, email, fullName, role, dpi: null, phone: null, nit: null, address: null };
}

export type ProfileNit = Pick<ClientProfile, 'userId' | 'fullName' | 'nit' | 'updatedAt'>;

// What ventas needs to link the counter sales made with this NIT to the client.
export function toProfileUpdated({
  userId,
  fullName,
  nit,
  updatedAt,
}: ProfileNit): ProfileUpdatedPayload {
  return { clientId: userId, nit, fullName, updatedAt: updatedAt.toISOString() };
}
