import { useState } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Dialog } from "./dialog"
import { Select } from "./select"

// vitest.setup.ts does not register global afterEach(cleanup) (no `test.globals: true`), so each
// test must unmount the previous render itself -- otherwise popups from earlier tests stay in
// document.body (same convention as dialog.test.tsx / confirm-dialog.test.tsx).
afterEach(() => {
  cleanup()
})

const OPTIONS = [
  { value: "supermercado", label: "Supermercado" },
  { value: "transporte", label: "Transporte" },
  { value: "salud", label: "Salud" },
]

function ControlledSelect({
  onValueChange,
}: {
  onValueChange?: (value: string) => void
}) {
  const [value, setValue] = useState<string | null>(null)

  return (
    <Select
      label="Categoría"
      value={value}
      onValueChange={(next) => {
        setValue(next)
        onValueChange?.(next)
      }}
      options={OPTIONS}
    />
  )
}

describe("Select", () => {
  it("renders the passed options", async () => {
    const user = userEvent.setup()

    render(
      <Select
        label="Categoría"
        value={null}
        onValueChange={() => {}}
        options={OPTIONS}
      />
    )

    await user.click(screen.getByRole("combobox", { name: "Categoría" }))

    for (const option of OPTIONS) {
      expect(
        await screen.findByRole("option", { name: option.label })
      ).toBeInTheDocument()
    }
  })

  it("invokes onValueChange with the selected option's value", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()

    render(<ControlledSelect onValueChange={onValueChange} />)

    await user.click(screen.getByRole("combobox", { name: "Categoría" }))
    await user.click(await screen.findByRole("option", { name: "Transporte" }))

    expect(onValueChange).toHaveBeenCalledWith("transporte")
  })

  it("is operable by keyboard", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()

    render(<ControlledSelect onValueChange={onValueChange} />)

    await user.tab()
    expect(screen.getByRole("combobox", { name: "Categoría" })).toHaveFocus()

    await user.keyboard("{Enter}")
    expect(
      await screen.findByRole("option", { name: "Supermercado" })
    ).toBeInTheDocument()

    await user.keyboard("{ArrowDown}")
    await user.keyboard("{Enter}")

    expect(onValueChange).toHaveBeenCalledWith("transporte")
  })

  // Regression test for the Loop 2 bug (spec-FEAT-005a.md Block 9): select-popup had no z-*
  // class, so it rendered behind dialog-backdrop/dialog-popup (both z-50) -- a positive z-index
  // always paints above z-auto regardless of DOM/portal mount order.
  it("select-popup carries a z-* class with a numeric value greater than dialog-popup's z-50", async () => {
    const user = userEvent.setup()

    render(
      <Dialog open onOpenChange={() => {}} title="Editar gasto">
        <Select label="Categoría" value={null} onValueChange={() => {}} options={OPTIONS} />
      </Dialog>
    )

    await user.click(screen.getByRole("combobox", { name: "Categoría" }))
    await screen.findByRole("option", { name: "Supermercado" })

    const popup = document.querySelector('[data-slot="select-popup"]')
    const dialogPopup = document.querySelector('[data-slot="dialog-popup"]')
    expect(popup).not.toBeNull()
    expect(dialogPopup).not.toBeNull()

    const popupZIndexClass = Array.from(popup!.classList).find((c) => c.startsWith("z-["))
    expect(popupZIndexClass).toBeDefined()
    const popupZIndex = Number(popupZIndexClass!.replace("z-[", "").replace("]", ""))
    expect(popupZIndex).toBeGreaterThan(50)
  })

  // Regression test for FIX-002 loop 2 (rca-FIX-002.md): select-positioner renders with
  // `position: fixed` (Base UI internals), which creates its OWN stacking context regardless of
  // z-index. A z-* class on select-popup alone never escapes that context to compete against
  // dialog-popup's z-50 -- the class has to be on select-positioner itself.
  it("select-positioner carries a z-* class with a numeric value greater than dialog-popup's z-50", async () => {
    const user = userEvent.setup()

    render(
      <Dialog open onOpenChange={() => {}} title="Editar gasto">
        <Select label="Categoría" value={null} onValueChange={() => {}} options={OPTIONS} />
      </Dialog>
    )

    await user.click(screen.getByRole("combobox", { name: "Categoría" }))
    await screen.findByRole("option", { name: "Supermercado" })

    const positioner = document.querySelector('[data-slot="select-positioner"]')
    expect(positioner).not.toBeNull()

    const positionerZIndexClass = Array.from(positioner!.classList).find((c) =>
      c.startsWith("z-[")
    )
    expect(positionerZIndexClass).toBeDefined()
    const positionerZIndex = Number(
      positionerZIndexClass!.replace("z-[", "").replace("]", "")
    )
    expect(positionerZIndex).toBeGreaterThan(50)
  })

  // Same bug, verified end-to-end: the option must actually be clickable when Select is nested
  // inside an open Dialog (same nesting as expense-edit-dialog.tsx, Block 11) -- a class-only
  // assertion would not have caught the original bug if the fix used the wrong class name.
  it("is clickable when mounted inside an open Dialog (same nesting as expense-edit-dialog.tsx)", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()

    render(
      <Dialog open onOpenChange={() => {}} title="Editar gasto">
        <Select label="Categoría" value={null} onValueChange={onValueChange} options={OPTIONS} />
      </Dialog>
    )

    await user.click(screen.getByRole("combobox", { name: "Categoría" }))
    await user.click(await screen.findByRole("option", { name: "Transporte" }))

    expect(onValueChange).toHaveBeenCalledWith("transporte")
  })
})
