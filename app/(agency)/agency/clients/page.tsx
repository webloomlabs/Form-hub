import { requireAgency } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import {
  EditClientDialog,
  InviteDialog,
  NewClientDialog,
  type ClientRow,
} from "./clients-client";

export const metadata = { title: "Clients · FormHub" };

export default async function ClientsPage() {
  const { agencyId } = await requireAgency();

  const clients = await prisma.client.findMany({
    where: { agencyId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      _count: { select: { sites: true, users: true } },
      invites: { where: { acceptedAt: null }, select: { id: true } },
    },
  });

  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id,
    name: c.name,
    contactEmail: c.contactEmail,
    siteCount: c._count.sites,
    userCount: c._count.users,
    pendingInvites: c.invites.length,
  }));

  return (
    <>
      <PageHeader
        title="Clients"
        description="Website owners you build and manage sites for."
        actions={<NewClientDialog />}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No clients yet"
          description="Add the website owners you build for. Each one gets their own login and their own inbox."
          action={<NewClientDialog />}
        />
      ) : (
        <div className="bg-card rounded-xl border shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Sites</TableHead>
                <TableHead>Login</TableHead>
                <TableHead className="w-[200px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {client.contactEmail}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {client.siteCount}
                  </TableCell>
                  <TableCell>
                    {client.userCount > 0 ? (
                      <Badge variant="secondary">Active</Badge>
                    ) : client.pendingInvites > 0 ? (
                      <Badge variant="outline">Invite pending</Badge>
                    ) : (
                      <Badge variant="outline">No login</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <InviteDialog client={client} />
                      <EditClientDialog client={client} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
