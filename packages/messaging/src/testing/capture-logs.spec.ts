import fs from 'node:fs';
import { captureLogs } from './capture-logs';

describe('captureLogs', () => {
  it('collects what is written through process.stdout, process.stderr and the file descriptors', async () => {
    const output = await captureLogs(async () => {
      process.stdout.write('from-stdout ');
      process.stderr.write('from-stderr ');
      fs.writeSync(1, 'from-sync-fd ');
      await new Promise<void>((resolve) => fs.write(2, 'from-async-fd ', () => resolve()));
    }, 'from-async-fd');

    for (const expected of ['from-stdout', 'from-stderr', 'from-sync-fd', 'from-async-fd']) {
      expect(output).toContain(expected);
    }
  });

  it('ignores writes to other file descriptors', async () => {
    const path = `${process.env.TMPDIR ?? '/tmp'}/capture-logs-${process.pid}.txt`;
    const fd = fs.openSync(path, 'w');
    try {
      const output = await captureLogs(async () => {
        fs.writeSync(fd, 'to-a-file');
        process.stdout.write('marker');
      }, 'marker');

      expect(output).not.toContain('to-a-file');
    } finally {
      fs.closeSync(fd);
      fs.rmSync(path);
    }
  });

  it('waits for the marker to show up and gives up after a while', async () => {
    const late = captureLogs(async () => {
      setTimeout(() => process.stdout.write('late-marker'), 150);
    }, 'late-marker');

    await expect(late).resolves.toContain('late-marker');
    await expect(captureLogs(async () => undefined, 'never-written', 3)).resolves.toBe('');
  });

  it('restores the original writers, even when the run fails', async () => {
    const before = [fs.write, fs.writeSync, process.stdout.write, process.stderr.write];

    await expect(
      captureLogs(async () => {
        throw new Error('boom');
      }, 'x'),
    ).rejects.toThrow('boom');

    expect([fs.write, fs.writeSync, process.stdout.write, process.stderr.write]).toEqual(before);
  });
});
