"use client"

import { Select as SelectPrimitive } from "@base-ui/react/select"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string | null
  onValueChange: (value: string) => void
  options: SelectOption[]
  label: string
}

// Thin wrapper over @base-ui/react/select (spec-FEAT-005a.md Block 9). Deliberately generic --
// not coupled to "category" in its name or its type -- so prd-FEAT-005b.md can reuse it unmodified.
// It receives its options already resolved via props: it never calls the API and never validates
// its own input.
function Select({ value, onValueChange, options, label }: SelectProps) {
  return (
    <SelectPrimitive.Root
      items={options}
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue !== null) {
          onValueChange(nextValue)
        }
      }}
    >
      <SelectPrimitive.Label
        data-slot="select-label"
        className="text-sm font-medium text-foreground"
      >
        {label}
      </SelectPrimitive.Label>
      <SelectPrimitive.Trigger
        data-slot="select-trigger"
        className={cn(
          "flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
        )}
      >
        <SelectPrimitive.Value placeholder="Seleccionar" />
        <SelectPrimitive.Icon className="text-muted-foreground">
          <ChevronsUpDownIcon className="size-4" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner data-slot="select-positioner" sideOffset={4}>
          <SelectPrimitive.Popup
            data-slot="select-popup"
            className={cn(
              "rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none",
              "data-starting-style:scale-95 data-starting-style:opacity-0",
              "data-ending-style:scale-95 data-ending-style:opacity-0"
            )}
          >
            <SelectPrimitive.List>
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  data-slot="select-item"
                  className={cn(
                    "flex cursor-default items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none",
                    "data-highlighted:bg-muted data-highlighted:text-foreground"
                  )}
                >
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator>
                    <CheckIcon className="size-4" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

export { Select }
export type { SelectOption }
