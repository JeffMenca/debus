import { BACKEND_SERVICES, type BackendService } from '@debus/contracts';
import type { OpenAPIObject } from '@nestjs/swagger';
import { canonicalPath, isInternalPath } from '../routing/canonical-path';

export interface ServiceDocument {
  service: BackendService;
  document: OpenAPIObject | null;
}

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

function namespaceRefs(document: OpenAPIObject, service: string): OpenAPIObject {
  const text = JSON.stringify(document).replaceAll(
    '"#/components/schemas/',
    `"#/components/schemas/${service}.`,
  );
  return JSON.parse(text) as OpenAPIObject;
}

type PathItem = OpenAPIObject['paths'][string];

function prefixTags(item: PathItem, unit: string): PathItem {
  const operations = { ...item };
  for (const method of METHODS) {
    const operation = operations[method];
    if (!operation) continue;
    operations[method] = {
      ...operation,
      tags: (operation.tags ?? ['general']).map((tag) => `${unit} · ${tag}`),
      ...(unit !== 'gateway' &&
        operation.operationId && { operationId: `${unit}_${operation.operationId}` }),
    };
  }
  return operations;
}

const firstTag = (item: PathItem): string =>
  METHODS.map((method) => item[method]?.tags?.[0]).find(Boolean) ?? '';

// Each unit keeps its health check first and its dead letters last, with its features in between.
function tagRank(tag: string): string {
  const feature = tag.slice(tag.indexOf(' · ') + 3);
  const position = feature === 'health' ? 0 : feature === 'dead-letters' ? 2 : 1;
  return `${position}${feature}`;
}

// The gateway goes first and then the services in the order of the topology.
function orderedTags(paths: OpenAPIObject['paths'], units: readonly string[]): string[] {
  const tags = new Set(Object.values(paths).map(firstTag));
  return units.flatMap((unit) =>
    [...tags]
      .filter((tag) => tag.startsWith(`${unit} · `))
      .sort((a, b) => tagRank(a).localeCompare(tagRank(b))),
  );
}

export function mergeOpenApi(
  gateway: OpenAPIObject,
  services: readonly ServiceDocument[],
): OpenAPIObject {
  const merged: OpenAPIObject['paths'] = {};
  for (const [path, item] of Object.entries(gateway.paths)) {
    merged[path] = prefixTags(item, 'gateway');
  }
  const schemas = { ...(gateway.components?.schemas ?? {}) };
  const missing: string[] = [];

  for (const { service, document } of services) {
    if (!document) {
      missing.push(service);
      continue;
    }
    const source = namespaceRefs(document, service);
    for (const [path, item] of Object.entries(source.paths ?? {})) {
      if (isInternalPath(canonicalPath(path))) continue;
      merged[`/api/${service}${path === '/' ? '' : path}`] = prefixTags(item, service);
    }
    for (const [name, schema] of Object.entries(source.components?.schemas ?? {})) {
      schemas[`${service}.${name}`] = schema;
    }
  }

  const note =
    missing.length > 0 ? `Unavailable when generated: ${missing.join(', ')}.` : undefined;
  const description = [gateway.info.description, note].filter(Boolean).join('\n\n');
  const tags = orderedTags(merged, ['gateway', ...BACKEND_SERVICES]);
  const entries = Object.entries(merged);
  const paths = Object.fromEntries(
    entries
      .map(([path, item], index) => ({ path, item, index, rank: tags.indexOf(firstTag(item)) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map(({ path, item }) => [path, item]),
  );
  return {
    ...gateway,
    info: { ...gateway.info, ...(description && { description }) },
    tags: tags.map((name) => ({ name })),
    paths,
    components: { ...gateway.components, schemas },
  };
}
