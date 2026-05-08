import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { budgetsApi } from "../api/budgets";
import { useCategories } from "../hooks/useSharedQueries";
import SimpleCard from "../components/SimpleCard.jsx";

const now = new Date();

export default function BudgetsPage() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    category_id: "",
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
    amount: ""
  });
  const [editForm, setEditForm] = useState({
    category_id: "",
    month: "",
    year: "",
    amount: ""
  });
  const [alertPeriod, setAlertPeriod] = useState({
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear())
  });

  const budgets = useQuery({ queryKey: ["budgets"], queryFn: budgetsApi.list });
  const categories = useCategories();
  const alerts = useQuery({
    queryKey: ["alerts", alertPeriod.month, alertPeriod.year],
    queryFn: () => budgetsApi.alerts({ month: alertPeriod.month, year: alertPeriod.year }),
    staleTime: 1000 * 60
  });

  const createM = useMutation({
    mutationFn: budgetsApi.create,
    onSuccess: (_, payload) => {
      qc.invalidateQueries({ queryKey: ["budgets"] });
      qc.invalidateQueries({
        queryKey: ["alerts", String(payload.month), String(payload.year)],
        exact: true
      });
    }
  });
  const updateM = useMutation({
    mutationFn: ({ id, payload }) => budgetsApi.update(id, payload),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["budgets"] });
      qc.invalidateQueries({
        queryKey: ["alerts", String(variables.payload.month), String(variables.payload.year)],
        exact: true
      });
    }
  });
  const deleteM = useMutation({
    mutationFn: budgetsApi.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgets"] });
      qc.invalidateQueries({
        queryKey: ["alerts", alertPeriod.month, alertPeriod.year],
        exact: true
      });
    }
  });

  function toPayload(input) {
    return {
      category_id: input.category_id ? Number(input.category_id) : null,
      month: Number(input.month),
      year: Number(input.year),
      amount: Number(input.amount) || 0
    };
  }

  function onCreate(e) {
    e.preventDefault();
    createM.mutate(toPayload(form));
    setForm((f) => ({ ...f, amount: "" }));
  }

  function startEdit(row) {
    setEditingId(row.id);
    setEditForm({
      category_id: row.category_id ? String(row.category_id) : "",
      month: String(row.month),
      year: String(row.year),
      amount: String(row.amount)
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ category_id: "", month: "", year: "", amount: "" });
  }

  function saveEdit(id) {
    updateM.mutate({ id, payload: toPayload(editForm) });
    cancelEdit();
  }

  return (
    <div className="grid">
      <SimpleCard title="Budgets">
        <form className="form-row" onSubmit={onCreate}>
          <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
            <option value="">General budget</option>
            {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="number" min="1" max="12" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} />
          <input type="number" min="2000" max="3000" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
          <input placeholder="Limit amount" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <button type="submit">Add</button>
        </form>

        {budgets.isLoading ? <p className="status">Loading budgets...</p> : null}
        {budgets.isError ? <p className="status status-error">Failed to load budgets.</p> : null}
        {createM.error || updateM.error || deleteM.error ? <p className="status status-error">Could not save budget.</p> : null}
        {!budgets.isLoading && !budgets.isError && (budgets.data || []).length === 0 ? (
          <p className="status status-empty">No budgets created yet.</p>
        ) : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Month</th>
                <th>Year</th>
                <th>Amount</th>
                <th className="actions-cell">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(budgets.data || []).map((b) => {
                const isEditing = editingId === b.id;
                return (
                  <tr key={b.id}>
                    <td>
                      {isEditing ? (
                        <select value={editForm.category_id} onChange={(e) => setEditForm({ ...editForm, category_id: e.target.value })}>
                          <option value="">General budget</option>
                          {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      ) : (b.category_name || "General")}
                    </td>
                    <td>
                      {isEditing ? (
                        <input type="number" min="1" max="12" value={editForm.month} onChange={(e) => setEditForm({ ...editForm, month: e.target.value })} />
                      ) : b.month}
                    </td>
                    <td>
                      {isEditing ? (
                        <input type="number" min="2000" max="3000" value={editForm.year} onChange={(e) => setEditForm({ ...editForm, year: e.target.value })} />
                      ) : b.year}
                    </td>
                    <td>
                      {isEditing ? (
                        <input type="number" step="0.01" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} />
                      ) : Number(b.amount).toFixed(2)}
                    </td>
                    <td className="actions-cell">
                      <span className="inline-actions right-actions">
                        {isEditing ? (
                          <>
                            <button type="button" onClick={() => saveEdit(b.id)}>Save</button>
                            <button type="button" onClick={cancelEdit}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => startEdit(b)}>Edit</button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => {
                                if (window.confirm("Delete this budget?")) {
                                  deleteM.mutate(b.id);
                                }
                              }}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SimpleCard>
      <SimpleCard title="Alerts">
        <div className="form-row">
          <input type="number" min="1" max="12" value={alertPeriod.month} onChange={(e) => setAlertPeriod({ ...alertPeriod, month: e.target.value })} />
          <input type="number" min="2000" max="3000" value={alertPeriod.year} onChange={(e) => setAlertPeriod({ ...alertPeriod, year: e.target.value })} />
        </div>
        {alerts.isLoading ? <p className="status">Loading alerts...</p> : null}
        {alerts.isError ? <p className="status status-error">Failed to load alerts.</p> : null}
        {!alerts.isLoading && !alerts.isError && (alerts.data || []).length === 0 ? (
          <p className="status status-empty">No budget alerts for this month.</p>
        ) : null}
        <ul>
          {(alerts.data || []).map((a) => (
            <li key={a.budget_id}>
              {a.category_name || "General"} - spent {Number(a.spent || 0).toFixed(2)} / {a.budget_amount}
              ({Number(a.pct_used || 0).toFixed(1)}%)
              {a.alert ? " ALERT" : ""}
              {a.over_budget ? " OVER BUDGET" : ""}
            </li>
          ))}
        </ul>
      </SimpleCard>
    </div>
  );
}
