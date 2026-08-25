"use client"

import { useRef } from "react"
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  onConfirm: () => void
}

// Thin wrapper over @base-ui/react/alert-dialog (spec-FEAT-005a.md Block 8) -- unlike dialog.tsx
// (Block 7), `alert-dialog` is Base UI's primitive purpose-built for destructive confirmations.
// This component never performs the actual destructive operation itself: it only invokes
// `onConfirm`. The caller (Block 12) owns the real DELETE call and decides when to close the
// dialog (e.g. after a successful response) and how to surface a failure -- never
// `window.confirm`/`alert` (AGENTS.md).
function ConfirmDialog({
  open,
  onOpenChange,
  itemName,
  onConfirm,
}: ConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Backdrop
          data-slot="confirm-dialog-backdrop"
          className={cn(
            "fixed inset-0 z-50 bg-foreground/50 transition-opacity",
            "data-starting-style:opacity-0 data-ending-style:opacity-0"
          )}
        />
        <AlertDialogPrimitive.Popup
          data-slot="confirm-dialog-popup"
          initialFocus={confirmButtonRef}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-lg border border-border bg-popover p-6 text-popover-foreground shadow-lg outline-none",
            "data-starting-style:scale-95 data-starting-style:opacity-0",
            "data-ending-style:scale-95 data-ending-style:opacity-0"
          )}
        >
          <AlertDialogPrimitive.Title
            data-slot="confirm-dialog-title"
            className="text-sm font-medium text-foreground"
          >
            Eliminar {itemName}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description
            data-slot="confirm-dialog-description"
            className="mt-2 text-sm text-muted-foreground"
          >
            ¿Confirmás que querés eliminar &quot;{itemName}&quot;? Esta acción no se puede
            deshacer.
          </AlertDialogPrimitive.Description>
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              ref={confirmButtonRef}
              type="button"
              variant="destructive"
              onClick={onConfirm}
            >
              Eliminar
            </Button>
          </div>
        </AlertDialogPrimitive.Popup>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}

export { ConfirmDialog }
