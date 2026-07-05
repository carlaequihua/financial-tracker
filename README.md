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
- Transactions CRUD with filters by date/account/category/type/cleared
- Recurring incomes/expenses CRUD with daily/weekly/monthly/yearly cadence
- One-time transaction support and cleared status updates
- Budgets CRUD and monthly budget alerts
- Import transactions from CSV or XLSX
- Export transactions to CSV or XLSX with optional date range
- Upcoming expenses derived from recurring rules
- Master data endpoints (accounts/categories)

## Tests
```bash
cd backend
npm test
```
