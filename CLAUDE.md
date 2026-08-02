# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
```bash
# Start full development environment (frontend + backend)
npm run dev

# Start frontend only (Vite dev server)
npm run frontend:dev

# Start backend only (TypeScript with ts-node)
npm run backend:dev

# Build for production
npm run build
```

### Code Quality
```bash
# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# TypeScript type checking
npm run type-check

# Run tests
npm run test

# Run tests in watch mode
npm run test:watch

# Format code with Prettier
npm run format

# Prepare for release (lint + type-check + test + audit)
npm run prepare-release
```

### Database Management
```bash
# Create user accounts (admin/user with default passwords)
npm run create-accounts
```

## Architecture Overview

This is a **web-based PCR (Patient Care Report) application** built with:
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Express.js + TypeScript + sql.js (SQLite in WebAssembly)
- **Canvas**: HTML5 Canvas for interactive injury diagrams

### Key Architecture Patterns

1. **Monorepo Structure**: Frontend and backend in same repository
2. **Shared Types**: Common TypeScript interfaces in `src/shared/types/`
3. **Context-Based State**: React Context for auth, forms, notifications
4. **Component Architecture**: UI components in `src/frontend/components/ui/`, composite components in `composite/`

### Directory Structure
```
src/
├── frontend/          # React frontend application
│   ├── components/    # Reusable components
│   │   ├── ui/        # Basic UI components (Button, Modal, etc.)
│   │   ├── forms/     # Form-specific components
│   │   ├── layout/    # Layout components (Header, Sidebar)
│   │   └── composite/ # Complex domain components
│   ├── context/       # React Context providers
│   ├── hooks/         # Custom React hooks
│   ├── pages/         # Page components
│   └── services/      # API communication layer
├── backend/           # Express.js backend
│   ├── src/database/  # sql.js database setup and migrations
│   ├── src/routes/    # API route handlers
│   ├── src/services/  # Business logic layer
│   └── src/middleware/# Express middleware
└── shared/            # Shared TypeScript types and utilities
```

## Development Workflow

### Form Development
- PCR form fields defined in `form_inputs.md` specification
- Form state managed via `FormContext`
- Validation handled client-side with real-time feedback
- Draft data stored in local storage with 30-second intervals

### Component Development
- Follow existing patterns in `src/frontend/components/ui/`
- Use Tailwind CSS with healthcare-themed color palette
- Implement accessibility with ARIA labels and keyboard navigation
- Components should be typed with TypeScript interfaces

### API Development
- Routes defined in `src/backend/src/routes/`
- Authentication via JWT tokens with middleware protection
- sql.js database (SQLite compiled to WebAssembly)
- Input validation with manual checks in route handlers

## Key Features

### Canvas Injury Diagram
- Interactive body diagram using native HTML5 Canvas API
- Drawing tools for marking injuries and annotations
- Canvas data serialized to JSON for database storage
- Located in `src/frontend/components/composite/InjuryCanvas.tsx`

### Authentication System
- JWT-based authentication with role-based access (admin/user)
- Session timeout with automatic logout warnings
- Protected routes with redirect handling
- Default accounts: admin/vcrt-ebic2026! and user/user

### Cleanup
- Cleanup service runs hourly, removes old reports (submitted/draft/approved) after 730 days (2 years)
- Before a submitted/approved report is deleted (manually or by cleanup), its de-identified stats fields are archived to `pcr_call_archive` (see `src/backend/src/services/pcrArchive.ts`) so call-history stats survive deletion
- Activity logs retained for 7 days

## Testing

- **Unit Tests**: Jest with ts-jest preset
- **E2E Tests**: Playwright for end-to-end testing
- **Test Coverage**: Coverage reports generated in `/coverage`
- Tests located alongside source files with `.test.ts` or `.spec.ts` extensions

## Build & Deployment

### Production Build
1. `npm run build` - Builds both frontend and backend
2. Deploy the built files to your web server or hosting platform

## Database Schema

- sql.js database (`pcr_database.db`)
- Main tables: users, pcr_reports, activity_logs
- pcr_reports uses status field (draft/completed/submitted/approved) for all report states
- Database initialization in `src/backend/src/database/`
- Cleanup service runs hourly to remove old records

## Environment Configuration

- `.env` file for environment variables
- Backend runs on port 3000, frontend dev server on 5173
- CORS configured for localhost development
- Production builds disable dev-specific security policies
