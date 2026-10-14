import { ClipboardList, type LucideIcon } from 'lucide-react';

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
];
