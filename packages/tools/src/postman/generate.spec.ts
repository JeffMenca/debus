import { COLLECTION_FILE, OPENAPI_FILE, changedFiles, renderFiles } from './generate';
import type { OpenApiDocument } from './openapi-types';

const OPENAPI: OpenApiDocument = {
  openapi: '3.0.0',
  info: { title: 'debus API', version: '1.0' },
  paths: { '/health': { get: { tags: ['health'], responses: { '200': {} } } } },
};

describe('renderFiles', () => {
  it('writes the OpenAPI document and the collection with two spaces and a final newline', () => {
    const files = renderFiles(OPENAPI);
    expect(Object.keys(files)).toEqual([OPENAPI_FILE, COLLECTION_FILE]);
    expect(files[OPENAPI_FILE]).toBe(`${JSON.stringify(OPENAPI, null, 2)}\n`);
    const collection = JSON.parse(files[COLLECTION_FILE] ?? '') as { info: { name: string } };
    expect(collection.info.name).toBe('debus API');
    expect(files[COLLECTION_FILE]?.endsWith('}\n')).toBe(true);
    expect(files[COLLECTION_FILE]).toContain('\n  "info"');
  });

  it('gives the same text for the same document', () => {
    expect(renderFiles(OPENAPI)).toEqual(renderFiles(JSON.parse(JSON.stringify(OPENAPI))));
  });

  it('includes the walkthrough', () => {
    expect(renderFiles(OPENAPI)[COLLECTION_FILE]).toContain('"name": "Recorrido"');
  });
});

describe('changedFiles', () => {
  const rendered = { 'a.json': 'one\n', 'b.json': 'two\n' };

  it('is empty when every file is as it should be', () => {
    expect(changedFiles(rendered, { 'a.json': 'one\n', 'b.json': 'two\n' })).toEqual([]);
  });

  it('names the files that differ or are missing', () => {
    expect(changedFiles(rendered, { 'a.json': 'one\n', 'b.json': 'other\n' })).toEqual(['b.json']);
    expect(changedFiles(rendered, { 'a.json': 'one\n' })).toEqual(['b.json']);
    expect(changedFiles(rendered, {})).toEqual(['a.json', 'b.json']);
  });
});
