import { auth } from "@/auth";
import { PortalShell } from "@/components/portal-shell";

const NAV = [
  { href: "/agency", label: "Overview" },
  { href: "/agency/submissions", label: "Submissions" },
  { href: "/agency/clients", label: "Clients" },
  { href: "/agency/sites", label: "Sites" },
  { href: "/agency/deliveries", label: "Deliveries" },
  { href: "/agency/settings", label: "Settings" },
];

export default async function AgencyLayout({ children }: LayoutProps<"/agency">) {
  const session = await auth();
  return (
    <PortalShell title="FormHub" nav={NAV} userEmail={session?.user?.email}>
      {children}
    </PortalShell>
  );
}
