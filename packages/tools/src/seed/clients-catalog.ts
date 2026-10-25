import { seedEmail } from './emails';

export interface SeedClient {
  // The number in the email tag and the key the sessions are kept under.
  number: number;
  fullName: string;
  dpi: string;
  phone: string;
  nit: string;
  address: string;
  // The top-ups the client has made over the past weeks, oldest first.
  topUps: readonly number[];
}

// People who bought online. Their NIT is on their profile, so the counter sales made with it
// show up in their own history.
export const SEED_CLIENTS: readonly SeedClient[] = [
  {
    number: 1,
    fullName: 'María José Aguilar Tuy',
    dpi: '2584013920101',
    phone: '55214780',
    nit: '4521369',
    address: '3a calle 7-22, zona 1, Ciudad de Guatemala',
    topUps: [500, 300],
  },
  {
    number: 2,
    fullName: 'Luis Alberto Chávez Pérez',
    dpi: '2631874120901',
    phone: '42160935',
    nit: '8830472K',
    address: '12 avenida 4-18, zona 3, Quetzaltenango',
    topUps: [800, 400, 250],
  },
  {
    number: 3,
    fullName: 'Ana Lucía Morales Xicay',
    dpi: '1987452310301',
    phone: '30458812',
    nit: '2917465',
    address: 'Callejón del Hermano Pedro 5, Antigua Guatemala',
    topUps: [400],
  },
  {
    number: 4,
    fullName: 'Carlos Enrique Ixcot Batz',
    dpi: '2745196380401',
    phone: '57091264',
    nit: '6103958',
    address: '2a avenida 6-40, zona 2, Cobán',
    topUps: [600, 300],
  },
  {
    number: 5,
    fullName: 'Sandra Patricia Ramírez Díaz',
    dpi: '2318560741001',
    phone: '41372096',
    nit: '3764201K',
    address: '5a calle 3-15, zona 4, Huehuetenango',
    topUps: [350, 350, 200],
  },
  {
    number: 6,
    fullName: 'José Manuel Pop Caal',
    dpi: '2896304520501',
    phone: '53841207',
    nit: '1458732',
    address: 'Barrio San Benito, Flores, Petén',
    topUps: [500],
  },
  {
    number: 7,
    fullName: 'Karla Beatriz Monzón López',
    dpi: '2459817630101',
    phone: '36905821',
    nit: '7290146',
    address: '8a avenida 11-05, zona 10, Ciudad de Guatemala',
    topUps: [700, 250],
  },
  {
    number: 8,
    fullName: 'Pedro Antonio Tzoc Mejía',
    dpi: '2173946850901',
    phone: '48127395',
    nit: '5036827K',
    address: '6a calle 9-33, zona 1, Quetzaltenango',
    topUps: [450, 300],
  },
  {
    number: 9,
    fullName: 'Gabriela Noemí Hernández Cojtí',
    dpi: '2602781490301',
    phone: '59473018',
    nit: '9184530',
    address: '4a calle Oriente 12, Antigua Guatemala',
    topUps: [300, 300, 300],
  },
  {
    number: 10,
    fullName: 'Walter Estuardo Sam Choc',
    dpi: '2851730960401',
    phone: '32768541',
    nit: '2650914',
    address: '1a avenida 8-12, zona 2, Cobán',
    topUps: [800],
  },
  {
    number: 11,
    fullName: 'Rosa Elena Gómez Barrios',
    dpi: '2394058710101',
    phone: '51936420',
    nit: '8417395K',
    address: '15 calle 3-60, zona 1, Ciudad de Guatemala',
    topUps: [550, 200],
  },
  {
    number: 12,
    fullName: 'Hugo René Santos Cifuentes',
    dpi: '2726195080801',
    phone: '44280617',
    nit: '3092587',
    address: 'Avenida La Reforma 9-30, zona 9, Ciudad de Guatemala',
    topUps: [400, 400],
  },
];

export function seedClient(number: number | undefined): SeedClient {
  const client = SEED_CLIENTS.find((candidate) => candidate.number === number);
  if (!client) throw new Error(`The seed has no client number ${number}`);
  return client;
}

export const clientEmail = (base: string, number: number): string =>
  seedEmail(base, `cliente-${number}`);
