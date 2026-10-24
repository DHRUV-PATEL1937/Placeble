# Placeble Frontend

The independent Placeble web client. It contains the role-aware login experience, student product, TPO dashboard, recruiter workspace, faculty view, responsive design system, and the two-panel Resume Maker workspace.

## Project structure

```text
public/                 Static files served from the site root
src/
  components/           Shared UI, layout, and workflow components
  hooks/                Reusable React hooks
  pages/                Auth flow and role/activity screens
  services/             Browser and API-facing utilities
  styles/               Global styles and design tokens
  main.tsx              React application entry point
```

The app keeps its existing client-side navigation and role-based workflows.

## Local development

1. Copy `.env.example` to `.env`.
2. Install dependencies with `npm install`.
3. Run `npm run dev`.

The frontend expects the API at `NEXT_PUBLIC_API_URL` and serves on `http://localhost:3000`.

## Commands

- `npm run dev` — local development server
- `npm run build` — production build
- `npm run lint` — code-quality checks
- `npm run typecheck` — TypeScript validation
