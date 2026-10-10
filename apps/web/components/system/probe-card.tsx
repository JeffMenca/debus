import type { ProbeStatus } from '@debus/contracts';
import { StatusDot } from '@/components/brand/status-dot';
import { UNIT_LABELS, deliveryView } from '@/lib/system-view';

interface ProbeCardProps {
  onSend: () => void;
  isSending: boolean;
  status?: ProbeStatus;
  elapsedMs: number;
  errorMessage?: string;
}

export function ProbeCard({ onSend, isSending, status, elapsedMs, errorMessage }: ProbeCardProps) {
  return (
    <section aria-labelledby="probe" className="rounded-xl bg-lilac-100 p-6">
      <h2 id="probe" className="font-display text-xl font-semibold text-lilac-700">
        Aviso de prueba
      </h2>
      <p className="mt-1 text-sm text-lilac-700">
        Enviamos un aviso a todos los servicios y te mostramos quién lo recibió.
      </p>
      <button
        type="button"
        onClick={onSend}
        disabled={isSending}
        className="mt-4 h-11.5 w-full rounded-lg bg-primary px-5 font-medium text-primary-foreground transition hover:-translate-y-px disabled:opacity-60 motion-reduce:transition-none sm:w-auto"
      >
        {isSending ? 'Enviando…' : 'Enviar aviso de prueba'}
      </button>
      {errorMessage && <p className="mt-3 text-sm text-rose-700">{errorMessage}</p>}
      {status && (
        <ul className="mt-4 flex flex-col gap-2">
          {status.services.map(({ service, state }) => (
            <li
              key={service}
              className="flex items-center justify-between gap-3 rounded-lg bg-card px-4 py-3"
            >
              <span className="font-medium text-foreground">{UNIT_LABELS[service]}</span>
              <StatusDot {...deliveryView(state, elapsedMs)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
