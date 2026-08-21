// The plain "@testing-library/jest-dom" entry assumes Jest's global `expect` and throws
// "expect is not defined" under Vitest. The "/vitest" subpath extends Vitest's own `expect`.
import "@testing-library/jest-dom/vitest";
