import type {
  ProfileUpdatedPayload,
  UserRegisteredPayload,
  UserUpdatedPayload,
} from '@debus/contracts';
import type { ClientProfile } from '../generated/prisma/client';

export type NewProfile = Omit<ClientProfile, 'active' | 'searchText' | 'createdAt' | 'updatedAt'>;

// Staff sign up without the client fields; they start empty and the person can fill them in.
export function toProfileRow({
  userId,
  email,
  fullName,
  role,
  profile,
  version,
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
    accountVersion: version ?? 0,
  };
}

// A republished account stands in for a registration that never arrived. The client fields are not
// part of the event, so the person writes them again. A deactivated account gets its row too: it
// keeps the account hidden if its registration arrives afterwards.
export function toRecoveredProfileRow({
  userId,
  email,
  fullName,
  role,
}: UserUpdatedPayload): NewProfile {
  return {
    userId,
    email,
    fullName,
    role,
    dpi: null,
    phone: null,
    nit: null,
    address: null,
    accountVersion: 0,
  };
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
