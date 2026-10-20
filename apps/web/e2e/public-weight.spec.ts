import { gzipSync } from 'node:zlib';
import { type APIRequestContext, expect, test } from '@playwright/test';

const realApi = Boolean(process.env.E2E_REAL_API);

interface Script {
  path: string;
  raw: number;
  gzip: number;
  zod: boolean;
}

// The scripts a page asks for in its own HTML, which is what a first visit has to download before
// anything shows. The ones the browser fetches later, such as the code of the pages that the links
// lead to, are not part of that.
async function initialScripts(request: APIRequestContext, path: string): Promise<Script[]> {
  const html = await (await request.get(path)).text();
  const sources = [...new Set(html.match(/\/_next\/static\/[^"')\s]+\.js/g) ?? [])];
  return Promise.all(
    sources.map(async (source) => {
      const body = await (await request.get(source)).body();
      return {
        path: source,
        raw: body.length,
        gzip: gzipSync(body).length,
        zod: body.includes('ZodError'),
      };
    }),
  );
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

// Measures what the public pages send, and keeps `zod` out of the home page, which is the first
// screen of the site. The weight is printed, never asserted.
test.describe('weight of the public pages', () => {
  test.skip(realApi, 'runs only without a real gateway');
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'it does not depend on the width');
  });

  for (const path of ['/', '/login']) {
    test(`initial scripts of ${path}`, async ({ request }) => {
      const scripts = await initialScripts(request, path);

      expect(scripts.length).toBeGreaterThan(0);
      const withZod = scripts.filter((script) => script.zod);
      console.log(
        `public-weight ${path}: ${scripts.length} scripts, ` +
          `${kb(scripts.reduce((sum, script) => sum + script.raw, 0))} raw, ` +
          `${kb(scripts.reduce((sum, script) => sum + script.gzip, 0))} gzip; ` +
          `with ZodError: ${withZod.map((script) => `${script.path} ${kb(script.gzip)} gzip`).join(', ') || 'none'}`,
      );
    });
  }

  test('the home page of a visitor does not download the code of zod', async ({ request }) => {
    const scripts = await initialScripts(request, '/');

    expect(scripts.filter((script) => script.zod).map((script) => script.path)).toEqual([]);
  });
});
