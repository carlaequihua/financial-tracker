import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { normalizeTransactionFilters, transactionsApi } from "../api/transactions";
import { recurringApi } from "../api/recurring";
import { useAccounts, useCategories } from "../hooks/useSharedQueries";
import SimpleCard from "../components/SimpleCard.jsx";

const initialForm = {
  txn_date: new Date().toISOString().slice(0, 10),
  description: "",
  amount: "",
  type: "expense",
  cleared: false,
  account_id: "",
  category_id: "",
  is_one_time: true
};

const initialRecurringForm = {
  name: "",
  amount: "",
  type: "expense",
  cadence: "monthly",
  start_date: new Date().toISOString().slice(0, 10),
  account_id: "",
  category_id: "",
  active: true
};

export default function TransactionsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState(initialForm);
  const [recurringForm, setRecurringForm] = useState(initialRecurringForm);
  const [entryMode, setEntryMode] = useState("one-time");
  const [editingRows, setEditingRows] = useState({});
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    account_id: "",
    category_id: "",
    type: "",
    cleared: ""
  });
  const normalizedFilters = normalizeTransactionFilters(filters);

  const tx = useQuery({
    queryKey: ["transactions", normalizedFilters],
    queryFn: () => transactionsApi.list(normalizedFilters),
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 30
  });
  const accounts = useAccounts();
  const categories = useCategories();

  const createM = useMutation({
    mutationFn: transactionsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions", normalizedFilters], exact: true });
      qc.invalidateQueries({ queryKey: ["transactions"], exact: true });
    }
  });
  const updateM = useMutation({
    mutationFn: ({ id, payload }) => transactionsApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions", normalizedFilters], exact: true });
      qc.invalidateQueries({ queryKey: ["transactions"], exact: true });
    }
  });
  const deleteM = useMutation({
    mutationFn: transactionsApi.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions", normalizedFilters], exact: true });
      qc.invalidateQueries({ queryKey: ["transactions"], exact: true });
    }
  });
  const setClearedM = useMutation({
    mutationFn: ({ id, cleared }) => transactionsApi.setCleared(id, cleared),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions", normalizedFilters], exact: true });
      qc.invalidateQueries({ queryKey: ["transactions"], exact: true });
    }
  });
  const createRecurringM = useMutation({
    mutationFn: recurringApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring"] });
      qc.invalidateQueries({ queryKey: ["upcoming"] });
      setRecurringForm((f) => ({ ...initialRecurringForm, start_date: f.start_date }));
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

  function toPayload(input) {
    return {
      ...input,
      amount: Number(input.amount) || 0,
      account_id: input.account_id ? Number(input.account_id) : null,
      category_id: input.category_id ? Number(input.category_id) : null
    };
  }

  function onSubmit(e) {
    e.preventDefault();
    createM.mutate(toPayload({ ...form, is_one_time: true }));
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

  function saveEdit(row) {
    const edit = editingRows[row.id];
    if (!edit) return;
    updateM.mutate({
      id: row.id,
      payload: toPayload({
        ...edit,
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
      start_date: recurringForm.start_date,
      end_date: null,
      account_id: recurringForm.account_id ? Number(recurringForm.account_id) : null,
      category_id: recurringForm.category_id ? Number(recurringForm.category_id) : null,
      active: Boolean(recurringForm.active)
    });
  }

  return (
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
          <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <input placeholder="Amount" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
            <option value="">No account</option>
            {(accounts.data || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
            <option value="">No category</option>
            {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
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
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          <input
            type="date"
            value={recurringForm.start_date}
            onChange={(e) => setRecurringForm({ ...recurringForm, start_date: e.target.value })}
          />
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
      {createM.error || updateM.error || deleteM.error || setClearedM.error || createRecurringM.error ? (
        <p className="status status-error">Action failed. Please try again.</p>
      ) : null}

      {tx.isLoading ? <p className="status">Loading transactions...</p> : null}
      {tx.isError ? <p className="status status-error">Failed to load transactions.</p> : null}
      {!tx.isLoading && !tx.isError && (tx.data || []).length === 0 ? (
        <p className="status status-empty">No transactions found for the current filters.</p>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Description</th><th>Amount</th><th>Type</th><th>Account</th><th>Account Total</th><th>Category</th><th>One-time</th><th>Cleared</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(tx.data || []).map((t) => (
              <tr key={t.id} className={t.cleared ? "transaction-row-cleared" : undefined}>
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
                        type="number"
                        step="0.01"
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
                    <td>{t.account_id ? Number(t.account_total_as_of || 0).toFixed(2) : "-"}</td>
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
                        {t.amount}
                      </span>
                    </td>
                    <td>
                      <span className={t.type === "income" ? "txn-type txn-type-income" : "txn-type txn-type-expense"}>
                        {t.type}
                      </span>
                    </td>
                    <td>{t.account_name || accountsById.get(String(t.account_id || "")) || "-"}</td>
                    <td>{t.account_id ? Number(t.account_total_as_of || 0).toFixed(2) : "-"}</td>
                    <td>{t.category_name || categoriesById.get(String(t.category_id || "")) || "-"}</td>
                    <td>{t.is_one_time === false ? "No" : "Yes"}</td>
                  </>
                )}
                <td>
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={editingRows[t.id] ? Boolean(editingRows[t.id].cleared) : Boolean(t.cleared)}
                      onChange={(e) => {
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
                </td>
                <td className="inline-actions">
                  {editingRows[t.id] ? (
                    <>
                      <button type="button" onClick={() => saveEdit(t)}>Save</button>
                      <button type="button" onClick={() => cancelEdit(t.id)}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => startEdit(t)}>Edit</button>
                  )}
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      if (window.confirm("Delete this transaction? This action cannot be undone.")) {
                        deleteM.mutate(t.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SimpleCard>
  );
}
