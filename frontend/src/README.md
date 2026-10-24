# Frontend source layout

- `components/` — shared UI, layout, and workflow components.
- `hooks/` — reusable React hooks.
- `pages/` — auth flow, role workspaces, and student activity screens.
- `services/` — browser and API-facing utilities.
- `styles/` — global styles and design tokens.

Static assets live in the root `public/` directory, as expected by Vite. App
navigation and role workflows remain in the existing client-side application.
