import { readSettingsListParams, writeSettingsListParams } from './settings-list-params';

it('reads only the page and its size', () => {
  expect(readSettingsListParams(new URLSearchParams('pagina=2&mostrar=50&buscar=x'))).toEqual({
    page: 2,
    pageSize: 50,
  });
});

it('writes a clean address and gives back what it wrote', () => {
  expect(writeSettingsListParams({ page: 1, pageSize: 20 }).toString()).toBe('');
  const view = { page: 3, pageSize: 100 };

  expect(readSettingsListParams(writeSettingsListParams(view))).toEqual(view);
});
