# Frontend source layout

The `app/` directory is deliberately limited to framework routes and global styles.
Product code belongs in `src/`:

- `components/` — shared visual primitives and layout components.
- `features/` — domain-owned screens and feature components.
- `services/` — browser and API-facing utilities.

Feature boundaries currently cover authentication, dashboard, aptitude, interview,
jobs, cover letters, group discussions, resume building, professional workspaces,
and platform administration. Add new domain code to its feature before adding it to
shared UI.
