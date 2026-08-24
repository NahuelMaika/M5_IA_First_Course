import { useState } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

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
})
