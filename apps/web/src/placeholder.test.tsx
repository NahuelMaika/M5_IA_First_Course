import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

// Placeholder test confirming the Vitest + Testing Library + jsdom pipeline is wired correctly.
// Real component tests start in Block 6 onward; this file's only job is proving the config works.
describe("testing infrastructure bootstrap", () => {
  it("renders a DOM node via Testing Library under jsdom", () => {
    const { container } = render(<div>placeholder</div>);

    expect(container.querySelector("div")).not.toBeNull();
  });
});
