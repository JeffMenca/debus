import { CONSUMER_NIT } from '@debus/contracts';

// The generic counter client belongs to nobody, so its sales are never linked.
export const linkableNit = (nit: string | null): nit is string =>
  nit !== null && nit !== CONSUMER_NIT;
