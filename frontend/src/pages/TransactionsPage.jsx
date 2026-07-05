import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { normalizeTransactionFilters, transactionsApi } from "../api/transactions";
import { recurringApi } from "../api/recurring";
import { modificationsApi } from "../api/modifications";
import { masterDataApi } from "../api/masterData";
import { useAccounts, useCategories } from "../hooks/useSharedQueries";
import SimpleCard from "../components/SimpleCard.jsx";
import ModificationForm from "../components/ModificationForm.jsx";
import { formatAmount, formatBalance } from "../utils/format.js";

function toIsoDate(value) {
  return value.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function getProjectedOccurrenceAnchor(row) {
  const id = String(row?.id || "");
  const match = id.match(/^projected-\d+-(\d{4}-\d{2}-\d{2})$/);
  return match ? match[1] : String(row?.txn_date || "").slice(0, 10);
}

const initialForm = {
  txn_date: new Date().toISOString().slice(0, 10),
  description: "",
  amount: "",
  type: "expense",
  cleared: false,
  account_id: "",
  category_id: "",
  from_account_id: "",
  to_account_id: "",
  is_one_time: true
};

const initialRecurringForm = {
  name: "",
  amount: "",
  type: "expense",
  cadence: "monthly",
  semi_month_day_1: "",
  semi_month_day_2: "",
  start_date: new Date().toISOString().slice(0, 10),
  account_id: "",
  category_id: "",
  active: true
};

export default function TransactionsPage() {
  const qc = useQueryClient();
  const ADD_CATEGORY_OPTION = "__add_new_category__";
  const [form, setForm] = useState(initialForm);
  const [recurringForm, setRecurringForm] = useState(initialRecurringForm);
  const [entryMode, setEntryMode] = useState("one-time");
  const [editingRows, setEditingRows] = useState({});
  const [modificationTarget, setModificationTarget] = useState(null);
  const [filters, setFilters] = useState(() => {
    const today = new Date();
    const threeMonthsOut = new Date(today);
    threeMonthsOut.setMonth(threeMonthsOut.getMonth() + 3); //3 months in the future
    return {
      from: toIsoDate(addDays(today, -60)),
      to: toIsoDate(threeMonthsOut),
      account_id: "",
      category_id: "",
      type: "",
      cleared: ""
    };
  });
  const [inputError, setInputError] = useState("");
  const [dateSort, setDateSort] = useState("desc");
  const [includeProjected, setIncludeProjected] = useState(true);
  const normalizedFilters = normalizeTransactionFilters(filters);
  const todayIso = toIsoDate(new Date());
  const shouldLoadProjected = includeProjected && Boolean(normalizedFilters.to && normalizedFilters.to > todayIso);
  const projectedFilters = useMemo(() => {
    if (!shouldLoadProjected) return normalizedFilters;
    const effectiveFrom = normalizedFilters.from && normalizedFilters.from > todayIso
      ? normalizedFilters.from
      : todayIso;
    return {
      ...normalizedFilters,
      from: effectiveFrom
    };
  }, [normalizedFilters, shouldLoadProjected, todayIso]);

  const refreshTransactionsQueries = () => {
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["transactions-projected"] });
    qc.invalidateQueries({ queryKey: ["transactions-balance"] });
    qc.invalidateQueries({ queryKey: ["transactions-balance-projected"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
  };

  const tx = useQuery({
    queryKey: ["transactions", normalizedFilters],
    queryFn: () => transactionsApi.list(normalizedFilters),
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 30
  });
  const projectedTx = useQuery({
    queryKey: ["transactions-projected", projectedFilters],
    queryFn: () => transactionsApi.projected(projectedFilters),
    enabled: shouldLoadProjected,
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 30
  });

  // Separate queries that ignore type/category/date filters — used only for running-balance computation
  // so the Account Balance column always reflects the true account state regardless of what's filtered.
  const balanceTxFilters = useMemo(() => ({
    account_id: filters.account_id || ""
  }), [filters.account_id]);
  const balanceTx = useQuery({
    queryKey: ["transactions-balance", balanceTxFilters],
    queryFn: () => transactionsApi.list(balanceTxFilters),
    staleTime: 1000 * 30
  });
  const balanceProjFilters = useMemo(() => ({
    from: todayIso,
    to: normalizedFilters.to && normalizedFilters.to > todayIso ? normalizedFilters.to : todayIso,
    account_id: filters.account_id || ""
  }), [todayIso, normalizedFilters.to, filters.account_id]);
  const balanceProjTx = useQuery({
    queryKey: ["transactions-balance-projected", balanceProjFilters],
    queryFn: () => transactionsApi.projected(balanceProjFilters),
    enabled: shouldLoadProjected,
    staleTime: 1000 * 30
  });
  const accounts = useAccounts();
  const categories = useCategories();

  const createM = useMutation({
    mutationFn: transactionsApi.create,
    onSuccess: () => {
      refreshTransactionsQueries();
    }
  });
  const updateM = useMutation({
    mutationFn: ({ id, payload }) => transactionsApi.update(id, payload),
    onSuccess: () => {
      refreshTransactionsQueries();
    }
  });
  const deleteM = useMutation({
    mutationFn: transactionsApi.remove,
    onSuccess: () => {
      refreshTransactionsQueries();
    }
  });
  const setClearedM = useMutation({
    mutationFn: ({ id, cleared }) => transactionsApi.setCleared(id, cleared),
    onSuccess: () => {
      refreshTransactionsQueries();
    }
  });
  const createRecurringM = useMutation({
    mutationFn: recurringApi.create,
    onSuccess: () => {
      refreshTransactionsQueries();
      qc.invalidateQueries({ queryKey: ["recurring"] });
      qc.invalidateQueries({ queryKey: ["upcoming"] });
      setRecurringForm((f) => ({ ...initialRecurringForm, start_date: f.start_date }));
    }
  });
  const addCategoryM = useMutation({
    mutationFn: masterDataApi.addCategory,
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      if (created?.id) {
        setForm((f) => ({ ...f, category_id: String(created.id) }));
      }
    }
  });
  const createModificationM = useMutation({
    mutationFn: (input) => {
      if (!modificationTarget?.recurring_rule_id) {
        throw new Error("No recurring entry found for this projected row.");
      }
      return modificationsApi.create(modificationTarget.recurring_rule_id, input);
    },
    onSuccess: () => {
      refreshTransactionsQueries();
      setModificationTarget(null);
    }
  });

  const accountsById = useMemo(() => {
    const map = new Map();
    for (const row of accounts.data || []) map.set(String(row.id), row.name);
    return map;
  }, [accounts.data]);

  const categoriesById = useMemo(() => {
    const map = new Map();
    for (const row of categories.data || []) map.set(String(row.id), row.name);
    return map;
  }, [categories.data]);

  const mergedTransactions = useMemo(() => {
    // ── display set (respects all filters) ──────────────────────────────────
    const base = (tx.data || []).map((row) => {
      // Real DB rows are never "projected" — only rows from the projection engine are.
      // is_projected on a real row only blocks clearing if the date is in the future.
      const isProjectedRecurring = Boolean(row.projected);
      const isFutureDate = String(row.txn_date).slice(0, 10) > todayIso;
      return { ...row, is_projected_recurring: isProjectedRecurring, is_projected: isProjectedRecurring || isFutureDate };
    });
    const projectedDisplay = shouldLoadProjected
      ? (projectedTx.data || []).map((row) => ({ ...row, is_projected_recurring: true, is_projected: true }))
      : [];
    const merged = [...base, ...projectedDisplay];

    // ── full unfiltered set for accurate balance computation ─────────────────
    const allReal = balanceTx.data || [];
    const allProjected = shouldLoadProjected ? (balanceProjTx.data || []) : [];
    const allForBalance = [...allReal, ...allProjected];
    allForBalance.sort((a, b) => {
      const d = String(a.txn_date).localeCompare(String(b.txn_date));
      return d !== 0 ? d : String(a.id).localeCompare(String(b.id));
    });

    // Running balance from opening_balance forward through ALL transactions
    const accountBalanceMap = new Map();
    const runningByAccount = new Map();
    for (const account of (accounts.data || [])) {
      runningByAccount.set(String(account.id), Number(account.opening_balance || 0));
    }
    for (const row of allForBalance) {
      if (!row.account_id) continue;
      const key = String(row.account_id);
      const prev = runningByAccount.get(key) ?? 0;
      const delta = row.type === "income" ? Number(row.amount || 0) : -Number(row.amount || 0);
      const next = prev + delta;
      runningByAccount.set(key, next);
      accountBalanceMap.set(String(row.id), next);
    }

    const withBalance = merged.map((row) => ({
      ...row,
      account_balance_as_of: row.account_id ? (accountBalanceMap.get(String(row.id)) ?? null) : null
    }));

    withBalance.sort((a, b) => {
      const d = dateSort === "asc"
        ? String(a.txn_date).localeCompare(String(b.txn_date))
        : String(b.txn_date).localeCompare(String(a.txn_date));
      if (d !== 0) return d;
      return dateSort === "asc"
        ? String(a.id).localeCompare(String(b.id))
        : String(b.id).localeCompare(String(a.id));
    });
    return withBalance;
  }, [tx.data, projectedTx.data, balanceTx.data, balanceProjTx.data, shouldLoadProjected, dateSort, todayIso, accounts.data]);

  function toPayload(input) {
    return {
      ...input,
      amount: Number(input.amount) || 0,
      account_id: input.account_id ? Number(input.account_id) : null,
      category_id: input.category_id ? Number(input.category_id) : null,
      from_account_id: input.from_account_id ? Number(input.from_account_id) : null,
      to_account_id: input.to_account_id ? Number(input.to_account_id) : null
    };
  }

  function parseNonNegativeAmount(raw) {
    const cleaned = String(raw || "").trim().replace(/[$,\s]/g, "");
    if (!cleaned) return { ok: false, error: "Amount is required." };
    if (cleaned.startsWith("-")) return { ok: false, error: "Amount cannot be negative." };
    if (!/^(\d+|\d+\.\d{1,2}|\.\d{1,2})$/.test(cleaned)) {
      return { ok: false, error: "Amount must be a valid non-negative number." };
    }
    const value = Number(cleaned);
    if (!Number.isFinite(value) || value < 0) {
      return { ok: false, error: "Amount must be a valid non-negative number." };
    }
    return { ok: true, value };
  }

  function onSubmit(e) {
    e.preventDefault();
    const parsed = parseNonNegativeAmount(form.amount);
    if (!parsed.ok) {
      setInputError(parsed.error);
      return;
    }

    if (form.type === "transfer") {
      if (!form.from_account_id || !form.to_account_id) {
        setInputError("Transfer requires both a source and destination account.");
        return;
      }
      if (String(form.from_account_id) === String(form.to_account_id)) {
        setInputError("Transfer source and destination accounts must be different.");
        return;
      }
    }

    setInputError("");
    createM.mutate(toPayload({
      ...form,
      description: form.type === "transfer" ? (form.description || "Transfer") : form.description,
      amount: parsed.value,
      is_one_time: true
    }));
    setForm((f) => ({ ...initialForm, txn_date: f.txn_date }));
  }

  function startEdit(row) {
    setEditingRows((prev) => ({
      ...prev,
      [row.id]: {
      txn_date: String(row.txn_date).slice(0, 10),
      description: row.description,
      amount: String(row.amount),
      type: row.type,
      cleared: Boolean(row.cleared),
      account_id: row.account_id ? String(row.account_id) : "",
      category_id: row.category_id ? String(row.category_id) : "",
      is_one_time: row.is_one_time !== false
      }
    }));
  }

  function updateEditingRow(id, key, value) {
    setEditingRows((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [key]: value
      }
    }));
  }

  function cancelEdit(id) {
    setEditingRows((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function getEffectiveTxnDate(row) {
    return String(editingRows[row.id]?.txn_date || row.txn_date).slice(0, 10);
  }

  function isRowProjected(row) {
    if (row.is_projected_recurring) return true;
    if (row.projected) return true;
    return getEffectiveTxnDate(row) > todayIso;
  }

  function isClearedToggleDisabled(row) {
    return row.is_projected_recurring || getEffectiveTxnDate(row) > todayIso;
  }

  function saveEdit(row) {
    const edit = editingRows[row.id];
    if (!edit) return;
    const parsed = parseNonNegativeAmount(edit.amount);
    if (!parsed.ok) {
      setInputError(parsed.error);
      return;
    }
    setInputError("");
    updateM.mutate({
      id: row.id,
      payload: toPayload({
        ...edit,
        amount: parsed.value,
        cleared: Boolean(edit.cleared),
        recurring_rule_id: row.recurring_rule_id || null
      })
    });
    cancelEdit(row.id);
  }

  function onRecurringSubmit(e) {
    e.preventDefault();
    createRecurringM.mutate({
      name: recurringForm.name,
      amount: Number(recurringForm.amount) || 0,
      type: recurringForm.type,
      cadence: recurringForm.cadence,
      semi_month_day_1: recurringForm.cadence === "semiweekly" ? Number(recurringForm.semi_month_day_1) : null,
      semi_month_day_2: recurringForm.cadence === "semiweekly" ? Number(recurringForm.semi_month_day_2) : null,
      start_date: recurringForm.start_date,
      end_date: null,
      account_id: recurringForm.account_id ? Number(recurringForm.account_id) : null,
      category_id: recurringForm.category_id ? Number(recurringForm.category_id) : null,
      active: Boolean(recurringForm.active)
    });
  }

  function onFormCategoryChange(value) {
    if (value !== ADD_CATEGORY_OPTION) {
      setForm((prev) => ({ ...prev, category_id: value }));
      return;
    }
    const categoryName = window.prompt("Enter a new category name");
    if (!categoryName || !categoryName.trim()) return;
    addCategoryM.mutate(categoryName.trim());
  }

  return (
    <>
    <SimpleCard title="Transactions">
      <h3 className="section-subtitle">Filter Transactions</h3>
      <div className="form-row">
        <input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
        <input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
        <label className="inline-filter">
          <span>Account</span>
          <select value={filters.account_id} onChange={(e) => setFilters((f) => ({ ...f, account_id: e.target.value }))}>
            <option value="">All accounts</option>
            {(accounts.data || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <select value={filters.category_id} onChange={(e) => setFilters((f) => ({ ...f, category_id: e.target.value }))}>
          <option value="">All categories</option>
          {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}>
          <option value="">All types</option>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
        <select value={filters.cleared} onChange={(e) => setFilters((f) => ({ ...f, cleared: e.target.value }))}>
          <option value="">Any cleared state</option>
          <option value="true">Cleared</option>
          <option value="false">Uncleared</option>
        </select>
        <label className="inline-filter">
          <span>Date sort</span>
          <select value={dateSort} onChange={(e) => setDateSort(e.target.value)}>
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={includeProjected}
            onChange={(e) => setIncludeProjected(e.target.checked)}
          />
          <span>Show projected recurring</span>
        </label>
      </div>

      <h3 className="section-subtitle">Add Entry</h3>
      <div className="form-row form-row-labeled">
        <label className="inline-filter">
          <span>Entry Type</span>
          <select value={entryMode} onChange={(e) => setEntryMode(e.target.value)}>
            <option value="one-time">One-time transaction</option>
            <option value="recurring">Recurring entry</option>
          </select>
        </label>
      </div>

      {entryMode === "one-time" ? (
        <form className="form-row" onSubmit={onSubmit}>
          <input type="date" value={form.txn_date} onChange={(e) => setForm({ ...form, txn_date: e.target.value })} />
          <input
            placeholder={form.type === "transfer" ? "Transfer note (optional)" : "Description"}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <input placeholder="Amount" type="text" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <select
            value={form.type}
            onChange={(e) => setForm((prev) => {
              const nextType = e.target.value;
              if (nextType === "transfer") {
                return { ...prev, type: nextType, account_id: "", category_id: "" };
              }
              return { ...prev, type: nextType, from_account_id: "", to_account_id: "" };
            })}
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
          </select>
          {form.type === "transfer" ? (
            <>
              <label className="inline-filter">
                <span>From account</span>
                <select value={form.from_account_id} onChange={(e) => setForm({ ...form, from_account_id: e.target.value })}>
                  <option value="">Select source account</option>
                  {(accounts.data || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
              <label className="inline-filter">
                <span>To account</span>
                <select value={form.to_account_id} onChange={(e) => setForm({ ...form, to_account_id: e.target.value })}>
                  <option value="">Select destination account</option>
                  {(accounts.data || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            </>
          ) : (
            <>
              <select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
                <option value="">No account</option>
                {(accounts.data || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select value={form.category_id} onChange={(e) => onFormCategoryChange(e.target.value)}>
                <option value="">No category</option>
                {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value={ADD_CATEGORY_OPTION}>+ Add new category...</option>
              </select>
            </>
          )}
          <button type="submit">Add Transaction</button>
        </form>
      ) : (
        <form className="form-row recurring-inline-form" onSubmit={onRecurringSubmit}>
          <input
            placeholder="Recurring name"
            value={recurringForm.name}
            onChange={(e) => setRecurringForm({ ...recurringForm, name: e.target.value })}
          />
          <input
            placeholder="Recurring amount"
            type="number"
            step="0.01"
            value={recurringForm.amount}
            onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })}
          />
          <select value={recurringForm.type} onChange={(e) => setRecurringForm({ ...recurringForm, type: e.target.value })}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <select value={recurringForm.cadence} onChange={(e) => setRecurringForm({ ...recurringForm, cadence: e.target.value })}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly (every other week)</option>
            <option value="semiweekly">Semiweekly (twice a month)</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          {recurringForm.cadence === "semiweekly" ? (
            <div className="semiweekly-inline-group">
              <label className="semiweekly-inline-field">
                <span>Day 1</span>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={recurringForm.semi_month_day_1}
                  onChange={(e) => setRecurringForm({ ...recurringForm, semi_month_day_1: e.target.value })}
                />
              </label>
              <label className="semiweekly-inline-field">
                <span>Day 2</span>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={recurringForm.semi_month_day_2}
                  onChange={(e) => setRecurringForm({ ...recurringForm, semi_month_day_2: e.target.value })}
                />
              </label>
            </div>
          ) : null}
          <label className="semiweekly-inline-field recurring-start-date-field">
            <span>{recurringForm.cadence === "semiweekly" ? "Start date (rule starts on/after)" : "Start date"}</span>
            <input
              type="date"
              value={recurringForm.start_date}
              onChange={(e) => setRecurringForm({ ...recurringForm, start_date: e.target.value })}
            />
          </label>
          <select value={recurringForm.account_id} onChange={(e) => setRecurringForm({ ...recurringForm, account_id: e.target.value })}>
            <option value="">No account</option>
            {(accounts.data || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={recurringForm.category_id} onChange={(e) => setRecurringForm({ ...recurringForm, category_id: e.target.value })}>
            <option value="">No category</option>
            {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="submit">Add Recurring</button>
        </form>
      )}

      <p className="status">Use Entry Type to switch between adding one-time transactions and recurring entries.</p>
      {inputError ? <p className="status status-error">{inputError}</p> : null}
      {createM.error || updateM.error || deleteM.error || setClearedM.error || createRecurringM.error ? (
        <p className="status status-error">Action failed. Please try again.</p>
      ) : null}
      {addCategoryM.error ? <p className="status status-error">Could not add category.</p> : null}

      {tx.isLoading || (shouldLoadProjected && projectedTx.isLoading) ? <p className="status">Loading transactions...</p> : null}
      {tx.isError || (shouldLoadProjected && projectedTx.isError) ? <p className="status status-error">Failed to load transactions.</p> : null}
      {!tx.isLoading && !(shouldLoadProjected && projectedTx.isLoading) && !tx.isError && !(shouldLoadProjected && projectedTx.isError) && mergedTransactions.length === 0 ? (
        <p className="status status-empty">No transactions found for the current filters.</p>
      ) : null}

      <div className="table-wrap transactions-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Description</th><th>Amount</th><th>Type</th><th>Account</th><th>Account Balance</th><th>Category</th><th>One-time</th><th>Cleared</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {mergedTransactions.map((t) => (
              <Fragment key={t.id}>
              <tr className={!t.is_projected_recurring && t.cleared ? "transaction-row-cleared" : undefined}>
                {editingRows[t.id] ? (
                  <>
                    <td>
                      <input
                        className="inline-edit-input"
                        type="date"
                        value={editingRows[t.id].txn_date}
                        onChange={(e) => updateEditingRow(t.id, "txn_date", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="inline-edit-input"
                        value={editingRows[t.id].description}
                        onChange={(e) => updateEditingRow(t.id, "description", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="inline-edit-input"
                        type="text"
                        inputMode="decimal"
                        value={editingRows[t.id].amount}
                        onChange={(e) => updateEditingRow(t.id, "amount", e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        className="inline-edit-input"
                        value={editingRows[t.id].type}
                        onChange={(e) => updateEditingRow(t.id, "type", e.target.value)}
                      >
                        <option value="expense">Expense</option>
                        <option value="income">Income</option>
                      </select>
                    </td>
                    <td>
                      <select
                        className="inline-edit-input"
                        value={editingRows[t.id].account_id}
                        onChange={(e) => updateEditingRow(t.id, "account_id", e.target.value)}
                      >
                        <option value="">No account</option>
                        {(accounts.data || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </td>
                    <td>
                      {t.account_id ? (
                        <span className={Number(t.account_balance_as_of || 0) < 0 ? "txn-balance-negative" : undefined}>
                          {formatBalance(t.account_balance_as_of)}
                        </span>
                      ) : "-"}
                    </td>
                    <td>
                      <select
                        className="inline-edit-input"
                        value={editingRows[t.id].category_id}
                        onChange={(e) => updateEditingRow(t.id, "category_id", e.target.value)}
                      >
                        <option value="">No category</option>
                        {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        className="inline-edit-input"
                        value={editingRows[t.id].is_one_time ? "true" : "false"}
                        onChange={(e) => updateEditingRow(t.id, "is_one_time", e.target.value === "true")}
                      >
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{String(t.txn_date).slice(0, 10)}</td>
                    <td>{t.description}</td>
                    <td>
                      <span className={t.type === "income" ? "txn-amount-income" : "txn-amount-expense"}>
                        {formatAmount(t.amount, t.type)}
                      </span>
                    </td>
                    <td>
                      {t.transfer_pair_id ? (
                        <span className="txn-type txn-type-transfer">transfer</span>
                      ) : (
                        <span className={t.type === "income" ? "txn-type txn-type-income" : "txn-type txn-type-expense"}>
                          {t.type}
                        </span>
                      )}
                    </td>
                    <td>{t.account_name || accountsById.get(String(t.account_id || "")) || "-"}</td>
                    <td>
                      {t.account_id ? (
                        <span className={Number(t.account_balance_as_of || 0) < 0 ? "txn-balance-negative" : undefined}>
                          {formatBalance(t.account_balance_as_of)}
                        </span>
                      ) : "-"}
                    </td>
                    <td>{t.category_name || categoriesById.get(String(t.category_id || "")) || "-"}</td>
                    <td>{t.is_one_time === false ? "No" : "Yes"}</td>
                  </>
                )}
                <td>
                  {t.is_projected_recurring ? (
                    <span className="status-chip status-chip-open">Projected</span>
                  ) : (
                    <span className="inline-actions">
                      <label className="inline-check">
                        <input
                          type="checkbox"
                          disabled={isClearedToggleDisabled(t)}
                          checked={editingRows[t.id] ? Boolean(editingRows[t.id].cleared) : Boolean(t.cleared)}
                          onChange={(e) => {
                            if (isClearedToggleDisabled(t)) return;
                            if (editingRows[t.id]) {
                              updateEditingRow(t.id, "cleared", e.target.checked);
                              return;
                            }
                            setClearedM.mutate({ id: t.id, cleared: e.target.checked });
                          }}
                        />
                        <span className={(editingRows[t.id] ? editingRows[t.id].cleared : t.cleared) ? "status-chip status-chip-cleared" : "status-chip status-chip-open"}>
                          {(editingRows[t.id] ? editingRows[t.id].cleared : t.cleared) ? "Cleared" : "Open"}
                        </span>
                      </label>
                      {isRowProjected(t) ? <span className="status-chip status-chip-open">Projected</span> : null}
                    </span>
                  )}
                </td>
                <td className="inline-actions">
                  {t.is_projected_recurring ? (
                    <button
                      type="button"
                      disabled={!t.recurring_rule_id}
                      onClick={() => {
                        setModificationTarget(
                          modificationTarget?.rowId === t.id ? null : {
                            rowId: t.id,
                            recurring_rule_id: t.recurring_rule_id,
                            txn_date: String(t.txn_date).slice(0, 10),
                            occurrence_anchor_date: getProjectedOccurrenceAnchor(t),
                            description: t.description,
                            amount: Number(t.amount || 0)
                          }
                        );
                      }}
                    >
                      {modificationTarget?.rowId === t.id ? "Close" : "Modify"}
                    </button>
                  ) : editingRows[t.id] ? (
                    <>
                      <button type="button" onClick={() => saveEdit(t)}>Save</button>
                      <button type="button" onClick={() => cancelEdit(t.id)}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => startEdit(t)}>Edit</button>
                  )}
                  {t.is_projected_recurring ? null : (
                    <button
                      type="button"
                      className="danger"
                      disabled={Boolean(t.cleared)}
                      title={t.cleared ? "Cannot delete a cleared transaction" : ""}
                      onClick={() => {
                        const msg = t.transfer_pair_id
                          ? "Delete both sides of this transfer? This cannot be undone."
                          : "Delete this transaction? This action cannot be undone.";
                        if (window.confirm(msg)) {
                          deleteM.mutate(t.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
              {modificationTarget?.rowId === t.id ? (
                <tr>
                  <td colSpan={10} className="modification-inline-td">
                    <div className="modification-inline-container">
                      <p className="status modification-inline-context">
                        Modifying: <strong>{modificationTarget.txn_date}</strong> — {modificationTarget.description} ({formatAmount(modificationTarget.amount, "expense")})
                      </p>
                      <ModificationForm
                        accounts={accounts.data || []}
                        categories={categories.data || []}
                        defaultStartDate={modificationTarget.occurrence_anchor_date || modificationTarget.txn_date}
                        isLoading={createModificationM.isPending}
                        onSave={(input) => createModificationM.mutate(input)}
                        onCancel={() => setModificationTarget(null)}
                      />
                      {createModificationM.error && (
                        <p className="status status-error">Error: {createModificationM.error.message}</p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="transaction-cards">
        {mergedTransactions.map((t) => (
          <div key={`card-${t.id}`} className={`transaction-card ${!t.is_projected_recurring && t.cleared ? "transaction-card-cleared" : ""}`}>
            <div className="transaction-card-top">
              <span className="transaction-card-date">{String(t.txn_date).slice(0, 10)}</span>
              <span className={t.type === "income" ? "txn-type txn-type-income" : "txn-type txn-type-expense"}>{t.type}</span>
            </div>
            <div className="transaction-card-desc">{t.description}</div>
            <div className="transaction-card-row">
              <span>Amount</span>
              <span className={t.type === "income" ? "txn-amount-income" : "txn-amount-expense"}>{formatAmount(t.amount, t.type)}</span>
            </div>
            <div className="transaction-card-row">
              <span>Account</span>
              <span>{t.account_name || accountsById.get(String(t.account_id || "")) || "-"}</span>
            </div>
            <div className="transaction-card-row">
              <span>Account Balance</span>
              <span className={t.account_id && Number(t.account_balance_as_of || 0) < 0 ? "txn-balance-negative" : undefined}>
                {t.account_id ? formatBalance(t.account_balance_as_of) : "-"}
              </span>
            </div>
            <div className="transaction-card-row">
              <span>Category</span>
              <span>{t.category_name || categoriesById.get(String(t.category_id || "")) || "-"}</span>
            </div>
            <div className="transaction-card-row">
              <span>Status</span>
              <span className="inline-actions">
                {t.is_projected_recurring ? (
                  <span className="status-chip status-chip-open">Projected</span>
                ) : (
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      disabled={isClearedToggleDisabled(t)}
                      checked={Boolean(t.cleared)}
                      onChange={(e) => {
                        if (isClearedToggleDisabled(t)) return;
                        setClearedM.mutate({ id: t.id, cleared: e.target.checked });
                      }}
                    />
                    <span className={t.cleared ? "status-chip status-chip-cleared" : "status-chip status-chip-open"}>
                      {t.cleared ? "Cleared" : "Open"}
                    </span>
                  </label>
                )}
                {isRowProjected(t) && !t.is_projected_recurring ? <span className="status-chip status-chip-open">Projected</span> : null}
              </span>
            </div>
            <div className="transaction-card-actions">
              {t.is_projected_recurring ? (
                <button
                  type="button"
                  disabled={!t.recurring_rule_id}
                  onClick={() => {
                    setModificationTarget(
                      modificationTarget?.rowId === t.id ? null : {
                        rowId: t.id,
                        recurring_rule_id: t.recurring_rule_id,
                        txn_date: String(t.txn_date).slice(0, 10),
                        occurrence_anchor_date: getProjectedOccurrenceAnchor(t),
                        description: t.description,
                        amount: Number(t.amount || 0)
                      }
                    );
                  }}
                >
                  {modificationTarget?.rowId === t.id ? "Close" : "Modify"}
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => startEdit(t)}>Edit</button>
                  <button
                    type="button"
                    className="danger"
                    disabled={Boolean(t.cleared)}
                    title={t.cleared ? "Cannot delete a cleared transaction" : ""}
                    onClick={() => {
                      const msg = t.transfer_pair_id
                        ? "Delete both sides of this transfer? This cannot be undone."
                        : "Delete this transaction? This action cannot be undone.";
                      if (window.confirm(msg)) {
                        deleteM.mutate(t.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
            {modificationTarget?.rowId === t.id ? (
              <div className="modification-inline-container">
                <p className="status modification-inline-context">
                  Modifying: <strong>{modificationTarget.txn_date}</strong> — {modificationTarget.description}
                </p>
                <ModificationForm
                  accounts={accounts.data || []}
                  categories={categories.data || []}
                  defaultStartDate={modificationTarget.occurrence_anchor_date || modificationTarget.txn_date}
                  isLoading={createModificationM.isPending}
                  onSave={(input) => createModificationM.mutate(input)}
                  onCancel={() => setModificationTarget(null)}
                />
                {createModificationM.error && (
                  <p className="status status-error">Error: {createModificationM.error.message}</p>
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </SimpleCard>
    </>
  );
}
