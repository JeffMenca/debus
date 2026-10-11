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

// The nearest change still to come; between two on the same day, the one recorded last wins.
export function upcomingVersion(
  versions: SettingsVersion[],
  today: string,
): SettingsVersion | null {
  let best: SettingsVersion | null = null;
  for (const version of versions) {
    if (version.effectiveFrom <= today) continue;
    const nearer =
      !best ||
      version.effectiveFrom < best.effectiveFrom ||
      (version.effectiveFrom === best.effectiveFrom && version.createdAt > best.createdAt);
    if (nearer) best = version;
  }
  return best;
}
