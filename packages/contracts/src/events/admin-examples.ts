import {
  type BranchChangedPayload,
  type SettingsUpdatedPayload,
  branchChangedPayloadSchema,
  settingsUpdatedPayloadSchema,
} from './admin-payloads';
import { type UserUpdatedPayload, userUpdatedPayloadSchema } from './account-payloads';
import { EXAMPLE_IDS } from './fleet-examples';

export const exampleBranch: BranchChangedPayload = {
  branchId: EXAMPLE_IDS.branch,
  code: 'XEL',
  name: 'Quetzaltenango',
  department: 'Quetzaltenango',
  municipality: 'Quetzaltenango',
  address: '4a calle 12-30 zona 1',
  phone: '77612233',
  latitude: 14.8347,
  longitude: -91.5181,
  active: true,
  version: 1,
};

export const exampleSettingsUpdated: SettingsUpdatedPayload = {
  versionId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  depreciationPerKm: 1.5,
  rentalRatePerKm: 12,
  effectiveFrom: '2026-10-01',
  createdAt: '2026-10-01T15:00:00.000Z',
};

export const exampleUserUpdated: UserUpdatedPayload = {
  userId: '3b2a1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d',
  email: 'marta.choc@debus.gt',
  fullName: 'Marta Choc',
  role: 'BRANCH_ADMIN',
  branchId: EXAMPLE_IDS.branch,
  active: true,
  version: 2,
};

export const ADMIN_PAYLOAD_SCHEMAS = {
  BranchCreated: branchChangedPayloadSchema,
  BranchUpdated: branchChangedPayloadSchema,
  SettingsUpdated: settingsUpdatedPayloadSchema,
  UserUpdated: userUpdatedPayloadSchema,
} as const;

export const ADMIN_EXAMPLES: Record<keyof typeof ADMIN_PAYLOAD_SCHEMAS, unknown> = {
  BranchCreated: exampleBranch,
  BranchUpdated: { ...exampleBranch, name: 'Quetzaltenango Centro', version: 2 },
  SettingsUpdated: exampleSettingsUpdated,
  UserUpdated: exampleUserUpdated,
};
