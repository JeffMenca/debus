import type { BackendService } from '@debus/contracts';
import type { OpenAPIObject } from '@nestjs/swagger';
import { isUnderPrefix } from '../routing/canonical-path';

export interface ServiceDocument {
  service: BackendService;
  document: OpenAPIObject | null;
}

const INTERNAL_PREFIXES = ['/events', '/outbox'];
const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

function namespaceRefs(document: OpenAPIObject, service: string): OpenAPIObject {
  const text = JSON.stringify(document).replaceAll(
    '"#/components/schemas/',
    `"#/components/schemas/${service}.`,
  );
  return JSON.parse(text) as OpenAPIObject;
}

export function mergeOpenApi(
  gateway: OpenAPIObject,
  services: readonly ServiceDocument[],
): OpenAPIObject {
  const paths: OpenAPIObject['paths'] = { ...gateway.paths };
  const schemas = { ...(gateway.components?.schemas ?? {}) };
  const missing: string[] = [];

  for (const { service, document } of services) {
    if (!document) {
      missing.push(service);
      continue;
    }
    const source = namespaceRefs(document, service);
    for (const [path, item] of Object.entries(source.paths ?? {})) {
      if (INTERNAL_PREFIXES.some((prefix) => isUnderPrefix(path, prefix))) continue;
      const operations = { ...item };
      for (const method of METHODS) {
        const operation = operations[method];
        if (!operation) continue;
        operations[method] = {
          ...operation,
          tags: (operation.tags ?? ['general']).map((tag) => `${service} · ${tag}`),
          ...(operation.operationId && { operationId: `${service}_${operation.operationId}` }),
        };
      }
      paths[`/api/${service}${path === '/' ? '' : path}`] = operations;
    }
    for (const [name, schema] of Object.entries(source.components?.schemas ?? {})) {
      schemas[`${service}.${name}`] = schema;
    }
  }

  const note =
    missing.length > 0 ? `Unavailable when generated: ${missing.join(', ')}.` : undefined;
  const description = [gateway.info.description, note].filter(Boolean).join('\n\n');
  return {
    ...gateway,
    info: { ...gateway.info, ...(description && { description }) },
    paths,
    components: { ...gateway.components, schemas },
  };
}
