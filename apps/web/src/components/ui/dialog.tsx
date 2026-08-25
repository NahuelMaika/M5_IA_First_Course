"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: React.ReactNode
}

// Thin wrapper over @base-ui/react/dialog (spec-FEAT-005a.md Block 7). Closing on Escape,
// outside click or the consumer's own cancel action never asks for extra confirmation -- that's
// native Base UI Dialog behavior, not something reimplemented here (RF-59 of PRD.md).
function Dialog({ open, onOpenChange, title, children }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          data-slot="dialog-backdrop"
          className={cn(
            "fixed inset-0 z-50 bg-foreground/50 transition-opacity",
            "data-starting-style:opacity-0 data-ending-style:opacity-0"
          )}
        />
        <DialogPrimitive.Popup
          data-slot="dialog-popup"
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-lg border border-border bg-popover p-6 text-popover-foreground shadow-lg outline-none",
            "data-starting-style:scale-95 data-starting-style:opacity-0",
            "data-ending-style:scale-95 data-ending-style:opacity-0"
          )}
        >
          <DialogPrimitive.Title
            data-slot="dialog-title"
            className="text-sm font-medium text-foreground"
          >
            {title}
          </DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export { Dialog }
