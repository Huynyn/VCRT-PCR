# VCRT PCR

VCRT PCR is a local-first patient care report application for emergency response workflows. It combines a React/Vite frontend, an Express API, and an Electron shell so the team can create, save, review, and print PCRs from a desktop app while keeping data local by default.

## What it does

- Create and edit structured PCR forms for patient care calls
- Save drafts automatically and resume later
- Generate PDF reports and support print-based submission workflows
- Manage responders, users, and activity logs
- Review call statistics and archived report history
- Work offline with a local SQLite database via sql.js

## Tech stack

- Frontend: React 18, TypeScript, Vite, Tailwind CSS
- Backend: Express.js with TypeScript
- Data: sql.js (SQLite in WebAssembly)
- Desktop: Electron
- Security: JWT authentication with bcrypt and encrypted on-disk database storage

## Project structure

```text
src/
├── frontend/        # React app, pages, components, services, context
├── backend/         # Express API and database layer
├── shared/          # Shared types and utilities
electron/            # Electron main and preload scripts
public/              # Static assets
```

## Quick start

### Prerequisites

- Node.js 23 or newer
- npm 10 or newer

### Install and run

```bash
npm install
npm run create-accounts
npm run dev
```

That starts the frontend and backend for local development. The frontend is served on port 5173 and the backend API on port 3000.

### Desktop app

```bash
npm run electron:dev
```

## Default accounts

After running the account setup script, the app creates default accounts:

- Admin: `admin` / `Vcrt-Ebic2026!`
- User: `user` / `Vcrt-User2026!`

## Useful scripts

```bash
npm run frontend:dev      # Vite dev server
npm run backend:dev       # Express API via ts-node
npm run dev               # Start frontend + backend together
npm run build             # Build frontend and backend
npm run electron:dev      # Run the Electron app
npm run lint              # Run ESLint
npm run type-check        # TypeScript checks
npm run test              # Run Jest tests
npm run prepare-release   # Lint, type-check, test, and audit
```

## Data and storage

- The application stores data in a local SQLite database and saves it to disk periodically.
- The database file is encrypted on disk and decrypted in memory when the app loads.
- Cleanup jobs remove older reports and logs according to the retention settings in the backend services.

## Notes for contributors

- Keep UI work aligned with the existing React component structure under src/frontend/components.
- Prefer TypeScript and follow the existing linting and formatting rules.
- Use the release checklist via `npm run prepare-release` before shipping changes.

