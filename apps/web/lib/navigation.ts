import type { UserRole } from '@debus/contracts';
import {
  Activity,
  Building2,
  Bus,
  CalendarDays,
  IdCard,
  LayoutGrid,
  type LucideIcon,
  Route,
  Settings2,
  Tags,
  Users,
  Wrench,
} from 'lucide-react';
import { REPORT_LINKS } from '@/lib/branch-reports/report-links';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Only screens that exist are listed; each new screen adds its link here.
const SYSTEM_ADMIN: NavGroup[] = [
  {
    label: 'Administración',
    items: [
      { label: 'Panel', href: '/admin', icon: LayoutGrid },
      { label: 'Usuarios', href: '/admin/usuarios', icon: Users },
      { label: 'Sucursales', href: '/admin/sucursales', icon: Building2 },
      { label: 'Configuración', href: '/admin/configuracion', icon: Settings2 },
      { label: 'Categorías de gasto', href: '/admin/categorias', icon: Tags },
    ],
  },
  {
    label: 'Sistema',
    items: [{ label: 'Estado del sistema', href: '/admin/estado', icon: Activity }],
  },
];

const BRANCH_PANEL: NavItem = { label: 'Panel', href: '/sucursal', icon: LayoutGrid };

const BRANCH_STAFF: NavGroup[] = [{ label: 'Operación', items: [BRANCH_PANEL] }];

const BRANCH_ADMIN: NavGroup[] = [
  {
    label: 'Operación',
    items: [BRANCH_PANEL, { label: 'Viajes', href: '/sucursal/viajes', icon: CalendarDays }],
  },
  {
    label: 'Flota',
    items: [
      { label: 'Buses', href: '/sucursal/buses', icon: Bus },
      { label: 'Choferes', href: '/sucursal/choferes', icon: IdCard },
      { label: 'Rutas', href: '/sucursal/rutas', icon: Route },
    ],
  },
  {
    label: 'Finanzas',
    items: [{ label: 'Gastos de taller', href: '/sucursal/gastos', icon: Wrench }],
  },
  {
    label: 'Reportes',
    items: REPORT_LINKS.map(({ title, href, icon }) => ({ label: title, href, icon })),
  },
];

const DRIVER: NavGroup[] = [
  {
    label: 'Mi trabajo',
    items: [{ label: 'Mis viajes', href: '/chofer', icon: CalendarDays }],
  },
];

const NAVIGATION: Record<UserRole, NavGroup[]> = {
  SYSTEM_ADMIN,
  BRANCH_ADMIN,
  CASHIER: BRANCH_STAFF,
  DRIVER,
  CLIENT: [],
};

export const navigationFor = (role: UserRole): NavGroup[] => NAVIGATION[role];

const ROOTS = new Set(['/admin', '/sucursal']);

export function isActivePath(pathname: string, href: string): boolean {
  if (ROOTS.has(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
