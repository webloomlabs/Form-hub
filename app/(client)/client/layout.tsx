import { auth } from "@/auth";
import { PortalShell } from "@/components/portal-shell";

const NAV = [
  { href: "/client", label: "Inbox" },
];

export default async function ClientLayout({ children }: LayoutProps<"/client">) {
  const session = await auth();
  return (
    <PortalShell title="FormHub" nav={NAV} userEmail={session?.user?.email}>
      {children}
    </PortalShell>
  );
}
