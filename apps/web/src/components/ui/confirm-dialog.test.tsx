import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ConfirmDialog } from "./confirm-dialog"

// vitest.setup.ts does not register global afterEach(cleanup) (no `test.globals: true`), so each
// test must unmount the previous render itself -- otherwise dialogs from earlier tests stay in
// document.body (same convention as dialog.test.tsx).
afterEach(() => {
  cleanup()
})

describe("ConfirmDialog", () => {
  it("shows the affected item's name", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        itemName="Supermercado Coto"
        onConfirm={() => {}}
      />
    )

    expect(screen.getAllByText(/Supermercado Coto/).length).toBeGreaterThan(0)
  })

  it('puts initial focus on the "Eliminar" button', async () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        itemName="Supermercado Coto"
        onConfirm={() => {}}
      />
    )

    const confirmButton = screen.getByRole("button", { name: "Eliminar" })

    // Base UI moves initial focus asynchronously after the popup mounts (see dialog.test.tsx).
    await waitFor(() => expect(confirmButton).toHaveFocus())
  })

  it("invokes onConfirm when confirming", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        itemName="Supermercado Coto"
        onConfirm={onConfirm}
      />
    )

    await user.click(screen.getByRole("button", { name: "Eliminar" }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it("closes without invoking onConfirm when cancelling", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        itemName="Supermercado Coto"
        onConfirm={onConfirm}
      />
    )

    await user.click(screen.getByRole("button", { name: "Cancelar" }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
