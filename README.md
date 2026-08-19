# Placeble

Placeble is organized as two independent applications so the frontend and backend can move into separate repositories when the product is ready.

```text
placeble/
├── frontend/   # Vite/React web application on port 3000
├── backend/    # Express/MongoDB API on port 5000
└── package.json
```

## Run both applications

```bash
npm install
npm run dev
```

The root workspace is only a local-development convenience. Neither application imports source code from the other; their boundary is the versioned HTTP API configured through environment variables.

## Independent repositories later

Each folder has its own `package.json`, `.env.example`, `README.md`, linting, type checking, build, and start scripts. To split the repositories, move either folder to a new repository and run `npm install` inside it.

