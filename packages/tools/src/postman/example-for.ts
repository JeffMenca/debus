import type { SchemaObject } from './openapi-types';

// What a field with this name looks like when the schema (the input side of a zod pipe) says only
// "string". The values are valid for the real rules.
const BY_NAME: Record<string, string> = {
  code: 'TST',
  phone: '55550000',
  dpi: '2345678901234',
  plate: 'C123ABC',
  licenseNumber: 'LIC12345',
};
// Names that stand for a Postman variable: the walkthrough fills them in.
const VARIABLE_NAMES = new Set(['refreshToken', 'token']);
const TEXT = 'texto';

export interface ExampleOptions {
  // Turns the name of a field into the name of the variable that holds its value.
  variable?: (name: string) => string;
  // Fixed values for fields with these names.
  text?: Record<string, string>;
}

const asIs = (name: string): string => name;

function textFor(schema: SchemaObject, name: string, options: ExampleOptions): string {
  if (schema.format === 'email' || /email/i.test(name)) return '{{email}}';
  const fixed = options.text?.[name];
  if (fixed !== undefined) return fixed;
  if (VARIABLE_NAMES.has(name)) return `{{${(options.variable ?? asIs)(name)}}}`;
  const known = BY_NAME[name];
  if (known) return known;
  const padded = TEXT.padEnd(schema.minLength ?? 0, 'x');
  return schema.maxLength === undefined ? padded : padded.slice(0, schema.maxLength);
}

function stringFor(schema: SchemaObject, name: string, options: ExampleOptions): string {
  if (schema.format === 'uuid') {
    return name.endsWith('Id') ? `{{${(options.variable ?? asIs)(name)}}}` : '{{$guid}}';
  }
  if (schema.format === 'date') return '{{today}}';
  if (schema.format === 'date-time') return '{{$isoTimestamp}}';
  return textFor(schema, name, options);
}

function numberFor(schema: SchemaObject): number {
  const floor =
    schema.minimum ?? (schema.exclusiveMinimum === undefined ? 0 : schema.exclusiveMinimum + 1);
  return schema.maximum === undefined ? floor : Math.min(floor, schema.maximum);
}

function objectFor(schema: SchemaObject, options: ExampleOptions): Record<string, unknown> {
  const properties = schema.properties ?? {};
  const required = schema.required ?? [];
  // An object with nothing required (a partial update) shows every field, so it is useful as an example.
  const names = required.length > 0 ? required : Object.keys(properties);
  return Object.fromEntries(
    names.flatMap((name) => {
      const property = properties[name];
      return property ? [[name, exampleFor(property, name, options)]] : [];
    }),
  );
}

function mergeAllOf(parts: SchemaObject[]): SchemaObject {
  return parts.reduce<SchemaObject>(
    (merged, part) => ({
      ...merged,
      ...part,
      properties: { ...merged.properties, ...part.properties },
      required: [...(merged.required ?? []), ...(part.required ?? [])],
    }),
    { type: 'object' },
  );
}

// A request body that the real validation would accept, built from the JSON schema of the API.
// Values that depend on what exists (an id) or on the day are Postman variables.
export function exampleFor(schema: SchemaObject, name = '', options: ExampleOptions = {}): unknown {
  if (schema.const !== undefined) return schema.const;
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];
  if (schema.default !== undefined) return schema.default;
  const choices = schema.anyOf ?? schema.oneOf;
  if (choices) {
    const first = choices.find((option) => option.type !== 'null');
    return first ? exampleFor(first, name, options) : null;
  }
  if (schema.allOf) return exampleFor(mergeAllOf(schema.allOf), name, options);
  switch (schema.type) {
    case 'string':
      return stringFor(schema, name, options);
    case 'integer':
    case 'number':
      return numberFor(schema);
    case 'boolean':
      return true;
    case 'object':
      return objectFor(schema, options);
    case 'array':
      return schema.items ? [exampleFor(schema.items, name, options)] : [];
    default:
      return null;
  }
}
