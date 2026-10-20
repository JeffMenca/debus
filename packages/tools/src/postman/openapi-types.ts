export interface SchemaObject {
  type?: string;
  format?: string;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  items?: SchemaObject;
  anyOf?: SchemaObject[];
  oneOf?: SchemaObject[];
  allOf?: SchemaObject[];
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  $ref?: string;
  [key: string]: unknown;
}

export interface ParameterObject {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: SchemaObject;
}

export interface OperationObject {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: ParameterObject[];
  requestBody?: { required?: boolean; content: Record<string, { schema?: SchemaObject }> };
  responses?: Record<string, { description?: string }>;
  security?: Record<string, string[]>[];
}

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, Partial<Record<HttpMethod, OperationObject>>>;
  [key: string]: unknown;
}
