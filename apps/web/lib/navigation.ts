import type { UserRole } from '@debus/contracts';
import { Activity, Building2, LayoutGrid, type LucideIcon, Settings2, Users } from 'lucide-react';

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
    ],
  },
  {
    label: 'Sistema',
    items: [{ label: 'Estado del sistema', href: '/admin/estado', icon: Activity }],
  },
];

const BRANCH_STAFF: NavGroup[] = [
  { label: 'Operación', items: [{ label: 'Panel', href: '/sucursal', icon: LayoutGrid }] },
];

const NAVIGATION: Record<UserRole, NavGroup[]> = {
  SYSTEM_ADMIN,
  BRANCH_ADMIN: BRANCH_STAFF,
  CASHIER: BRANCH_STAFF,
  DRIVER: BRANCH_STAFF,
  CLIENT: [],
};

export const navigationFor = (role: UserRole): NavGroup[] => NAVIGATION[role];

const ROOTS = new Set(['/admin', '/sucursal']);

export function isActivePath(pathname: string, href: string): boolean {
  if (ROOTS.has(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
