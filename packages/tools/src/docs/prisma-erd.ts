// Reads the text of a Prisma schema (or several joined) and draws it as a Mermaid entity-relationship
// diagram with the real tables and columns, not the names of the models.

interface Field {
  name: string;
  column: string;
  type: string;
  optional: boolean;
  list: boolean;
  attributes: string;
}

interface Model {
  name: string;
  table: string;
  fields: Field[];
  compositeKey: Set<string>;
  // Each `@@unique([a, b])`: the fields that are unique only together.
  uniqueGroups: string[][];
}

const SCALARS: Record<string, string> = {
  String: 'text',
  Int: 'int',
  BigInt: 'bigint',
  Float: 'float',
  Boolean: 'boolean',
  DateTime: 'timestamp',
  Decimal: 'decimal',
  Json: 'jsonb',
  Bytes: 'bytea',
};

const blockPattern = /^(model|enum|generator|datasource)\s+(\w+)\s*\{([\s\S]*?)^\}/gm;

function names(list: string): string[] {
  return list.split(',').map((item) => item.trim());
}

function readFields(body: string): {
  fields: Field[];
  model: Pick<Model, 'table' | 'compositeKey' | 'uniqueGroups'>;
} {
  const fields: Field[] = [];
  const compositeKey = new Set<string>();
  const uniqueGroups: string[][] = [];
  let table = '';
  for (const raw of body.split('\n')) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    if (line.startsWith('@@')) {
      const map = /^@@map\("([^"]+)"\)/.exec(line);
      if (map?.[1]) table = map[1];
      const id = /^@@id\(\[([^\]]+)\]/.exec(line);
      if (id?.[1]) names(id[1]).forEach((name) => compositeKey.add(name));
      const unique = /^@@unique\(\[([^\]]+)\]/.exec(line);
      if (unique?.[1]) uniqueGroups.push(names(unique[1]));
      continue;
    }
    const match = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, name = '', type = '', list, optional, attributes = ''] = match;
    const column = /@map\("([^"]+)"\)/.exec(attributes)?.[1] ?? name;
    fields.push({
      name,
      column,
      type,
      optional: Boolean(optional),
      list: Boolean(list),
      attributes,
    });
  }
  return { fields, model: { table, compositeKey, uniqueGroups } };
}

// The local columns of a relation, from `@relation(fields: [...])`; empty for any other field.
function relationKeys(field: Field): string[] {
  const keys = /@relation\([^)]*fields:\s*\[([^\]]+)\]/.exec(field.attributes)?.[1];
  return keys ? names(keys) : [];
}

function columnType(field: Field): string {
  const native = /@db\.(\w+)/.exec(field.attributes)?.[1];
  if (native === 'Uuid') return 'uuid';
  if (native === 'Date') return 'date';
  if (native === 'Timestamptz') return 'timestamptz';
  return SCALARS[field.type] ?? field.type;
}

export function erdFromPrisma(schemaText: string): string {
  const models: Model[] = [];
  const enums = new Set<string>();
  for (const [, kind, name = '', body = ''] of schemaText.matchAll(blockPattern)) {
    if (kind === 'enum') enums.add(name);
    if (kind !== 'model') continue;
    const { fields, model } = readFields(body);
    models.push({ name, fields, ...model, table: model.table || name });
  }
  const byName = new Map(models.map((model) => [model.name, model]));
  const lines: string[] = ['erDiagram'];

  for (const model of models) {
    const foreignKeys = new Set(model.fields.flatMap(relationKeys));
    const columnOf = (name: string): string =>
      model.fields.find((candidate) => candidate.name === name)?.column ?? name;
    // A column that is unique only together with others cannot be marked UK by itself.
    const partnersOf = (name: string): string[] => [
      ...new Set(
        model.uniqueGroups
          .filter((group) => group.includes(name))
          .flatMap((group) => group.filter((other) => other !== name).map(columnOf)),
      ),
    ];
    lines.push(`  ${model.table} {`);
    for (const field of model.fields) {
      if (byName.has(field.type) || field.list) continue;
      const keys = [
        /@id\b/.test(field.attributes) || model.compositeKey.has(field.name) ? 'PK' : '',
        foreignKeys.has(field.name) ? 'FK' : '',
        /@unique\b/.test(field.attributes) ? 'UK' : '',
      ].filter(Boolean);
      const partners = partnersOf(field.name);
      const note = partners.length > 0 ? `"único junto con ${partners.join(', ')}"` : '';
      const type = enums.has(field.type) ? field.type : columnType(field);
      lines.push(`    ${[type, field.column, keys.join(', '), note].filter(Boolean).join(' ')}`);
    }
    lines.push('  }');
  }

  for (const model of models) {
    for (const field of model.fields) {
      const [firstKey] = relationKeys(field);
      const parent = byName.get(field.type);
      if (!firstKey || !parent) continue;
      const keyField = model.fields.find((candidate) => candidate.name === firstKey);
      if (!keyField) continue;
      const parentSide = field.optional ? '|o' : '||';
      // One row per parent when the key is unique, or is the whole primary key of the child.
      const oneToOne =
        /@unique\b|@id\b/.test(keyField.attributes) ||
        (model.compositeKey.size === 1 && model.compositeKey.has(keyField.name));
      const childSide = oneToOne ? 'o|' : 'o{';
      lines.push(
        `  ${parent.table} ${parentSide}--${childSide} ${model.table} : "${keyField.column}"`,
      );
    }
  }
  return lines.join('\n');
}
