# Financial Tracker

This shit is vibe coded :P

Monorepo with:
- `backend`: Express + PostgreSQL API (modular routes/services/db)
- `frontend`: Vite + React app (router, React Query, responsive CSS)

## Quickstart

### 1) Database
Follow the commands in `DATABASE_INSTRUCTIONS.md` to create the database and role.

### 2) Backend
```bash
cd backend
cp .env.example .env
# edit .env if needed
npm install
npm run migrate
npm run seed
npm run dev
```

Backend default URL: `http://localhost:3001`

### 3) Frontend
```bash
cd frontend
cp .env.example .env
# edit .env if needed
npm install
npm run dev
```

Frontend default URL: `http://localhost:5173`

## Unified Dev Commands

From the project root, use one command to manage both backend and frontend servers:

```bash
npm run dev:start
npm run dev:stop
npm run dev:restart
npm run dev:status
```

Logs are written to `.run/logs/`.

## API Highlights
- Transactions CRUD with filters by date/account/category/type/cleared and case-insensitive search
- Same-date transaction ordering, including projected recurring occurrences
- Recurring incomes/expenses CRUD with daily/weekly/monthly/yearly cadence
- One-time transaction support and cleared status updates
- Budgets CRUD and monthly budget alerts
- Import transactions from CSV or XLSX
- Export transactions to CSV or XLSX with optional date range
- Upcoming expenses derived from recurring rules
- Master data endpoints (accounts/categories)

## Transaction Search And Ordering

Use Search on the Transactions page to match descriptions, account names, category
names, types, or amounts. Select All accounts for global search, or an account to
search only that account. Search combines with the other active filters, including
the date range, and includes projected recurring entries when enabled. Running
balances continue to include transactions hidden by search or other filters.

The up/down arrow buttons move a transaction relative to another visible transaction
on the same date. Moves are saved across refreshes, work on desktop and mobile,
and update running balances in the saved order. Changing date-sort direction reverses
the displayed order. Recurring occurrence ordering is retained when projected rows
become saved transactions. Reordering a transfer leg does not move its other account's leg.

API additions:
- `GET /api/transactions?search=coffee&account_id=2` searches saved transactions.
- `GET /api/transactions/projected?from=2026-11-01&to=2026-11-30&search=coffee&account_id=2` searches projections.
- `PATCH /api/transactions/order` accepts `date`, `key`, `target_key`, and `placement`
	(`before` or `after`). Keys are `transaction:<id>` for one-time rows and
	`recurring:<rule_id>:<YYYY-MM-DD>:<account_id>` for recurring occurrences.
	Both rows must exist on the specified date; invalid input returns 400 and stale
	or cross-date moves return 409. Transaction responses include `sort_order`.

Run `cd backend && npm run migrate` when updating an existing installation to add
the transaction-order table.

## Tests
```bash
cd backend
npm test
```
