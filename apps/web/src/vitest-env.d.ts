// Type-only augmentation for Vitest's `expect` with jest-dom matchers (e.g. `toHaveAttribute`).
// `vitest.setup.ts` imports "@testing-library/jest-dom/vitest" for runtime behavior, but that
// file lives outside tsconfig.json's "include" (src/**), so the module augmentation it carries
// never reaches `tsc --noEmit` for files under src/ without this reference.
/// <reference types="@testing-library/jest-dom/vitest" />
