import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { recurringApi } from "../api/recurring";
import { modificationsApi } from "../api/modifications";
import { useAccounts, useCategories } from "../hooks/useSharedQueries";
import SimpleCard from "../components/SimpleCard.jsx";
import ModificationForm from "../components/ModificationForm.jsx";

const initialForm = {
  name: "",
  amount: "",
  has_future_amount: false,
  future_amount: "",
  future_amount_start_date: "",
  type: "expense",
  cadence: "monthly",
  semi_month_day_1: "",
  semi_month_day_2: "",
  start_date: new Date().toISOString().slice(0, 10),
  has_end_date: false,
  end_date: "",
  account_id: "",
  category_id: "",
  active: true
};

export default function RecurringPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [showModificationForm, setShowModificationForm] = useState(false);
  const recurring = useQuery({ queryKey: ["recurring"], queryFn: recurringApi.list });
  const upcomingDays = 30;
  const upcoming = useQuery({
    queryKey: ["upcoming", upcomingDays],
    queryFn: () => recurringApi.upcoming(upcomingDays),
    staleTime: 1000 * 60
  });
  const accounts = useAccounts();
  const categories = useCategories();

  const updateM = useMutation({
    mutationFn: ({ id, payload }) => recurringApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring"] });
      qc.invalidateQueries({ queryKey: ["upcoming"] });
    }
  });
  const deleteM = useMutation({
    mutationFn: recurringApi.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring"] });
      qc.invalidateQueries({ queryKey: ["upcoming"] });
    }
  });
  const createModificationM = useMutation({
    mutationFn: (input) => modificationsApi.create(editingId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions-projected"] });
      qc.invalidateQueries({ queryKey: ["upcoming"] });
      setShowModificationForm(false);
    }
  });

  function toPayload(input) {
    return {
      name: input.name,
      amount: Number(input.amount) || 0,
      future_amount: input.has_future_amount ? (Number(input.future_amount) || 0) : null,
      future_amount_start_date: input.has_future_amount ? (input.future_amount_start_date || null) : null,
      type: input.type,
      cadence: input.cadence,
      semi_month_day_1: input.cadence === "semiweekly" ? Number(input.semi_month_day_1) : null,
      semi_month_day_2: input.cadence === "semiweekly" ? Number(input.semi_month_day_2) : null,
      start_date: input.start_date,
      end_date: input.has_end_date ? (input.end_date || null) : null,
      account_id: input.account_id ? Number(input.account_id) : null,
      category_id: input.category_id ? Number(input.category_id) : null,
      active: Boolean(input.active)
    };
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!editingId) return;
    updateM.mutate({ id: editingId, payload: toPayload(form) });
    setEditingId(null);
    setForm(initialForm);
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      amount: String(row.amount),
      has_future_amount: Boolean(row.future_amount_start_date),
      future_amount: row.future_amount !== null && row.future_amount !== undefined ? String(row.future_amount) : "",
      future_amount_start_date: row.future_amount_start_date ? String(row.future_amount_start_date).slice(0, 10) : "",
      type: row.type,
      cadence: row.cadence,
      semi_month_day_1: row.semi_month_day_1 ? String(row.semi_month_day_1) : "",
      semi_month_day_2: row.semi_month_day_2 ? String(row.semi_month_day_2) : "",
      start_date: String(row.start_date).slice(0, 10),
      has_end_date: Boolean(row.end_date),
      end_date: row.end_date ? String(row.end_date).slice(0, 10) : "",
      account_id: row.account_id ? String(row.account_id) : "",
      category_id: row.category_id ? String(row.category_id) : "",
      active: row.active !== false
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(initialForm);
  }

  return (
    <div className="grid recurring-page-grid">
      <div className="recurring-main-card">
      <SimpleCard title="Recurring Entries">
        {recurring.isLoading ? <p className="status">Loading recurring entries...</p> : null}
        {recurring.isError ? <p className="status status-error">Failed to load recurring entries.</p> : null}
        {updateM.error || deleteM.error ? <p className="status status-error">Could not save recurring changes.</p> : null}
        {!recurring.isLoading && !recurring.isError && (recurring.data || []).length === 0 ? (
          <p className="status status-empty">No recurring entries yet.</p>
        ) : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Amount</th>
                <th>Type</th>
                <th>Account</th>
                <th>Cadence</th>
                <th>Start</th>
                <th>End</th>
                <th>Future Change</th>
                <th className="actions-cell">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(recurring.data || []).map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{Number(r.amount).toFixed(2)}</td>
                  <td>
                    <span className={r.type === "income" ? "txn-type txn-type-income" : "txn-type txn-type-expense"}>
                      {r.type}
                    </span>
                  </td>
                  <td>{r.account_name || "-"}</td>
                  <td>{r.cadence}</td>
                  <td>{String(r.start_date).slice(0, 10)}</td>
                  <td>{r.end_date ? String(r.end_date).slice(0, 10) : "Never"}</td>
                  <td>
                    {r.future_amount_start_date
                      ? `${Number(r.future_amount || 0).toFixed(2)} from ${String(r.future_amount_start_date).slice(0, 10)}`
                      : "None"}
                  </td>
                  <td className="actions-cell">
                    <span className="inline-actions right-actions">
                      <button type="button" onClick={() => startEdit(r)}>Edit</button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          if (window.confirm("Delete this recurring entry?")) {
                            deleteM.mutate(r.id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {editingId ? (
          <>
          <form className="form-grid recurring-edit-form" onSubmit={onSubmit}>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" />
            <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Current amount" />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <select value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value })}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly (every other week)</option>
              <option value="semiweekly">Semiweekly (twice a month)</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
            {form.cadence === "semiweekly" ? (
              <>
                <input
                  type="number"
                  min="1"
                  max="31"
                  placeholder="First day (1-31)"
                  value={form.semi_month_day_1}
                  onChange={(e) => setForm({ ...form, semi_month_day_1: e.target.value })}
                />
                <input
                  type="number"
                  min="1"
                  max="31"
                  placeholder="Second day (1-31)"
                  value={form.semi_month_day_2}
                  onChange={(e) => setForm({ ...form, semi_month_day_2: e.target.value })}
                />
              </>
            ) : null}
            <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.has_end_date}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setForm({ ...form, has_end_date: checked, end_date: checked ? form.end_date : "" });
                }}
              />
              Has end date
            </label>
            {form.has_end_date ? (
              <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            ) : null}
            <select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              <option value="">No account</option>
              {(accounts.data || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">No category</option>
              {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.has_future_amount}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setForm({
                    ...form,
                    has_future_amount: checked,
                    future_amount: checked ? form.future_amount : "",
                    future_amount_start_date: checked ? form.future_amount_start_date : ""
                  });
                }}
              />
              Schedule future amount change
            </label>
            {form.has_future_amount ? (
              <>
                <input
                  type="number"
                  step="0.01"
                  value={form.future_amount}
                  onChange={(e) => setForm({ ...form, future_amount: e.target.value })}
                  placeholder="Future amount"
                />
                <input
                  type="date"
                  value={form.future_amount_start_date}
                  onChange={(e) => setForm({ ...form, future_amount_start_date: e.target.value })}
                />
              </>
            ) : null}
            <label className="checkbox-row">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Active
            </label>
            <span className="inline-actions right-actions">
              <button type="submit">Save</button>
              <button type="button" onClick={cancelEdit}>Cancel</button>
            </span>
          </form>
          
          <div className="modifications-section">
            <h4>Modify This Recurring Entry</h4>
            <p className="status">Override specific occurrences, future dates, or date ranges:</p>
            
            {showModificationForm ? (
              <div className="modification-form-container">
                <ModificationForm
                  recurringRule={{ id: editingId }}
                  accounts={accounts.data || []}
                  categories={categories.data || []}
                  isLoading={createModificationM.isPending}
                  onSave={(input) => createModificationM.mutate(input)}
                  onCancel={() => setShowModificationForm(false)}
                />
                {createModificationM.error && (
                  <p className="status status-error">Error creating modification: {createModificationM.error.message}</p>
                )}
              </div>
            ) : (
              <button type="button" onClick={() => setShowModificationForm(true)}>+ Add Modification</button>
            )}
          </div>
          </>
        ) : null}

        <h3 className="section-subtitle">Upcoming Expenses (30 days)</h3>
        {upcoming.isLoading ? <p className="status">Loading upcoming expenses...</p> : null}
        {upcoming.isError ? <p className="status status-error">Failed to load upcoming expenses.</p> : null}
        {!upcoming.isLoading && !upcoming.isError && (upcoming.data || []).length === 0 ? (
          <p className="status status-empty">No upcoming expenses in the next 30 days.</p>
        ) : null}
        {!upcoming.isLoading && !upcoming.isError && (upcoming.data || []).length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Amount</th>
                  <th>Due Date</th>
                  <th>Cadence</th>
                </tr>
              </thead>
              <tbody>
                {(upcoming.data || []).map((r) => (
                  <tr key={r.id}>
                    <td>{r.description || r.name}</td>
                    <td>{Number(r.amount || 0).toFixed(2)}</td>
                    <td>{String(r.next_due_date || r.txn_date || r.start_date).slice(0, 10)}</td>
                    <td>{r.cadence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </SimpleCard>
      </div>
    </div>
  );
}
