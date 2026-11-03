import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";

export function DeleteDialog({ label, description, onDelete }: { label: string; description: string; onDelete: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: onDelete,
    onSuccess: () => { setOpen(false); toast.success("Deleted"); },
    onError: () => toast.error("Could not delete. Please try again."),
  });
  return <>
    <Button variant="ghost" size="icon" aria-label={label} title={label} onClick={() => setOpen(true)} className="shrink-0 text-destructive"><Trash2 className="h-4 w-4" /></Button>
    <AlertDialog open={open} onOpenChange={(value) => { if (!mutation.isPending) setOpen(value); }}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
        <AlertDialogHeader><AlertDialogTitle>{label}?</AlertDialogTitle><AlertDialogDescription>{description} This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Deleting…" : "Delete"}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}