import { Button } from '@/components/ui/button';

export const ACCOUNT_PENDING_TEXT =
  'Estamos preparando tu cuenta. Vuelve a intentar en unos segundos.';

// The account is created a moment after signing up; this is a wait, so it is not shown as an error.
export function AccountPending({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sky-100 p-4 text-sky-700"
    >
      <span>{ACCOUNT_PENDING_TEXT}</span>
      <Button variant="ghost" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
