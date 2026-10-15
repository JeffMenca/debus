// A stand-in for the Postman sandbox: enough of `pm` to run the scripts of the collection.

export interface SandboxOptions {
  status?: number;
  contentType?: string;
  text?: string;
  requestName?: string;
  variables?: Record<string, unknown>;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export function sandbox(json: unknown = null, options: SandboxOptions = {}) {
  const variables = new Map<string, unknown>(Object.entries(options.variables ?? {}));
  const results: TestResult[] = [];
  const status = options.status ?? 200;
  const nextRequests: string[] = [];
  const sent: string[] = [];
  const expect = (value: unknown) => {
    const methods = {
      equal: (expected: unknown) => {
        if (value !== expected) throw new Error(`${String(value)} is not ${String(expected)}`);
      },
      include: (part: unknown) => {
        const found = Array.isArray(value)
          ? value.includes(part)
          : String(value).includes(String(part));
        if (!found) throw new Error(`${String(value)} lacks ${String(part)}`);
      },
    };
    const be = {
      ...methods,
      get true() {
        if (value !== true) throw new Error(`${String(value)} is not true`);
        return true;
      },
    };
    return { to: { ...methods, be } };
  };
  const pm = {
    collectionVariables: {
      set: (key: string, value: unknown) => variables.set(key, value),
      get: (key: string) => variables.get(key),
    },
    variables: {
      get: (key: string) => variables.get(key),
      set: (key: string, value: unknown) => variables.set(key, value),
    },
    info: { requestName: options.requestName ?? 'request' },
    response: {
      code: status,
      json: () => json,
      text: () => options.text ?? JSON.stringify(json),
      headers: { get: () => options.contentType ?? 'application/json' },
      to: {
        have: {
          status: (expected: number) => {
            if (status !== expected) throw new Error(`status ${status} is not ${expected}`);
          },
        },
      },
    },
    sendRequest: (url: string) => {
      sent.push(url);
    },
    expect,
    execution: { skipRequest: () => variables.set('skipped', true) },
    test: (name: string, body: () => void) => {
      try {
        body();
        results.push({ name, passed: true });
      } catch (error) {
        results.push({ name, passed: false, error: (error as Error).message });
      }
    },
  };
  const postman = { setNextRequest: (name: string) => nextRequests.push(name) };
  // Timers fire at once, so a script that waits before asking for the next request is checked as it ends.
  const immediately = (callback: () => void): void => callback();
  const run = (exec: string): unknown =>
    new Function('pm', 'postman', 'setTimeout', exec)(pm, postman, immediately) as unknown;
  const failed = () => results.filter((result) => !result.passed);
  return { variables, results, run, failed, nextRequests, sent };
}

export type Sandbox = ReturnType<typeof sandbox>;
