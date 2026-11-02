import {
  ChartColumn,
  type LucideIcon,
  Map,
  Network,
  Route,
  TrendingDown,
  TrendingUp,
  Wrench,
} from 'lucide-react';

export interface SystemReportLink {
  title: string;
  href: string;
  icon: LucideIcon;
}

// The reports of the system administrator; the menu reads this list.
export const SYSTEM_REPORT_LINKS: SystemReportLink[] = [
  { title: 'Ingresos', href: '/admin/reportes/ingresos', icon: TrendingUp },
  { title: 'Gastos', href: '/admin/reportes/gastos', icon: TrendingDown },
  { title: 'Ganancias', href: '/admin/reportes/ganancias', icon: ChartColumn },
  { title: 'Rutas más demandadas', href: '/admin/reportes/rutas-demandadas', icon: Route },
  { title: 'Taller por categoría', href: '/admin/reportes/taller', icon: Wrench },
  { title: 'Mapa de rutas', href: '/admin/reportes/mapa-rutas', icon: Map },
  { title: 'Arquitectura', href: '/admin/reportes/arquitectura', icon: Network },
];
