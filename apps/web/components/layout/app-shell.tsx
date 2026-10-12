'use client';

import { Menu } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { SidebarInset, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from './app-sidebar';

interface AppShellProps {
  children: ReactNode;
  context?: { label: string; value: string };
}

function MobileBar() {
  const { setOpenMobile } = useSidebar();
  return (
    <div className="flex items-center justify-between bg-sidebar px-4 py-3 md:hidden">
      <Logo tone="light" compact />
      <button
        type="button"
        aria-label="Abrir menú"
        onClick={() => setOpenMobile(true)}
        className="flex size-11 cursor-pointer items-center justify-center rounded-xl text-sidebar-foreground hover:bg-sidebar-accent"
      >
        <Menu aria-hidden strokeWidth={1.75} className="size-6" />
      </button>
    </div>
  );
}

export function AppShell({ children, context }: AppShellProps) {
  return (
    <TooltipProvider>
      <SidebarProvider
        style={{ '--sidebar-width': '268px', '--sidebar-width-icon': '82px' } as CSSProperties}
      >
        <AppSidebar context={context} />
        <SidebarInset className="min-w-0 bg-background">
          <MobileBar />
          <main className="flex min-w-0 flex-col gap-[22px] px-4 pt-6 pb-16 md:px-9 md:pt-7">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
