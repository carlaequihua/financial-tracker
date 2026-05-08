import { query } from "../db/query.js";
import { parseCsv, toCsv } from "../utils/csv.js";
import XLSX from "xlsx";
import { parse } from "csv-parse/sync";

const WIDE_FORMAT_ACCOUNT_COLUMNS = [
  "BofA Balance",
  "Chase Balance",
  "Shared Marcus HYSA",
  "Shared Chase",
  "Macus HYSA",
  "Cash",
  "Cashflow"
];

function normalizeKey(key) {
  return String(key || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function toIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return "";
  const month = Number(m[1]);
  const day = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseMoney(value) {
  if (value === null || value === undefined) return Number.NaN;
  const raw = String(value).trim();
  if (!raw) return Number.NaN;

  const negativeParens = raw.startsWith("(") && raw.endsWith(")");
  const normalized = raw.replace(/[$,\s]/g, "").replace(/[()]/g, "");
  const n = Number(normalized);
  if (Number.isNaN(n)) return Number.NaN;
  return negativeParens ? -n : n;
}

function pickValue(row, candidates) {
  const keyMap = new Map(Object.keys(row).map((k) => [normalizeKey(k), row[k]]));
  for (const key of candidates) {
    const value = keyMap.get(normalizeKey(key));
    if (value !== undefined && String(value).trim() !== "") return value;
  }
  return "";
}

function isWideImportRow(row) {
  const keys = Object.keys(row).map((k) => normalizeKey(k));
  const hasDate = keys.includes("date");
  const hasDescription = keys.includes("expenditurelocation");
  const hasAmount = keys.includes("expenditureamount");
  return hasDate && hasDescription && hasAmount;
}

function expandWideImportRow(row) {
  const txnDate = toIsoDate(pickValue(row, ["Date"]));
  const description = String(pickValue(row, ["Expenditure Location"]))
    .trim()
    .replace(/\s+/g, " ");
  const rawAmount = parseMoney(pickValue(row, ["Expenditure Amount"]));

  const accountNames = WIDE_FORMAT_ACCOUNT_COLUMNS.filter((name) => {
    const v = pickValue(row, [name]);
    return String(v).trim() !== "";
  });

  const type = Number.isNaN(rawAmount) ? "expense" : rawAmount < 0 ? "expense" : "income";
  const amount = Number.isNaN(rawAmount) ? Number.NaN : Math.abs(rawAmount);

  if (!accountNames.length) {
    return [
      {
        txn_date: txnDate,
        description,
        amount,
        type,
        cleared: false,
        is_one_time: true
      }
    ];
  }

  return accountNames.map((accountName) => ({
    txn_date: txnDate,
    description,
    amount,
    type,
    account_name: accountName,
    cleared: false,
    is_one_time: true
  }));
}

function normalizeImportRows(rows) {
  const normalized = [];
  for (const row of rows) {
    if (isWideImportRow(row)) {
      normalized.push(...expandWideImportRow(row));
      continue;
    }
    normalized.push(row);
  }
  return normalized;
}

function parseCsvImportRows(csvText) {
  const lines = csvText.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => {
    const normalized = normalizeKey(line);
    return (
      normalized.includes("date") &&
      normalized.includes("expenditurelocation") &&
      normalized.includes("expenditureamount")
    );
  });
  const source = headerIndex >= 0 ? lines.slice(headerIndex).join("\n") : csvText;
  if (headerIndex >= 0) {
    return parse(source, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true
    });
  }
  return parseCsv(source);
}

function parseXlsxImportRows(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];
  const sheet = workbook.Sheets[firstSheet];
  const rowsAsArrays = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: ""
  });

  if (!rowsAsArrays.length) return [];

  const headerIndex = rowsAsArrays.findIndex((row) => {
    const joined = row.map((v) => String(v || "")).join(",");
    const normalized = normalizeKey(joined);
    return (
      normalized.includes("date") &&
      normalized.includes("expenditurelocation") &&
      normalized.includes("expenditureamount")
    );
  });

  if (headerIndex < 0) {
    return XLSX.utils.sheet_to_json(sheet, { defval: "" });
  }

  const header = rowsAsArrays[headerIndex].map((v) => String(v || "").trim());
  const dataRows = rowsAsArrays.slice(headerIndex + 1);
  return dataRows.map((dataRow) => {
    const out = {};
    header.forEach((h, i) => {
      if (h) out[h] = dataRow[i] ?? "";
    });
    return out;
  });
}

async function resolveMasterId(table, row, idField, nameField) {
  if (row[idField]) return Number(row[idField]);
  const raw = row[nameField];
  if (!raw) return null;
  const name = String(raw).trim();
  if (!name) return null;

  const { rows } = await query(
    `INSERT INTO ${table}(name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [name]
  );
  return rows[0].id;
}

async function importTransactionRows(rows) {
  let inserted = 0;
  let failed = 0;

  for (const row of normalizeImportRows(rows)) {
    const txn_date = row.txn_date || row.date;
    const description = row.description || "";
    const amount = Number(row.amount);
    const type = (row.type || "expense").toLowerCase() === "income" ? "income" : "expense";
    const cleared = String(row.cleared || "false").toLowerCase() === "true";
    const is_one_time = String(row.is_one_time ?? "true").toLowerCase() !== "false";

    if (!txn_date || !description || Number.isNaN(amount) || amount < 0) {
      failed += 1;
      continue;
    }

    const account_id = await resolveMasterId("accounts", row, "account_id", "account_name");
    const category_id = await resolveMasterId("categories", row, "category_id", "category_name");

    await query(
      `INSERT INTO transactions
       (txn_date, description, amount, type, cleared, account_id, category_id, is_one_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [txn_date, description, amount, type, cleared, account_id, category_id, is_one_time]
    );
    inserted += 1;
  }

  return {
    inserted,
    failed,
    skipped: failed,
    total: rows.length
  };
}

export async function importTransactionsCsv(csvText) {
  const rows = parseCsvImportRows(csvText);
  return importTransactionRows(rows);
}

export async function importTransactionsXlsx(buffer) {
  const rows = parseXlsxImportRows(buffer);
  return importTransactionRows(rows);
}

async function listExportRows(from, to) {
  const params = [];
  const where = [];
  if (from) {
    params.push(from);
    where.push(`txn_date >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    where.push(`txn_date <= $${params.length}`);
  }

  const { rows } = await query(
    `SELECT id, txn_date, description, amount, type, cleared, is_one_time,
            account_id, category_id
     FROM transactions
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY txn_date DESC, id DESC`,
    params
  );
  return rows;
}

export async function exportTransactionsCsv(from, to) {
  const rows = await listExportRows(from, to);
  return toCsv(rows);
}

export async function exportTransactionsXlsx(from, to) {
  const rows = await listExportRows(from, to);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "transactions");
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
}

export async function clearAllData() {
  await query("BEGIN");
  try {
    await query(
      `
      TRUNCATE TABLE
        transactions,
        recurring_entries,
        budgets,
        accounts,
        categories
      RESTART IDENTITY CASCADE
      `
    );
    await query("COMMIT");
    return { ok: true };
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
}

export async function clearAllTransactions() {
  await query("BEGIN");
  try {
    await query("TRUNCATE TABLE transactions RESTART IDENTITY CASCADE");
    await query("COMMIT");
    return { ok: true };
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
}
