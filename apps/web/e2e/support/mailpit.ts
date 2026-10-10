const LOCAL_MAILPIT = 'http://localhost:8025';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Mailpit only exists next to a local stack; against a deployed web it must be given explicitly.
export function mailpitUrl(baseURL: string | undefined): string | undefined {
  if (process.env.MAILPIT_URL) return process.env.MAILPIT_URL;
  return baseURL && new URL(baseURL).hostname === 'localhost' ? LOCAL_MAILPIT : undefined;
}

export async function isReachable(mailpit: string): Promise<boolean> {
  try {
    return (await fetch(`${mailpit}/api/v1/info`)).ok;
  } catch {
    return false;
  }
}

// Returns the path and query only: the email points at the configured public address,
// which is not where the test web server listens.
export async function latestLink(mailpit: string, to: string, path: string): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const search = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    if (messages[0]) {
      const message = await fetch(`${mailpit}/api/v1/message/${messages[0].ID}`);
      const { HTML } = (await message.json()) as { HTML: string };
      const match = new RegExp(`href="([^"]*${path}\\?token=[^"]+)"`).exec(HTML);
      if (match?.[1]) {
        const link = new URL(match[1].replace(/&amp;/g, '&'));
        return `${link.pathname}${link.search}`;
      }
    }
    await sleep(500);
  }
  throw new Error(`No email with ${path} reached ${to}`);
}
