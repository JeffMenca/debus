// Some browsers cancel a download whose object url is revoked in the same tick as the click.
const REVOKE_DELAY_MS = 10_000;

// Hands a file the browser already holds to the person, under the name given.
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
