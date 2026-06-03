# Authentication Implementation Roadmap

## Architecture Commitments

- Keep Electron UI, IPC API, business services, repositories, and database concerns separated.
- Store all auth state locally for offline-first operation.
- Use PostgreSQL as the source of truth for users, roles, refresh sessions, and activity logs.
- Keep JWT tokens out of renderer storage; renderer calls backend IPC endpoints only.
- Seed default users only through an explicit script, never during app startup.

## Implementation Phases

1. Database foundation
   - Create normalized `roles`, `users`, `refresh_tokens`, and `activity_logs` tables.
   - Add strict role references and login metadata.
   - Keep schema creation idempotent for packaged desktop startup.

2. Secure seeding
   - Add `npm run seed:admin`.
   - Hash the admin password with bcrypt.
   - Insert/update only through the seed script.

3. Auth API layer
   - Implement IPC endpoints that behave like backend routes:
     - `/auth/login`
     - `/auth/profile`
     - `/auth/refresh`
     - `/auth/logout`
     - `/auth/can-access`
   - Return safe error messages only.

4. Auth business logic
   - Validate email/password.
   - Verify bcrypt password hash.
   - Issue JWT access and refresh tokens.
   - Persist refresh token hashes in PostgreSQL.
   - Store refresh token on disk using Electron secure storage when available.

5. Route protection and RBAC
   - Dashboard renders only from a successful profile endpoint.
   - Route access checks are enforced in backend service logic.
   - Admin, Manager, and Cashier role permissions are defined centrally.

6. Activity logging
   - Log successful login, failed login, token refresh, and logout.
   - Preserve logs in PostgreSQL for reporting and audit modules.

7. Renderer integration
   - Remove hardcoded admin data from frontend.
   - Add loading states and clear invalid credential errors.
   - Add logout flow.
   - Restore persistent sessions by calling profile on startup.

8. Verification
   - Run seed script.
   - Run auth smoke checks for valid login, invalid login, profile, RBAC, and logout.
   - Build CSS.
   - Package Windows EXE.
