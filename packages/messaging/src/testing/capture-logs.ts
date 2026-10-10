import fs from 'node:fs';

type Writer = (...args: unknown[]) => unknown;

const POLL_INTERVAL_MS = 100;
const DEFAULT_ATTEMPTS = 50;

// Test helper: returns everything written to stdout/stderr while `run` executes. Depending on how
// the process is launched, pino writes through the file descriptor or through process.stdout, so
// every output channel is observed.
export async function captureLogs(
  run: () => Promise<void>,
  marker: string,
  attempts = DEFAULT_ATTEMPTS,
): Promise<string> {
  const chunks: string[] = [];
  const restores = (
    [
      [fs, 'write'],
      [fs, 'writeSync'],
      [process.stdout, 'write'],
      [process.stderr, 'write'],
    ] as const
  ).map(([target, method]) => {
    const holder = target as unknown as Record<string, Writer>;
    const original = holder[method] as Writer;
    holder[method] = function (this: unknown, ...args: unknown[]) {
      const [fd, data] = typeof args[0] === 'number' ? args : [1, args[0]];
      if (fd === 1 || fd === 2) chunks.push(String(data));
      return original.apply(this, args);
    };
    return () => {
      holder[method] = original;
    };
  });
  try {
    await run();
    // The logger flushes asynchronously: wait until the line carrying the marker shows up.
    for (let attempt = 0; attempt < attempts && !chunks.join('').includes(marker); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  } finally {
    for (const restore of restores) restore();
  }
  return chunks.join('');
}
