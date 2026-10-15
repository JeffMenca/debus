import { todayInGuatemala } from '@debus/contracts';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, apiBlob } from '@/lib/api/client';
import { downloadBlob } from '@/lib/reports/download';

export const PDF_FAILED = 'No pudimos preparar el PDF. Intenta de nuevo.';

// The PDF holds every filtered row, so it asks with the same search the table has. The server names
// the file the same way, so the download matches what the browser would have saved.
export function useReportPdf(path: string, search: URLSearchParams, fileStem: string) {
  const query = search.toString();
  const mutation = useMutation({
    mutationFn: async () => {
      const blob = await apiBlob(`${path}/pdf?${query}`);
      downloadBlob(blob, `${fileStem}-${todayInGuatemala()}.pdf`);
    },
    // A refusal of the server (a report too big) carries a text for the person; a lost connection does not.
    onError: (error) =>
      toast.error(error instanceof ApiError && error.status > 0 ? error.message : PDF_FAILED),
  });
  return { exportPdf: () => mutation.mutate(), exporting: mutation.isPending };
}
