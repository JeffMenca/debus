// How far a rental can be reached by the end of the demo.
export type RentalTarget =
  // Asked for, waiting for the price.
  | 'REQUESTED'
  // The price is set, waiting for the payment.
  | 'CONFIRMED'
  // Paid, waiting for a bus.
  | 'PAID'
  // Paid and with its bus and driver.
  | 'ASSIGNED'
  // Paid, assigned and then cancelled: the money goes back to the wallet.
  | 'CANCELLED_AFTER_PAYMENT'
  // Cancelled by the client before paying.
  | 'CANCELLED';

export interface SeedRental {
  key: string;
  channel: 'ONLINE' | 'COUNTER';
  // The branch that takes the rental.
  branch: string;
  // The client of the catalog who rents, online or at the counter, and pays from their wallet.
  client: number;
  origin: string;
  destination: string;
  distanceKm: number;
  passengers: number;
  // Later than the regular trips, so a bus is free and no load removes the rental.
  daysAhead: number;
  departureHour: string;
  returnsAfterHours: number;
  target: RentalTarget;
}

export const SEED_RENTALS: readonly SeedRental[] = [
  {
    key: 'atitlan-boda',
    channel: 'ONLINE',
    branch: 'GUA',
    client: 1,
    origin: 'Ciudad de Guatemala',
    destination: 'Lago de Atitlán',
    distanceKm: 140,
    passengers: 35,
    daysAhead: 9,
    departureHour: '07:00',
    returnsAfterHours: 12,
    target: 'REQUESTED',
  },
  {
    key: 'retalhuleu-excursion',
    channel: 'ONLINE',
    branch: 'XEL',
    client: 2,
    origin: 'Quetzaltenango',
    destination: 'Retalhuleu',
    distanceKm: 80,
    passengers: 30,
    daysAhead: 10,
    departureHour: '08:00',
    returnsAfterHours: 10,
    target: 'CONFIRMED',
  },
  {
    key: 'pacaya-caminata',
    channel: 'ONLINE',
    branch: 'ANT',
    client: 3,
    origin: 'Antigua Guatemala',
    destination: 'Volcán de Pacaya',
    distanceKm: 60,
    passengers: 25,
    daysAhead: 11,
    departureHour: '06:30',
    returnsAfterHours: 9,
    target: 'PAID',
  },
  {
    key: 'semuc-familia',
    channel: 'ONLINE',
    branch: 'COB',
    client: 4,
    origin: 'Cobán',
    destination: 'Semuc Champey',
    distanceKm: 70,
    passengers: 38,
    daysAhead: 12,
    departureHour: '06:00',
    returnsAfterHours: 12,
    target: 'ASSIGNED',
  },
  {
    key: 'todos-santos-feria',
    channel: 'ONLINE',
    branch: 'HUE',
    client: 5,
    origin: 'Huehuetenango',
    destination: 'Todos Santos Cuchumatán',
    distanceKm: 45,
    passengers: 30,
    daysAhead: 13,
    departureHour: '05:30',
    returnsAfterHours: 14,
    target: 'ASSIGNED',
  },
  {
    key: 'tikal-cancelado',
    channel: 'ONLINE',
    branch: 'FLO',
    client: 6,
    origin: 'Flores',
    destination: 'Parque Nacional Tikal',
    distanceKm: 65,
    passengers: 40,
    daysAhead: 14,
    departureHour: '05:00',
    returnsAfterHours: 11,
    target: 'CANCELLED_AFTER_PAYMENT',
  },
  {
    key: 'chichi-mercado',
    channel: 'ONLINE',
    branch: 'GUA',
    client: 7,
    origin: 'Ciudad de Guatemala',
    destination: 'Chichicastenango',
    distanceKm: 145,
    passengers: 28,
    daysAhead: 15,
    departureHour: '06:00',
    returnsAfterHours: 12,
    target: 'CANCELLED',
  },
  {
    key: 'colegio-puerto',
    channel: 'COUNTER',
    branch: 'GUA',
    client: 8,
    origin: 'Ciudad de Guatemala',
    destination: 'Puerto San José',
    distanceKm: 110,
    passengers: 40,
    daysAhead: 16,
    departureHour: '07:00',
    returnsAfterHours: 11,
    target: 'ASSIGNED',
  },
  {
    key: 'club-xelaju',
    channel: 'COUNTER',
    branch: 'XEL',
    client: 2,
    origin: 'Quetzaltenango',
    destination: 'Ciudad de Guatemala',
    distanceKm: 200,
    passengers: 38,
    daysAhead: 18,
    departureHour: '09:00',
    returnsAfterHours: 20,
    target: 'ASSIGNED',
  },
  {
    key: 'hotel-aeropuerto',
    channel: 'COUNTER',
    branch: 'ANT',
    client: 3,
    origin: 'Antigua Guatemala',
    destination: 'Aeropuerto La Aurora',
    distanceKm: 45,
    passengers: 30,
    daysAhead: 20,
    departureHour: '04:30',
    returnsAfterHours: 3,
    target: 'CONFIRMED',
  },
];
