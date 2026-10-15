// Scripts that keep a request from running where it must not.

// Everything that changes data runs only against a stack on this machine, so the collection can
// be pointed at production without writing a thing there.
export const LOCAL_ONLY = [
  '// Changes data: it only runs against a stack on this machine.',
  "var base = pm.variables.get('baseUrl') || '';",
  'if (!/^https?:\\/\\/(localhost|127\\.0\\.0\\.1|\\[::1\\])(:\\d+)?(\\/|$)/.test(base)) {',
  '  pm.execution.skipRequest();',
  '}',
];

export const neverRun = (reason: string): string[] => [
  `// Not run: ${reason}`,
  'pm.execution.skipRequest();',
];
