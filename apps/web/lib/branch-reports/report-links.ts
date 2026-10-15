import {
  ClipboardList,
  IdCard,
  KeyRound,
  type LucideIcon,
  Ticket,
  TrendingDown,
  Wrench,
} from 'lucide-react';

export interface ReportLink {
  title: string;
  href: string;
  description: string;
  icon: LucideIcon;
}

// The reports of the branch administrator that exist; the menu and the index of reports share this
// list, and each new report adds its entry.
export const REPORT_LINKS: ReportLink[] = [
  {
    title: 'Listado de buses',
    href: '/sucursal/reportes/buses',
    description: 'Placa, estado, chofer, kilometraje y viajes realizados de cada bus.',
    icon: ClipboardList,
  },
  {
    title: 'Listado de choferes',
    href: '/sucursal/reportes/choferes',
    description: 'Licencia, tipo, vencimiento, estado y viajes realizados de cada chofer.',
    icon: IdCard,
  },
  {
    title: 'Ingresos por boletos',
    href: '/sucursal/reportes/ingresos-boletos',
    description:
      'Boletos vendidos e ingreso de cada viaje, con el subtotal de cada ruta y el total general.',
    icon: Ticket,
  },
  {
    title: 'Ingresos por alquiler',
    href: '/sucursal/reportes/ingresos-alquileres',
    description: 'Cada uno de los alquileres pagados, con cliente, fechas, bus y precio.',
    icon: KeyRound,
  },
  {
    title: 'Depreciación por bus',
    href: '/sucursal/reportes/depreciacion',
    description:
      'Kilómetros recorridos, monto por km aplicado y depreciación acumulada de cada bus.',
    icon: TrendingDown,
  },
  {
    title: 'Gastos de taller por bus',
    href: '/sucursal/reportes/taller',
    description:
      'Lo que gastó cada bus en el taller, con el subtotal de cada categoría y el total del bus.',
    icon: Wrench,
  },
];
