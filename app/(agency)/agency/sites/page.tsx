import Link from "next/link";
import { requireAgency } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import {
  EditSiteDialog,
  NewFormDialog,
  NewSiteDialog,
  type ClientOption,
} from "./sites-client";

export const metadata = { title: "Sites · FormHub" };

export default async function SitesPage() {
  const { agencyId } = await requireAgency();

  const [sites, clients] = await Promise.all([
    prisma.site.findMany({
      where: { agencyId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        client: { select: { name: true } },
        forms: {
          select: {
            id: true,
            name: true,
            publicKey: true,
            status: true,
            _count: { select: { submissions: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.client.findMany({
      where: { agencyId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const clientOptions: ClientOption[] = clients;

  return (
    <>
      <PageHeader
        title="Sites"
        description="Each site owns the forms that post to FormHub."
        actions={<NewSiteDialog clients={clientOptions} />}
      />

      {sites.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No sites yet"
          description="Register a site and the origins its forms will post from, then add a form to get an endpoint."
          action={<NewSiteDialog clients={clientOptions} />}
        />
      ) : (
        <div className="space-y-4">
          {sites.map((site) => (
            <Card key={site.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      {site.name}
                      {site.client ? (
                        <Badge variant="secondary">{site.client.name}</Badge>
                      ) : (
                        <Badge variant="outline">Unassigned</Badge>
                      )}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {site.domains.length > 0
                        ? site.domains.join(" · ")
                        : "No allowed origins set — submissions will be rejected"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <NewFormDialog
                      site={{
                        id: site.id,
                        name: site.name,
                        domains: site.domains,
                        clientId: site.clientId,
                      }}
                    />
                    <EditSiteDialog
                      site={{
                        id: site.id,
                        name: site.name,
                        domains: site.domains,
                        clientId: site.clientId,
                      }}
                      clients={clientOptions}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {site.forms.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No forms on this site yet.
                  </p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {site.forms.map((form) => (
                      <li
                        key={form.id}
                        className="flex items-center justify-between gap-4 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <Link
                            href={`/agency/forms/${form.id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {form.name}
                          </Link>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            /f/{form.publicKey}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          {form.status === "ACTIVE" ? null : (
                            <Badge variant="outline">Paused</Badge>
                          )}
                          <span className="text-sm tabular-nums text-muted-foreground">
                            {form._count.submissions} submissions
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
