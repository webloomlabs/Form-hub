"use client";

import { Plus, Pencil, FilePlus } from "lucide-react";
import { ActionDialog, FieldError } from "@/components/action-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createForm, createSite, updateSite } from "./actions";

export type ClientOption = { id: string; name: string };
export type SiteRow = {
  id: string;
  name: string;
  domains: string[];
  clientId: string | null;
};

function ClientSelect({
  clients,
  defaultValue,
}: {
  clients: ClientOption[];
  defaultValue?: string | null;
}) {
  // A plain select keeps this inside the surrounding <form>'s FormData without
  // extra wiring; shadcn's Select would need a hidden input anyway.
  return (
    <select
      name="clientId"
      defaultValue={defaultValue ?? ""}
      className="border-input bg-transparent dark:bg-input/30 flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <option value="">— No client assigned —</option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

export function NewSiteDialog({ clients }: { clients: ClientOption[] }) {
  return (
    <ActionDialog
      trigger={
        <Button>
          <Plus className="size-4" />
          New site
        </Button>
      }
      title="New site"
      description="Register the origins this site's forms will post from."
      action={createSite}
      submitLabel="Create site"
    >
      {(state) => (
        <>
          <div className="space-y-2">
            <Label htmlFor="site-name">Name</Label>
            <Input id="site-name" name="name" required placeholder="acme.test" />
            <FieldError errors={state.errors?.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="site-client">Client</Label>
            <ClientSelect clients={clients} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="site-domains">Allowed origins</Label>
            <Textarea
              id="site-domains"
              name="domains"
              rows={3}
              placeholder={"https://acme.test\nhttps://www.acme.test"}
            />
            <p className="text-xs text-muted-foreground">
              One per line. Submissions from any other origin are rejected.
            </p>
            <FieldError errors={state.errors?.domains} />
          </div>
        </>
      )}
    </ActionDialog>
  );
}

export function EditSiteDialog({
  site,
  clients,
}: {
  site: SiteRow;
  clients: ClientOption[];
}) {
  return (
    <ActionDialog
      trigger={
        <Button variant="ghost" size="sm">
          <Pencil className="size-4" />
          Edit
        </Button>
      }
      title="Edit site"
      action={updateSite}
    >
      {(state) => (
        <>
          <input type="hidden" name="id" value={site.id} />
          <div className="space-y-2">
            <Label htmlFor={`sname-${site.id}`}>Name</Label>
            <Input
              id={`sname-${site.id}`}
              name="name"
              required
              defaultValue={site.name}
            />
            <FieldError errors={state.errors?.name} />
          </div>
          <div className="space-y-2">
            <Label>Client</Label>
            <ClientSelect clients={clients} defaultValue={site.clientId} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`sdom-${site.id}`}>Allowed origins</Label>
            <Textarea
              id={`sdom-${site.id}`}
              name="domains"
              rows={3}
              defaultValue={site.domains.join("\n")}
            />
            <FieldError errors={state.errors?.domains} />
          </div>
        </>
      )}
    </ActionDialog>
  );
}

export function NewFormDialog({ site }: { site: SiteRow }) {
  return (
    <ActionDialog
      trigger={
        <Button variant="outline" size="sm">
          <FilePlus className="size-4" />
          Add form
        </Button>
      }
      title={`New form on ${site.name}`}
      description="You'll get an endpoint URL and a copy-paste snippet."
      action={createForm}
      submitLabel="Create form"
    >
      {(state) => (
        <>
          <input type="hidden" name="siteId" value={site.id} />
          <div className="space-y-2">
            <Label htmlFor={`fname-${site.id}`}>Form name</Label>
            <Input
              id={`fname-${site.id}`}
              name="name"
              required
              placeholder="Contact form"
            />
            <FieldError errors={state.errors?.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`fredir-${site.id}`}>Thank-you URL</Label>
            <Input
              id={`fredir-${site.id}`}
              name="redirectUrl"
              placeholder="https://acme.test/thanks"
            />
            <p className="text-xs text-muted-foreground">
              Where a plain HTML form lands after submitting. Leave blank for
              JavaScript submissions.
            </p>
            <FieldError errors={state.errors?.redirectUrl} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`frecip-${site.id}`}>Alert recipients</Label>
            <Textarea
              id={`frecip-${site.id}`}
              name="recipients"
              rows={2}
              placeholder="owner@acme.test"
            />
            <p className="text-xs text-muted-foreground">
              One email per line. These are notified on every submission.
            </p>
          </div>
        </>
      )}
    </ActionDialog>
  );
}
