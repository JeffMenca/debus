import type { DeployUnit } from '@debus/contracts';

interface ServiceDescription {
  spec?: {
    template?: {
      spec?: { containers?: { image?: string; env?: { name: string; value?: string }[] }[] };
    };
  };
}

function container(description: unknown): NonNullable<ServiceDescription['spec']> | undefined {
  return (description as ServiceDescription | undefined)?.spec;
}

// The image a Cloud Run service runs, from `gcloud run services describe --format=json`.
export function imageOf(description: unknown): string | undefined {
  return container(description)?.template?.spec?.containers?.[0]?.image;
}

// Plain environment variables only; secret references have no value here.
export function envOf(description: unknown): Record<string, string> {
  const entries = container(description)?.template?.spec?.containers?.[0]?.env ?? [];
  return Object.fromEntries(
    entries.filter((entry) => entry.value !== undefined).map((entry) => [entry.name, entry.value]),
  ) as Record<string, string>;
}

// Where each application value lives today. The keys and the address of the mail account are not in
// Secret Manager, so a release rebuilds them from the running services instead of asking for them again.
const VALUE_HOMES: readonly { unit: DeployUnit; names: readonly string[] }[] = [
  { unit: 'administracion', names: ['JWT_PRIVATE_KEY', 'BOOTSTRAP_ADMIN_EMAIL'] },
  { unit: 'gateway', names: ['JWT_PUBLIC_KEY'] },
  { unit: 'notificaciones', names: ['SMTP_USER', 'SMTP_PASSWORD'] },
];

// Values already present in `own` win, so a rotated key can be passed through the environment.
export function appValuesFromLive(
  own: Record<string, string | undefined>,
  descriptions: Partial<Record<DeployUnit, unknown>>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const { unit, names } of VALUE_HOMES) {
    const live = envOf(descriptions[unit]);
    for (const name of names) {
      const value = own[name] || live[name];
      if (value) values[name] = value;
    }
  }
  return values;
}

export function mediaBucketOf(description: unknown): string {
  return envOf(description).MEDIA_BUCKET ?? '';
}
