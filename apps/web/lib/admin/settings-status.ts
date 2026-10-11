import type { SettingsVersion } from '@debus/contracts';

export type VersionStatus = 'current' | 'scheduled' | 'past';

export function versionStatus(
  version: SettingsVersion,
  current: SettingsVersion | null,
  today: string,
): VersionStatus {
  if (current?.id === version.id) return 'current';
  return version.effectiveFrom > today ? 'scheduled' : 'past';
}
