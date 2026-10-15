import { FLOW } from './flow';
import { toCollection } from './openapi-to-collection';
import type { OpenApiDocument } from './openapi-types';

export const OPENAPI_FILE = 'openapi.json';
export const COLLECTION_FILE = 'debus.postman_collection.json';

const text = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

// The files committed to postman/: the OpenAPI document of the gateway and the collection built from it.
export function renderFiles(openapi: OpenApiDocument): Record<string, string> {
  return {
    [OPENAPI_FILE]: text(openapi),
    [COLLECTION_FILE]: text(toCollection(openapi, FLOW)),
  };
}

export function changedFiles(
  rendered: Record<string, string>,
  current: Record<string, string | undefined>,
): string[] {
  return Object.entries(rendered)
    .filter(([name, content]) => current[name] !== content)
    .map(([name]) => name);
}
