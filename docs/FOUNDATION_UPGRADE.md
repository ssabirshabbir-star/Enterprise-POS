# Enterprise POS — Foundation Upgrade Notes

## Tooling Added (`upgrade/foundation-v1`)

This branch adds enterprise-grade tooling infrastructure to the project.
**No existing feature code has been changed.**

### New Tools

| Tool | Version | Purpose |
|---|---|---|
| TypeScript | 5.8+ | Static typing for new modules |
| Vite | 6.x | Renderer build pipeline (additive) |
| Prisma | 6.x | Type-safe DB client for new TS modules |
| ESLint | 9.x | Linting (strict for .ts, advisory for .js) |
| Prettier | 3.x | Code formatting |
| Husky | 9.x | Git hooks |
| lint-staged | 16.x | Per-file staged checks |
| Vitest | 3.x | Unit test runner |
| Playwright | 1.x | E2E test runner |
| Zod | 3.x | Runtime schema validation |
| Pino | 9.x | Structured logging |

### New Scripts

```bash
npm run typecheck:ts        # TypeScript type-check (new .ts files only)
npm run lint                # ESLint (TypeScript files)
npm run lint:fix            # ESLint auto-fix
npm run format              # Prettier write
npm run format:check        # Prettier check (CI)
npm run test:unit           # Vitest unit tests
npm run test:unit:watch     # Vitest watch mode
npm run test:unit:coverage  # Vitest with coverage report
npm run test:e2e            # Playwright e2e tests
npm run build:renderer      # Vite renderer build (additive)
npm run db:pull             # Prisma DB introspection
npm run db:studio           # Prisma Studio GUI
npm run prisma:generate     # Generate Prisma client
```

### New Files

```
tsconfig.json               TypeScript config (strict, JS-compatible)
vite.config.ts              Vite renderer build config
vitest.config.ts            Vitest unit test config
playwright.config.ts        Playwright e2e config
eslint.config.mjs           ESLint flat config (v9)
.prettierrc.json            Prettier config
.prettierignore             Prettier ignore patterns
.lintstagedrc.json          lint-staged config
.husky/pre-commit           Git pre-commit hook
.husky/commit-msg           Conventional commits enforcement
prisma/schema.prisma        Prisma schema (mirrors existing DB)
prisma/seed.ts              Prisma seed (delegates to seed-admin.js)
src/shared/core/            Result<T>, error classes
src/shared/types/           TypeScript type definitions
src/shared/utils/           Typed format + Zod validation schemas
src/shared/config/          Typed env config (Zod-validated)
src/shared/logger/          Pino structured logger factory
src/shared/database/        Prisma client singleton
tests/unit/shared/          First unit tests (format utilities)
tests/e2e/                  E2E test placeholders
_archive/                   Superseded files (never deleted)
```

### Migration Rules

1. **Existing JS modules are untouched** — `allowJs: true`, `checkJs: false`
2. **New features** should be written in TypeScript in `src/`
3. **ESLint** is strict only for `.ts` files; JS files get advisory warnings only
4. **Prisma** is additive — the existing `pg` pool remains authoritative
5. **Vite** only applies to the renderer; the main process stays CommonJS

### First Steps After Merge

```bash
# 1. Generate Prisma client
npm run prisma:generate

# 2. Pull current DB schema into Prisma (optional — introspects live DB)
npm run db:pull

# 3. Run unit tests
npm run test:unit

# 4. Type-check new TypeScript files
npm run typecheck:ts

# 5. Verify Electron still starts
npm start
```
