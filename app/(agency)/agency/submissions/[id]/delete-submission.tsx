"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteSubmission } from "../actions";

/**
 * Deleting an enquiry is irreversible and destroys the record this service
 * exists to preserve, so it asks first and names what will go with it.
 */
export function DeleteSubmissionButton({
  id,
  label,
  fileCount,
}: {
  id: string;
  label: string;
  fileCount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Trash2 className="size-4" />
            Delete
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this submission?</DialogTitle>
          <DialogDescription>
            <span className="text-foreground font-medium">{label}</span> will be
            permanently removed, along with its delivery history
            {fileCount > 0
              ? ` and ${fileCount} uploaded ${fileCount === 1 ? "file" : "files"}`
              : ""}
            . This cannot be undone, and the enquiry cannot be recovered.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            render={
              <Button variant="outline" type="button">
                Cancel
              </Button>
            }
          />
          <form action={deleteSubmission}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" variant="destructive">
              <Trash2 className="size-4" />
              Delete permanently
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
