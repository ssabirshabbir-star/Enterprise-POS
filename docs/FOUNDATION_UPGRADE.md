# Deprecated Stack References

This file records tooling that existed during an earlier foundation experiment but is no longer part
of the approved Enterprise POS stack.

## Approved Stack

- Electron
- JavaScript
- HTML
- CSS
- Tailwind CSS
- PostgreSQL via `pg`

The project must not introduce TypeScript, Prisma, Vite, React, Vue, Vitest, or Playwright-based
TypeScript workflows for the active runtime path.

## Deprecated Tooling Kept On Disk For Now

The following files/folders may still exist in the repository for historical reference, but they are
not part of active scripts or dependencies after Phase 1 Step 1:

- `tsconfig.json`
- `vite.config.ts`
- `vitest.config.ts`
- `playwright.config.ts`
- `prisma.config.ts`
- `prisma/schema.prisma`
- `prisma/seed.ts`
- `src/shared/**/*.ts`
- `tests/**/*.ts`

Do not delete these files during stack drift cleanup. They should be archived or removed only in a
separate approved cleanup phase.

## Deprecated Scripts Removed From Active Use

- `typecheck:ts`
- `build:renderer`
- `db:pull`
- `db:studio`
- `prisma:generate`
- `test:unit`
- `test:unit:watch`
- `test:unit:coverage`
- `test:e2e`

## Deprecated Dependencies Removed From Active Install

- `@prisma/client`
- `prisma`
- `typescript`
- `ts-node`
- `tsx`
- `vite`
- `vitest`
- `@vitest/coverage-v8`
- `@playwright/test`
- `@typescript-eslint/eslint-plugin`
- `@typescript-eslint/parser`
- `@types/node`

## Phase 1 Rule

Runtime and build workflows must stay inside the approved stack. If any future tool is proposed, it
needs an explicit architecture decision before being added to `package.json`.
