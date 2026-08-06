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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Website owners you build and manage sites for.
          </p>
        </div>
        <NewClientDialog />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No clients yet. Create one to get started.
        </p>
      ) : (
        <div className="rounded-lg border">
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
    </div>
  );
}
