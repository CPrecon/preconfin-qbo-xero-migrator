# Local Development

## Requirements

- Node.js 22+
- npm 10+
- Supabase project for PostgreSQL and Storage
- Intuit developer app with QuickBooks Online accounting scope

## Environment

Create `.env` from `.env.example` at the repository root. The API reads the root file during local development.

`TOKEN_ENCRYPTION_KEY` must be a 32-byte base64 key. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Commands

```bash
npm install
npm run dev:api
npm run dev:web
npm run test
npm run build
```

The API defaults to `http://localhost:4000`; the web app defaults to `http://localhost:3000`.
