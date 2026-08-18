# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- [FEAT-001a] pnpm monorepo bootstrap (`packages/domain`, `packages/categorization`), both
  compiled to `dist/` before tests run.
- [FEAT-001a] Deterministic keyword-based expense categorizer (`@ggasia/categorization`):
  text normalization and tokenization shared across the pipeline, the 258-keyword table with
  pluralization rules, tie-break-by-normative-order matching, a public port + factory, and
  marked category name resolution (`#nombre`).
