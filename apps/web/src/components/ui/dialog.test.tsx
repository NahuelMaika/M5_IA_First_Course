import { useState } from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Dialog } from "./dialog"

// vitest.setup.ts does not register global afterEach(cleanup) (no `test.globals: true`), so each
// test must unmount the previous render itself -- otherwise dialogs from earlier tests stay in
// document.body (see expense-form.test.tsx for the same convention).
afterEach(() => {
  cleanup()
})

function ControlledDialog({
  initialOpen = true,
  onOpenChange,
}: {
  initialOpen?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(initialOpen)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        onOpenChange?.(next)
      }}
      title="Editar gasto"
    >
      <p>Contenido del formulario</p>
    </Dialog>
  )
}

describe("Dialog", () => {
  it("renders content when open=true", () => {
    render(
      <Dialog open onOpenChange={() => {}} title="Editar gasto">
        <p>Contenido del formulario</p>
      </Dialog>
    )

    expect(screen.getByText("Editar gasto")).toBeInTheDocument()
    expect(screen.getByText("Contenido del formulario")).toBeInTheDocument()
  })

  it("does not render when open=false", () => {
    render(
      <Dialog open={false} onOpenChange={() => {}} title="Editar gasto">
        <p>Contenido del formulario</p>
      </Dialog>
    )

    expect(screen.queryByText("Editar gasto")).not.toBeInTheDocument()
    expect(
      screen.queryByText("Contenido del formulario")
    ).not.toBeInTheDocument()
  })

  it("invokes onOpenChange(false) on Escape without asking for confirmation", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(<ControlledDialog onOpenChange={onOpenChange} />)

    expect(screen.getByText("Editar gasto")).toBeInTheDocument()

    await user.keyboard("{Escape}")

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(screen.queryByText(/¿está seguro|confirmar/i)).not.toBeInTheDocument()
    expect(screen.queryByText("Editar gasto")).not.toBeInTheDocument()
  })

  it("invokes onOpenChange(false) on outside click without asking for confirmation", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(<ControlledDialog onOpenChange={onOpenChange} />)

    expect(screen.getByText("Editar gasto")).toBeInTheDocument()

    await user.click(document.body)

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(screen.queryByText(/¿está seguro|confirmar/i)).not.toBeInTheDocument()
    expect(screen.queryByText("Editar gasto")).not.toBeInTheDocument()
  })

  it("traps focus inside the dialog while it is open", async () => {
    const user = userEvent.setup()

    render(
      <Dialog open onOpenChange={() => {}} title="Editar gasto">
        <button type="button">Primero</button>
        <button type="button">Segundo</button>
      </Dialog>
    )

    const first = screen.getByRole("button", { name: "Primero" })
    const second = screen.getByRole("button", { name: "Segundo" })

    // Base UI moves initial focus asynchronously after the popup mounts.
    await waitFor(() => expect(first).toHaveFocus())

    await user.tab()
    expect(second).toHaveFocus()

    // Tabbing past the last focusable element cycles back inside the dialog's focus trap
    // (implemented via Base UI's sentinel guard spans, siblings of the popup inside the
    // portal), it never escapes to document.body.
    await user.tab()
    expect(document.body).not.toHaveFocus()

    const portal = document.querySelector("[data-base-ui-portal]")
    expect(portal).toContainElement(document.activeElement as HTMLElement)
  })
})
