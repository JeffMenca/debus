'use client';

import { Building2, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { Logo } from '@/components/brand/logo';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useSession } from '@/lib/auth/session-store';
import { initialsOf } from '@/lib/format';
import { isActivePath, navigationFor } from '@/lib/navigation';
import { ROLE_LABELS } from '@/lib/roles';

interface AppSidebarProps {
  context?: { label: string; value: string };
}

function CollapseButton() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === 'collapsed';
  return (
    <button
      type="button"
      aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
      aria-expanded={!collapsed}
      onClick={toggleSidebar}
      className="absolute top-8 -right-4 z-20 hidden size-[34px] cursor-pointer items-center justify-center rounded-full bg-card text-foreground shadow-float md:flex"
    >
      <ChevronLeft
        aria-hidden
        strokeWidth={1.75}
        className={`size-4 transition-transform motion-reduce:transition-none ${collapsed ? 'rotate-180' : ''}`}
      />
    </button>
  );
}

export function AppSidebar({ context }: AppSidebarProps) {
  const pathname = usePathname();
  const session = useSession();
  const { isMobile, setOpenMobile } = useSidebar();
  if (!session) return null;
  const { user } = session;

  return (
    <Sidebar collapsible="icon" className="border-0">
      <SidebarHeader className="gap-4 p-4">
        <div className="flex items-center group-data-[collapsible=icon]:justify-center">
          <Logo tone="light" />
        </div>
        {context && (
          <div className="flex items-center gap-2.5 rounded-[14px] bg-sidebar-accent p-2 group-data-[collapsible=icon]:hidden">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-mint-300 text-mint-700">
              <Building2 aria-hidden strokeWidth={1.75} className="size-5" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-xs text-sidebar-foreground">{context.label}</span>
              <span className="truncate text-sm font-semibold text-sidebar-accent-foreground">
                {context.value}
              </span>
            </span>
          </div>
        )}
      </SidebarHeader>
      <SidebarContent className="px-3">
        {navigationFor(user.role).map((group) => (
          <SidebarGroup key={group.label} className="p-0 pb-3">
            <SidebarGroupLabel className="h-7 px-3 text-[11px] font-semibold tracking-[.07em] text-sidebar-foreground/70 uppercase">
              {group.label}
            </SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => isMobile && setOpenMobile(false)}
                      >
                        <item.icon aria-hidden strokeWidth={1.75} />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-coral-300 text-sm font-bold text-foreground">
            {initialsOf(user.fullName)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold text-sidebar-accent-foreground">
              {user.fullName}
            </span>
            <span className="truncate text-xs text-sidebar-foreground">
              {ROLE_LABELS[user.role]}
            </span>
          </span>
          <span className="group-data-[collapsible=icon]:hidden">
            <SignOutButton compact />
          </span>
        </div>
      </SidebarFooter>
      <CollapseButton />
    </Sidebar>
  );
}
