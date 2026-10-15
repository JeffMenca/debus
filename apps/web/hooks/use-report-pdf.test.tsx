import { act, renderHook, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { downloadBlob } from '../lib/reports/download';
import { queryWrapper } from '../test-support/query-wrapper';
import { useReportPdf } from './use-report-pdf';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../lib/reports/download');

const PATH = '/api/reportes/reports/branch-buses';

beforeEach(() => {
  jest.useFakeTimers({
    now: new Date('2026-10-13T18:00:00Z'),
    doNotFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'nextTick',
      'queueMicrotask',
    ],
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

const setup = () => {
  const { wrapper } = queryWrapper();
  return renderHook(
    () => useReportPdf(PATH, new URLSearchParams('status=IN_WORKSHOP'), 'reporte-buses'),
    { wrapper },
  );
};

describe('useReportPdf', () => {
  it('asks for the pdf with the search of the table and downloads it under the report and day name', async () => {
    const blob = new Blob(['%PDF-']);
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(blob, { headers: { 'content-type': 'application/pdf' } }));
    const { result } = setup();

    act(() => result.current.exportPdf());

    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:4000${PATH}/pdf?status=IN_WORKSHOP`,
      expect.anything(),
    );
    expect(jest.mocked(downloadBlob).mock.calls[0]?.[1]).toBe('reporte-buses-2026-10-13.pdf');
    await waitFor(() => expect(result.current.exporting).toBe(false));
  });

  it('is exporting while the file is on its way', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => undefined));
    const { result } = setup();

    act(() => result.current.exportPdf());

    await waitFor(() => expect(result.current.exporting).toBe(true));
  });

  it('shows the message of the server when the report is too big', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        Response.json({ statusCode: 409, message: 'Elige un periodo más corto.' }, { status: 409 }),
      );
    const { result } = setup();

    act(() => result.current.exportPdf());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Elige un periodo más corto.'));
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('asks to try again when the connection fails', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = setup();

    act(() => result.current.exportPdf());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('No pudimos preparar el PDF. Intenta de nuevo.'),
    );
  });
});
