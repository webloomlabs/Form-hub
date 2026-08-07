import { cookies } from "next/headers";
import { signOut } from "@/auth";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppSidebar, type NavGroup } from "@/components/app-sidebar";

/**
 * The signed-in chrome for both portals: collapsible left sidebar, sticky
 * header with the theme control, and a scrolling content column.
 */
export async function AppShell({
  groups,
  workspaceName,
  workspaceMeta,
  user,
  children,
}: {
  groups: NavGroup[];
  workspaceName: string;
  workspaceMeta: string;
  user: { name: string; email: string };
  children: React.ReactNode;
}) {
  // The sidebar writes its open/closed state to a cookie; reading it here
  // means the first paint matches what the visitor last chose.
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        groups={groups}
        workspaceName={workspaceName}
        workspaceMeta={workspaceMeta}
        user={user}
        signOutAction={handleSignOut}
      />
      <SidebarInset>
        <header className="bg-background/80 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur-sm">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <span className="text-muted-foreground text-sm">{workspaceName}</span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
