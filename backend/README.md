# Placeble Backend

The independent Placeble Express and MongoDB API. It owns authentication, role and institution authorization, refresh-token rotation, invitations, user profiles, and future domain services.

## Local development

1. Copy `.env.example` to `.env` and provide the required secrets.
2. Install dependencies with `npm install`.
3. Run `npm run seed` once for local demo accounts.
4. Run `npm run dev`.

The API serves versioned routes from `http://localhost:4000/api/v1`.

## Commands

- `npm run dev` — watch-mode API server
- `npm run build` — bundled production output
- `npm run start` — run the production bundle
- `npm run seed` — seed demo accounts
- `npm run lint` — code-quality checks
- `npm run typecheck` — TypeScript validation

