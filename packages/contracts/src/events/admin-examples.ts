import {
  type BranchChangedPayload,
  type SettingsUpdatedPayload,
  branchChangedPayloadSchema,
  settingsUpdatedPayloadSchema,
} from './admin-payloads';
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

export const ADMIN_PAYLOAD_SCHEMAS = {
  BranchCreated: branchChangedPayloadSchema,
  BranchUpdated: branchChangedPayloadSchema,
  SettingsUpdated: settingsUpdatedPayloadSchema,
} as const;

export const ADMIN_EXAMPLES: Record<keyof typeof ADMIN_PAYLOAD_SCHEMAS, unknown> = {
  BranchCreated: exampleBranch,
  BranchUpdated: { ...exampleBranch, name: 'Quetzaltenango Centro', version: 2 },
  SettingsUpdated: exampleSettingsUpdated,
};
