import {
  branchFieldsSchema,
  type BranchFields,
  type BusFields,
  type DriverFields,
} from '@debus/contracts';
import { addDays } from './dates';
import { seedEmail } from './emails';

export type SeedBranch = BranchFields & { adminName: string; cashierName: string };

// The seat of each department the company serves, with the centre of its town as coordinates.
export const SEED_BRANCHES: readonly SeedBranch[] = [
  {
    code: 'GUA',
    name: 'Ciudad de Guatemala',
    department: 'Guatemala',
    municipality: 'Guatemala',
    address: '5a avenida 12-30, zona 1',
    phone: '22501000',
    latitude: 14.6349,
    longitude: -90.5069,
    adminName: 'Marta Elena Quiñónez',
    cashierName: 'Luis Fernando Ordóñez',
  },
  {
    code: 'XEL',
    name: 'Quetzaltenango',
    department: 'Quetzaltenango',
    municipality: 'Quetzaltenango',
    address: '4a calle 14-50, zona 1',
    phone: '77612000',
    latitude: 14.8347,
    longitude: -91.5181,
    adminName: 'Jorge Mario Tzoc',
    cashierName: 'Andrea Lucía Pérez',
  },
  {
    code: 'ANT',
    name: 'Antigua Guatemala',
    department: 'Sacatepéquez',
    municipality: 'Antigua Guatemala',
    address: '5a avenida Sur 10, Centro',
    phone: '78321000',
    latitude: 14.5586,
    longitude: -90.7295,
    adminName: 'Sofía Alejandra Castañeda',
    cashierName: 'Diego Alejandro Morales',
  },
  {
    code: 'COB',
    name: 'Cobán',
    department: 'Alta Verapaz',
    municipality: 'Cobán',
    address: '1a avenida 3-25, zona 1',
    phone: '79511000',
    latitude: 15.47,
    longitude: -90.37,
    adminName: 'Rosa María Caal',
    cashierName: 'Pedro Antonio Xol',
  },
  {
    code: 'HUE',
    name: 'Huehuetenango',
    department: 'Huehuetenango',
    municipality: 'Huehuetenango',
    address: '4a avenida 5-20, zona 1',
    phone: '77641000',
    latitude: 15.3197,
    longitude: -91.4709,
    adminName: 'Walter Estuardo Mérida',
    cashierName: 'Karla Beatriz Jiménez',
  },
  {
    code: 'FLO',
    name: 'Flores',
    department: 'Petén',
    municipality: 'Flores',
    address: 'Calle Central, Isla de Flores',
    phone: '79261000',
    latitude: 16.93,
    longitude: -89.892,
    adminName: 'Gabriela Noemí Chocooj',
    cashierName: 'Henry Rolando Paiz',
  },
];

// What the API takes for a branch: the seed branch without the names of its people.
export const branchFields = (seed: SeedBranch): BranchFields => branchFieldsSchema.parse(seed);

export interface SeedRoute {
  from: string;
  to: string;
  distanceKm: number;
  ticketPrice: number;
}

const roundTrip = (a: string, b: string, distanceKm: number, ticketPrice: number): SeedRoute[] => [
  { from: a, to: b, distanceKm, ticketPrice },
  { from: b, to: a, distanceKm, ticketPrice },
];

// Road distances, rounded to the kilometre.
export const SEED_ROUTES: readonly SeedRoute[] = [
  ...roundTrip('GUA', 'XEL', 201, 85),
  ...roundTrip('GUA', 'ANT', 45, 30),
  ...roundTrip('GUA', 'COB', 213, 90),
  ...roundTrip('GUA', 'FLO', 505, 200),
  ...roundTrip('XEL', 'HUE', 90, 45),
  ...roundTrip('XEL', 'ANT', 170, 75),
];

export const routesFrom = (code: string): SeedRoute[] =>
  SEED_ROUTES.filter((route) => route.from === code);

// Enough buses for every route to leave twice a day without two trips sharing one.
const BUS_COUNT: Record<string, number> = { GUA: 5, XEL: 3, ANT: 3, COB: 2, HUE: 2, FLO: 3 };
const PLATE_LETTERS: Record<string, string> = {
  GUA: 'BTX',
  XEL: 'DJM',
  ANT: 'FKP',
  COB: 'GRS',
  HUE: 'HLT',
  FLO: 'JNV',
};
const MODELS: readonly { brand: string; model: string; capacity: number }[] = [
  { brand: 'Volvo', model: '9700', capacity: 48 },
  { brand: 'Mercedes-Benz', model: 'O500', capacity: 44 },
  { brand: 'Scania', model: 'K360', capacity: 52 },
  { brand: 'Yutong', model: 'ZK6122', capacity: 46 },
  { brand: 'Hino', model: 'RK8', capacity: 40 },
];

const pick = <T>(list: readonly T[], index: number): T => {
  const value = list[index % list.length];
  if (value === undefined) throw new Error('Cannot pick from an empty list');
  return value;
};

const branchIndex = (code: string): number => {
  const index = SEED_BRANCHES.findIndex((branch) => branch.code === code);
  if (index < 0) throw new Error(`Unknown seed branch ${code}`);
  return index;
};

export type SeedBus = Omit<BusFields, 'assignedDriverId'> & { driverNumber: number };

