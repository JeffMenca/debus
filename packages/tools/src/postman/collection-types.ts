// The parts of the Postman Collection v2.1 format the collection uses, and the builders shared by
// the walkthrough and the generated folders.

export interface PostmanEvent {
  listen: 'test' | 'prerequest';
  script: { type: 'text/javascript'; exec: string[] };
}

export interface PostmanHeader {
  key: string;
  value: string;
  disabled?: boolean;
}

export interface PostmanQuery {
  key: string;
  value: string;
  disabled?: boolean;
}

export interface PostmanUrl {
  raw: string;
  host: string[];
  path: string[];
  query?: PostmanQuery[];
  variable?: { key: string; value: string }[];
}

export type PostmanAuth =
  | { type: 'noauth' }
  | { type: 'bearer'; bearer: { key: 'token'; value: string; type: 'string' }[] };

export type PostmanBody =
  | { mode: 'raw'; raw: string; options: { raw: { language: 'json' } } }
  | { mode: 'formdata'; formdata: { key: string; type: 'file'; src: null }[] };

export interface PostmanRequest {
  method: string;
  header: PostmanHeader[];
  url: PostmanUrl;
  auth: PostmanAuth;
  body?: PostmanBody;
  description?: string;
}

export interface PostmanRequestItem {
  name: string;
  request: PostmanRequest;
  event?: PostmanEvent[];
}

export interface PostmanFolder {
  name: string;
  description?: string;
  item: PostmanItem[];
  event?: PostmanEvent[];
}

export type PostmanItem = PostmanFolder | PostmanRequestItem;

export interface PostmanCollection {
  info: { name: string; description: string; schema: string };
  variable: { key: string; value: string }[];
  event: PostmanEvent[];
  item: PostmanItem[];
}

export const isFolder = (item: PostmanItem): item is PostmanFolder => 'item' in item;

export const script = (listen: PostmanEvent['listen'], exec: string[]): PostmanEvent => ({
  listen,
  script: { type: 'text/javascript', exec },
});

export const bearerAuth = (token: string): PostmanAuth => ({
  type: 'bearer',
  bearer: [{ key: 'token', value: token, type: 'string' }],
});

export const jsonBody = (value: unknown): PostmanBody => ({
  mode: 'raw',
  raw: JSON.stringify(value, null, 2),
  options: { raw: { language: 'json' } },
});

// A `pm.test` block of a Postman script.
export const pmTest = (name: string, lines: string[]): string[] => [
  `pm.test(${JSON.stringify(name)}, function () {`,
  ...lines.map((line) => `  ${line}`),
  '});',
];

export const PDF_TEST = pmTest('Devuelve un PDF', [
  'pm.expect(pm.response.headers.get("Content-Type")).to.include("application/pdf");',
]);
