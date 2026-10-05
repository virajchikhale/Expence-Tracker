# Expense Tracker web app

Next.js 15 + React 19 + Tailwind UI for the expense tracker. It talks to the FastAPI backend in `../Expence-Manager-Backend` (see the [root README](../README.md) for the full stack, configuration and Docker Compose setup).

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
npm run lint
```

The browser reaches the API at `PUBLIC_API_URL` (baked in at build time); the backend must list this origin in `CORS_ORIGINS`.