// Bus `n` of a branch has driver `n` as its regular driver.
export function busesFor(code: string): SeedBus[] {
  const index = branchIndex(code);
  return Array.from({ length: BUS_COUNT[code] ?? 0 }, (_, position) => {
    const { brand, model, capacity } = pick(MODELS, index + position);
    return {
      plate: `C${100 + index * 10 + position}${PLATE_LETTERS[code]}`,
      brand,
      model,
      year: 2017 + ((index + position) % 7),
      capacity,
      mileageKm: 60_000 + (index * 7 + position) * 12_500,
      operationalStatus: 'AVAILABLE',
      driverNumber: position + 1,
    };
  });
}

const DRIVER_NAMES: readonly string[] = [
  'Carlos Humberto Ajú',
  'Mynor Estuardo Gómez',
  'José Luis Tojín',
  'Edgar Rolando Barrios',
  'Víctor Manuel Cifuentes',
  'Óscar René López',
  'Hugo Leonel Batz',
  'Fredy Ariel Coyoy',
  'Julio César Ixcoy',
  'Ángel Rodolfo Sical',
  'Byron Danilo Hernández',
  'Selvin Arnoldo Mejía',
  'Rudy Alexander Sam',
  'Wilmer Josué Pop',
  'Erick Giovanni Marroquín',
  'Marvin Eduardo Choc',
  'Douglas Armando Ramírez',
  'Nery Isaías García',
  'Cristian Abel Morán',
  'Lester Omar Tun',
];

// The second driver of Guatemala and of Quetzaltenango have a licence about to expire, so the
// expiry alerts have something to show; every other licence is good for more than a year.
const EXPIRING: Record<string, number> = { 'GUA-2': 12, 'XEL-2': 25 };

export const driverEmail = (base: string, code: string, number: number): string =>
  seedEmail(base, `chofer-${code.toLowerCase()}-${number}`);

export function driversFor(code: string, today: string, emailBase: string): DriverFields[] {
  const index = branchIndex(code);
  const offset = SEED_BRANCHES.slice(0, index).reduce(
    (sum, branch) => sum + (BUS_COUNT[branch.code] ?? 0),
    0,
  );
  return Array.from({ length: BUS_COUNT[code] ?? 0 }, (_, position) => {
    const number = position + 1;
    const expiresIn = EXPIRING[`${code}-${number}`] ?? 420 + ((offset + position) % 5) * 90;
    return {
      fullName: pick(DRIVER_NAMES, offset + position),
      email: driverEmail(emailBase, code, number),
      phone: `5${String(1000000 + (offset + position) * 7919).slice(-7)}`,
      licenseNumber: `${code}A${String(1000 + offset + position)}`,
      licenseType: position % 2 === 0 ? 'C' : 'E',
      licenseExpiresOn: addDays(today, expiresIn),
      baseSalary: 4_500 + ((offset + position) % 6) * 250,
    };
  });
}

export const EXPENSE_CATEGORIES = [
  'Llantas',
  'Motor',
  'Frenos',
  'Suspensión',
  'Cambio de aceite',
  'Eléctrico',
  'Carrocería',
  'Otros',
] as const;

export interface RepairLinePlan {
  category: (typeof EXPENSE_CATEGORIES)[number];
  kind: 'LABOR' | 'PART';
  description: string;
  amount: number;
}
export interface RepairPlan {
  daysAgo: number;
  lines: [RepairLinePlan, RepairLinePlan];
}

export const repairPlans: readonly RepairPlan[] = [
  {
    daysAgo: 12,
    lines: [
      {
        category: 'Cambio de aceite',
        kind: 'PART',
        description: 'Aceite 15W40 y filtros',
        amount: 740,
      },
      { category: 'Motor', kind: 'LABOR', description: 'Revisión general del motor', amount: 350 },
    ],
  },
  {
    daysAgo: 27,
    lines: [
      { category: 'Llantas', kind: 'PART', description: 'Dos llantas traseras', amount: 2_900 },
      {
        category: 'Otros',
        kind: 'LABOR',
        description: 'Montaje y balanceo de llantas',
        amount: 280,
      },
    ],
  },
  {
    daysAgo: 41,
    lines: [
      {
        category: 'Frenos',
        kind: 'PART',
        description: 'Pastillas y discos delanteros',
        amount: 1_850,
      },
      {
        category: 'Suspensión',
        kind: 'LABOR',
        description: 'Ajuste de amortiguadores',
        amount: 600,
      },
    ],
  },
  {
    daysAgo: 55,
    lines: [
      {
        category: 'Eléctrico',
        kind: 'PART',
        description: 'Alternador reconstruido',
        amount: 1_450,
      },
      { category: 'Carrocería', kind: 'LABOR', description: 'Reparación de puerta', amount: 520 },
    ],
  },
];

// Every bus gets one repair; every other bus a second, older one.
export function repairsFor(busNumber: number): RepairPlan[] {
  const first = pick(repairPlans, busNumber);
  return busNumber % 2 === 1 ? [first, pick(repairPlans, busNumber + 2)] : [first];
}

export const adminEmail = (base: string, code: string): string =>
  seedEmail(base, `admin-${code.toLowerCase()}`);
export const cashierEmail = (base: string, code: string): string =>
  seedEmail(base, `cajero-${code.toLowerCase()}`);
