import {
  bearerAuth,
  jsonBody,
  pmTest,
  script,
  type PostmanAuth,
  type PostmanRequestItem,
} from './collection-types';

// Whose session a step uses: none, the system admin, the admin of the demo branch or the admin
// of the test branch that the writes folder creates.
export type Session = 'none' | 'admin' | 'branch' | 'test';

export interface Step {
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  session: Session;
  // The variable that holds the address the path hangs from.
  base?: 'baseUrl' | 'mailpitUrl';
  query?: string;
  body?: unknown;
  // Values of the `:name` variables of the path.
  variables?: Record<string, string>;
  prerequest?: string[];
  test: string[];
}

const TOKENS: Record<Exclude<Session, 'none'>, string> = {
  admin: '{{accessToken}}',
  branch: '{{branchAccessToken}}',
  test: '{{testBranchAccessToken}}',
};

const authOf = (session: Session): PostmanAuth =>
  session === 'none' ? { type: 'noauth' } : bearerAuth(TOKENS[session]);

export function toItem(step: Step): PostmanRequestItem {
  const base = `{{${step.base ?? 'baseUrl'}}}`;
  const segments = step.path.split('/').filter(Boolean);
  const variables = Object.entries(step.variables ?? {}).map(([key, value]) => ({ key, value }));
  return {
    name: step.name,
    request: {
      method: step.method,
      header: step.body === undefined ? [] : [{ key: 'Content-Type', value: 'application/json' }],
      url: {
        raw: `${base}${step.path}${step.query ? `?${step.query}` : ''}`,
        host: [base],
        path: segments,
        ...(step.query && {
          query: step.query.split('&').map((pair) => {
            const [key = '', ...value] = pair.split('=');
            return { key, value: value.join('=') };
          }),
        }),
        ...(variables.length > 0 && { variable: variables }),
      },
      auth: authOf(step.session),
      ...(step.body !== undefined && { body: jsonBody(step.body) }),
    },
    event: [
      ...(step.prerequest ? [script('prerequest', step.prerequest)] : []),
      script('test', step.test),
    ],
  };
}

export const status = (code: number): string[] =>
  pmTest(`Responde ${code}`, [`pm.response.to.have.status(${code});`]);
export const json = 'var json = pm.response.json();';
export const keep = (variable: string, expression: string): string =>
  `pm.collectionVariables.set(${JSON.stringify(variable)}, ${expression});`;

export const PAGE_OF_ROWS = pmTest('Trae una página de filas con su total', [
  json,
  'pm.expect(Array.isArray(json.items)).to.be.true;',
  "pm.expect(typeof json.total === 'number').to.be.true;",
]);
