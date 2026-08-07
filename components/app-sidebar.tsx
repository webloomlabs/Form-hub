"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsUpDown,
  Globe,
  Inbox,
  LayoutDashboard,
  LogOut,
  Send,
  Settings,
  Users,
  Zap,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

/**
 * Explicit map rather than `import * as Icons from "lucide-react"` — the
 * wildcard would pull the entire icon set into the client bundle. Nav items
 * are declared in server components, which can't pass a component across the
 * boundary, so they name an icon and this resolves it.
 */
const ICONS = {
  dashboard: LayoutDashboard,
  inbox: Inbox,
  users: Users,
  globe: Globe,
  send: Send,
  settings: Settings,
} as const;

export type NavItem = {
  href: string;
  label: string;
  /** Key into ICONS, so the nav can be declared in a server component. */
  icon: keyof typeof ICONS;
  badge?: number;
  /** Match only the exact path — for index routes like /agency or /client. */
  exact?: boolean;
};

export type NavGroup = { label?: string; items: NavItem[] };

export function AppSidebar({
  groups,
  workspaceName,
  workspaceMeta,
  user,
  signOutAction,
}: {
  groups: NavGroup[];
  workspaceName: string;
  workspaceMeta: string;
  user: { name: string; email: string };
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [signingOut, startSignOut] = useTransition();

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  const initials = (user.name || user.email)
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="cursor-default">
              <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <Zap className="size-4" />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold">{workspaceName}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {workspaceMeta}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group, index) => (
          <SidebarGroup key={group.label ?? index}>
            {group.label ? (
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = ICONS[item.icon];
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isActive(item)}
                        tooltip={item.label}
                        render={<Link href={item.href} />}
                      >
                        <Icon className="size-4" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {item.badge ? (
                        <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton size="lg">
                    <Avatar className="size-8 rounded-lg">
                      <AvatarFallback className="rounded-lg text-xs">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate text-sm font-medium">
                        {user.name}
                      </span>
                      <span className="text-muted-foreground truncate text-xs">
                        {user.email}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent align="end" side="top" className="min-w-56">
                {/*
                  DropdownMenuLabel is base-ui's Menu.GroupLabel, which throws
                  if it has no Group ancestor ("MenuGroupContext is missing").
                  The Group is required, not decorative.
                */}
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-normal">
                    <div className="grid leading-tight">
                      <span className="truncate text-sm font-medium">
                        {user.name}
                      </span>
                      <span className="text-muted-foreground truncate text-xs">
                        {user.email}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                {/*
                  Calling the action from onClick rather than nesting a <form>
                  inside the item: a menu item is not a valid form parent, and
                  the menu closes on click, which can unmount the form before
                  it submits.
                */}
                <DropdownMenuItem
                  disabled={signingOut}
                  onClick={() => startSignOut(() => signOutAction())}
                >
                  <LogOut className="size-4" />
                  {signingOut ? "Signing out…" : "Sign out"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
