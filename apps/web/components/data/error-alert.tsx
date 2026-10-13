import { Button } from '@/components/ui/button';

interface ErrorAlertProps {
  message: string;
  // Without it the alert has no retry button, for errors that retrying cannot fix.
  onRetry?: () => void;
}

export function ErrorAlert({ message, onRetry }: ErrorAlertProps) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-rose-100 p-4 text-rose-700"
    >
      <span>{message}</span>
      {onRetry && (
        <Button variant="ghost" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}
