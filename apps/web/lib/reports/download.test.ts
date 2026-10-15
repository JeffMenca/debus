import { downloadBlob } from './download';

describe('downloadBlob', () => {
  const createObjectURL = jest.fn(() => 'blob:report');
  const revokeObjectURL = jest.fn();

  beforeEach(() => {
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('downloads the file under its name and frees the object url once the browser took it', () => {
    jest.useFakeTimers();
    const clicked: { download: string; href: string }[] = [];
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ download: this.download, href: this.href });
    });

    downloadBlob(new Blob(['%PDF-']), 'reporte-buses-2026-10-13.pdf');

    expect(clicked).toEqual([{ download: 'reporte-buses-2026-10-13.pdf', href: 'blob:report' }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    jest.runAllTimers();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:report');
  });
});
