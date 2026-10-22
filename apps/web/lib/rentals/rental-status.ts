import type { Rental, RentalStatus } from '@debus/contracts';
import type { StatusTone } from '@/components/brand/status-dot';

interface RentalStatusView {
  // What the client reads in their history, and what the branch reads in its list.
  client: string;
  branch: string;
  tone: StatusTone;
}

const VIEWS: Record<RentalStatus, RentalStatusView> = {
  REQUESTED: { client: 'Esperando precio', branch: 'Por confirmar', tone: 'mango' },
  CONFIRMED: { client: 'Precio listo, falta pagar', branch: 'Esperando pago', tone: 'sky' },
  PAID: { client: 'Pagado', branch: 'Pagado', tone: 'mint' },
  CANCELLED: { client: 'Cancelado', branch: 'Cancelado', tone: 'rose' },
};

export const rentalStatusView = (status: RentalStatus): RentalStatusView => VIEWS[status];

// Until the branch confirms, the estimate is all there is to show.
export const rentalPriceShown = (rental: Rental): { amount: number; estimated: boolean } =>
  rental.price === null
    ? { amount: rental.estimatedPrice, estimated: true }
    : { amount: rental.price, estimated: false };
