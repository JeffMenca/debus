import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiBlob, apiRequest, noContent } from '@/lib/api/client';
import { useObjectUrl } from './use-object-url';

const PHOTO_STALE_MS = 5 * 60 * 1000;

// The gateway needs the session token, so a plain <img src> cannot load the picture: it is fetched
// as a blob and shown through an object URL, which is released when it is no longer shown.
export function usePhoto(path: string | null): string | null {
  const { data: blob } = useQuery({
    queryKey: ['photo', path],
    queryFn: () => apiBlob(path as string),
    enabled: Boolean(path),
    staleTime: PHOTO_STALE_MS,
    retry: false,
  });
  const url = useObjectUrl(blob);

  return path ? url : null;
}

// Every picture is saved and served under `<collection>/<id>/photo`.
export function photoPathOf(collectionPath: string, id: string): string {
  return `${collectionPath}/${id}/photo`;
}

// The list that shows the picture refreshes too.
export function useUploadPhoto(collectionPath: string, listKey: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const body = new FormData();
      body.append('photo', file);
      return apiRequest(photoPathOf(collectionPath, id), noContent, { method: 'PUT', body });
    },
    onSuccess: (_data, { id }) =>
      Promise.all([
        client.invalidateQueries({ queryKey: [listKey] }),
        client.invalidateQueries({ queryKey: ['photo', photoPathOf(collectionPath, id)] }),
      ]),
  });
}
