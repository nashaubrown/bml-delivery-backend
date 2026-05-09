# TripPay

Plan trips with friends. Build a shared itinerary. Split expenses in any
currency. Settle up with the fewest possible transfers.

A full-stack Next.js 14 (App Router) + Postgres + Prisma app, mobile-first.

## Features

- Email + password auth (JWT in an `httpOnly` cookie)
- Trips with shareable invite links — anyone with the link can join
- Shared itinerary: title, time range, location, notes, attendees
- Expenses with four split types: **equal**, **unequal**, **shares**, **percent**
- Multi-currency expenses with stored FX rate; balances normalized to the trip's
  base currency
- Net balances + greedy settle-up (minimum transfers algorithm)
- Recording settlements ("mark paid") to clear balances over time

## Stack

- Next.js 14 App Router + TypeScript
- Tailwind CSS
- Prisma ORM + PostgreSQL
- `jose` for JWT signing, `bcryptjs` for password hashing, `zod` for input validation

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# then edit .env to point DATABASE_URL at your Postgres
# and set JWT_SECRET to a long random string:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Create the database schema

```bash
npm run db:push      # for development; creates tables from schema.prisma
# or, to use migrations:
# npm run db:migrate
```

### 4. (Optional) seed demo data

```bash
npm run db:seed
```

This creates three users (`alice@example.com`, `bob@example.com`,
`carol@example.com`, all password `password`) and a "Bali 2026" trip with
itinerary items, multi-currency expenses, and several split types so you can
immediately see balances and settle-up flows.

### 5. Run

```bash
npm run dev
```

Visit http://localhost:3000.

## How splitting works

All money is stored as integer cents. Every expense has a `currency`, an
`fxRate` to the trip's `baseCurrency`, and a precomputed `baseAmountCents` for
fast balance math.

For each expense the chosen split type produces an `ExpenseSplit` row per
participant in base-currency cents:

- **EQUAL** — total / N, with rounding remainder distributed across participants
- **UNEQUAL** — explicit per-person amounts (must sum to total)
- **SHARES** — per-person share weights
- **PERCENT** — per-person percentages (must sum to 100)

A user's net = sum of expenses they paid − sum of their splits + settlements
received − settlements paid. Settle-up pairs the largest creditor with the
largest debtor until everyone is at zero (`src/lib/splits.ts`).

## API surface

All routes return JSON. Auth is via the `trippay_token` httpOnly cookie set on
login/register.

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/trips
POST   /api/trips
GET    /api/trips/:id
PATCH  /api/trips/:id
DELETE /api/trips/:id
POST   /api/trips/:id/invite          (regenerate invite token)
POST   /api/trips/join                (body: { token })

GET    /api/trips/:id/itinerary
POST   /api/trips/:id/itinerary
PATCH  /api/trips/:id/itinerary/:itemId
DELETE /api/trips/:id/itinerary/:itemId

GET    /api/trips/:id/expenses
POST   /api/trips/:id/expenses
DELETE /api/trips/:id/expenses/:expenseId

GET    /api/trips/:id/balances        (net + minimized transfers)
GET    /api/trips/:id/settlements
POST   /api/trips/:id/settlements
```

## Project layout

```
prisma/
  schema.prisma        # data model
  seed.ts              # demo data
src/
  app/
    api/               # route handlers
    trips/             # signed-in app pages
    join/[token]/      # invite landing page
    login, register    # auth pages
  components/Header.tsx
  lib/
    prisma.ts          # singleton client
    auth.ts            # JWT, cookie, password hashing
    api.ts             # error helpers
    money.ts           # cents <-> decimal, format
    splits.ts          # resolveSplit, minimizeTransfers
    trip-access.ts     # membership/role checks
```
