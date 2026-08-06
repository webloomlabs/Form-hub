"use client";

import { Plus, UserPlus, Pencil } from "lucide-react";
import { ActionDialog, FieldError } from "@/components/action-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient, inviteClientUser, updateClient } from "./actions";

export type ClientRow = {
  id: string;
  name: string;
  contactEmail: string;
  siteCount: number;
  userCount: number;
  pendingInvites: number;
};

export function NewClientDialog() {
  return (
    <ActionDialog
      trigger={
        <Button>
          <Plus className="size-4" />
          New client
        </Button>
      }
      title="New client"
      description="A client is the website owner you'll be handing a login to."
      action={createClient}
      submitLabel="Create client"
    >
      {(state) => (
        <>
          <div className="space-y-2">
            <Label htmlFor="new-name">Name</Label>
            <Input id="new-name" name="name" required placeholder="Acme Joinery" />
            <FieldError errors={state.errors?.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-email">Contact email</Label>
            <Input
              id="new-email"
              name="contactEmail"
              type="email"
              required
              placeholder="owner@acme.test"
            />
            <FieldError errors={state.errors?.contactEmail} />
          </div>
        </>
      )}
    </ActionDialog>
  );
}

export function EditClientDialog({ client }: { client: ClientRow }) {
  return (
    <ActionDialog
      trigger={
        <Button variant="ghost" size="sm">
          <Pencil className="size-4" />
          Edit
        </Button>
      }
      title="Edit client"
      action={updateClient}
    >
      {(state) => (
        <>
          <input type="hidden" name="id" value={client.id} />
          <div className="space-y-2">
            <Label htmlFor={`name-${client.id}`}>Name</Label>
            <Input
              id={`name-${client.id}`}
              name="name"
              required
              defaultValue={client.name}
            />
            <FieldError errors={state.errors?.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`email-${client.id}`}>Contact email</Label>
            <Input
              id={`email-${client.id}`}
              name="contactEmail"
              type="email"
              required
              defaultValue={client.contactEmail}
            />
            <FieldError errors={state.errors?.contactEmail} />
          </div>
        </>
      )}
    </ActionDialog>
  );
}

export function InviteDialog({ client }: { client: ClientRow }) {
  return (
    <ActionDialog
      trigger={
        <Button variant="outline" size="sm">
          <UserPlus className="size-4" />
          Invite
        </Button>
      }
      title={`Invite an owner for ${client.name}`}
      description="They'll get a link to set their own password. The link is valid for 7 days."
      action={inviteClientUser}
      submitLabel="Send invite"
    >
      {(state) => (
        <>
          <input type="hidden" name="clientId" value={client.id} />
          <div className="space-y-2">
            <Label htmlFor={`invite-${client.id}`}>Email</Label>
            <Input
              id={`invite-${client.id}`}
              name="email"
              type="email"
              required
              defaultValue={client.contactEmail}
            />
            <FieldError errors={state.errors?.email} />
          </div>
        </>
      )}
    </ActionDialog>
  );
}
