// Specs that write data (accounts, branches) only run against a stack on this machine, never a deployed one.
export const isLocalStack = (baseURL: string | undefined): boolean =>
  Boolean(baseURL) && new URL(baseURL as string).hostname === 'localhost';
