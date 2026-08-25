import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import RootLayout from "./layout"

// Regression test for FIX-002 (docs/daw/specs/rca-FIX-002.md): without `isolation: isolate` on
// the root <body>, Base UI's Dialog and Select portals (both appended to document.body) don't
// share a guaranteed stacking context, so a nested Select's popup can render behind an open
// Dialog's popup despite having a higher z-index class (see select.test.tsx).
describe("RootLayout", () => {
  it("applies isolation: isolate to the root <body>", () => {
    const { baseElement } = render(
      <RootLayout>
        <div>content</div>
      </RootLayout>
    )

    // React renders <html>/<body> by applying their props onto the real document
    // elements rather than creating nested tags, so `baseElement` (document.body)
    // is what carries the class -- not a `<body>` found via querySelector.
    expect(baseElement).toHaveClass("isolate")
  })
})
