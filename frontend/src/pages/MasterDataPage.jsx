import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { masterDataApi } from "../api/masterData";
import SimpleCard from "../components/SimpleCard.jsx";

export default function MasterDataPage() {
  const qc = useQueryClient();
  const [accountName, setAccountName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [editingAccountName, setEditingAccountName] = useState("");
  const [editingAccountBalance, setEditingAccountBalance] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [monthOffset, setMonthOffset] = useState(0);
  const [dragAccountId, setDragAccountId] = useState(null);
  const [dragOverAccountId, setDragOverAccountId] = useState(null);

  const summary = useQuery({ queryKey: ["summary"], queryFn: masterDataApi.summary });

  const accounts = useMemo(() => summary.data?.accounts || [], [summary.data]);
  const categories = useMemo(() => summary.data?.categories || [], [summary.data]);
  const monthlyTotals = useMemo(() => summary.data?.monthlyTotals || [], [summary.data]);

  const addAccount = useMutation({
    mutationFn: masterDataApi.addAccount,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  const updateAccount = useMutation({
    mutationFn: ({ id, payload }) => masterDataApi.updateAccount(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  const removeAccount = useMutation({
    mutationFn: masterDataApi.deleteAccount,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  const reorderAccount = useMutation({
    mutationFn: ({ id, direction }) => masterDataApi.reorderAccount(id, direction),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    }
  });

  const reorderAccounts = useMutation({
    mutationFn: ({ accountIds }) => masterDataApi.reorderAccounts(accountIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    }
  });

  const addCategory = useMutation({
    mutationFn: masterDataApi.addCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  const updateCategory = useMutation({
    mutationFn: ({ id, name }) => masterDataApi.updateCategory(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  const removeCategory = useMutation({
    mutationFn: masterDataApi.deleteCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  const totalBalance = useMemo(() => {
    return accounts.reduce((sum, row) => sum + Number(row.balance || 0), 0);
  }, [accounts]);
  const isTotalNegative = totalBalance < 0;
  const maxMonthlyValue = useMemo(() => {
    let max = 0;
    for (const row of monthlyTotals) {
      max = Math.max(max, Number(row.income || 0), Number(row.spent || 0));
    }
    return max || 1;
  }, [monthlyTotals]);
  const monthlyWindow = useMemo(() => {
    const total = monthlyTotals.length;
    const end = Math.max(0, total - monthOffset * 5);
    const start = Math.max(0, end - 5);
    return monthlyTotals.slice(start, end);
  }, [monthlyTotals, monthOffset]);
  const hasOlderMonths = monthlyTotals.length - monthOffset * 5 > 5;
  const hasNewerMonths = monthOffset > 0;

  function startAccountEdit(row) {
    setEditingAccountId(row.id);
    setEditingAccountName(row.name || "");
    setEditingAccountBalance(String(Number(row.balance || 0).toFixed(2)));
  }

  function startCategoryEdit(row) {
    setEditingCategoryId(row.id);
    setEditingCategoryName(row.name || "");
  }

  function saveAccountEdit() {
    if (!editingAccountId || !editingAccountName.trim()) return;
    updateAccount.mutate({
      id: editingAccountId,
      payload: {
        name: editingAccountName.trim(),
        balance: Number(editingAccountBalance || 0)
      }
    });
    setEditingAccountId(null);
    setEditingAccountName("");
    setEditingAccountBalance("");
  }

  function saveCategoryEdit() {
    if (!editingCategoryId || !editingCategoryName.trim()) return;
    updateCategory.mutate({ id: editingCategoryId, name: editingCategoryName.trim() });
    setEditingCategoryId(null);
    setEditingCategoryName("");
  }

  function moveAccountToPosition(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    const currentIds = accounts.map((a) => Number(a.id));
    const fromIndex = currentIds.indexOf(Number(fromId));
    const toIndex = currentIds.indexOf(Number(toId));
    if (fromIndex < 0 || toIndex < 0) return;
    const nextIds = [...currentIds];
    const [moved] = nextIds.splice(fromIndex, 1);
    nextIds.splice(toIndex, 0, moved);
    reorderAccounts.mutate({ accountIds: nextIds });
  }

  return (
    <div className="grid">
      <SimpleCard title="Summary">
        {summary.isLoading ? <p className="status">Loading summary...</p> : null}
        {summary.isError ? <p className="status status-error">Could not load summary.</p> : null}
        {!summary.isLoading && !summary.isError ? (
          <>
            <div className="summary-metrics">
              <div className="metric-card">
                <span className="metric-label">Total Accounts</span>
                <strong className="metric-value">{accounts.length}</strong>
              </div>
              <div className="metric-card">
                <span className="metric-label">Total Categories</span>
                <strong className="metric-value">{categories.length}</strong>
              </div>
              <div className={`metric-card ${isTotalNegative ? "metric-card-negative" : "metric-card-positive"}`}>
                <span className="metric-label">Net Account Balance</span>
                <strong className="metric-value">{Number(totalBalance).toFixed(2)}</strong>
              </div>
            </div>
            <div className="monthly-bars-wrap">
              <h3 className="section-subtitle">Monthly Income vs Spent</h3>
              <div className="monthly-toolbar">
                <span className="monthly-bars-legend">
                  <span><i className="legend-swatch legend-income" /> Income</span>
                  <span><i className="legend-swatch legend-spent" /> Spent</span>
                </span>
                <span className="inline-actions">
                  <button type="button" onClick={() => setMonthOffset((v) => v + 1)} disabled={!hasOlderMonths}>Older</button>
                  <button type="button" onClick={() => setMonthOffset((v) => Math.max(0, v - 1))} disabled={!hasNewerMonths}>Newer</button>
                </span>
              </div>
              {monthlyTotals.length === 0 ? (
                <p className="status status-empty">No monthly transaction data yet.</p>
              ) : (
                <div className="monthly-bars">
                  {monthlyWindow.map((row) => {
                    const income = Number(row.income || 0);
                    const spent = Number(row.spent || 0);
                    const net = income - spent;
                    const incomeHeight = `${Math.max(6, (income / maxMonthlyValue) * 100)}%`;
                    const spentHeight = `${Math.max(6, (spent / maxMonthlyValue) * 100)}%`;
                    return (
                      <div key={row.month} className="monthly-bar-group">
                        <div className="monthly-bar-pair">
                          <div className="monthly-bar monthly-bar-income" style={{ height: incomeHeight }} title={`Income ${income.toFixed(2)}`} />
                          <div className="monthly-bar monthly-bar-spent" style={{ height: spentHeight }} title={`Spent ${spent.toFixed(2)}`} />
                        </div>
                        <span className="monthly-bar-label">{row.month}</span>
                        <span className={`monthly-bar-net ${net < 0 ? "is-negative" : "is-positive"}`}>Net {net.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : null}
      </SimpleCard>

      <SimpleCard title="Accounts (with balance)">
        <div className="form-row">
          <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="New account" />
          <button onClick={() => { if (accountName.trim()) { addAccount.mutate(accountName.trim()); setAccountName(""); } }}>Add</button>
        </div>
        {addAccount.error || updateAccount.error || removeAccount.error || reorderAccount.error || reorderAccounts.error ? <p className="status status-error">Could not save account changes.</p> : null}
        {!summary.isLoading && !summary.isError && accounts.length === 0 ? <p className="status status-empty">No accounts yet.</p> : null}
        <p className="status">Drag and drop rows to reorder accounts.</p>
        <div className="summary-list">
          <div className="summary-list-header summary-list-header-accounts">
            <span>Account Name</span>
            <span>Balance</span>
            <span className="summary-row-actions">Actions</span>
          </div>
          {accounts.map((a) => (
            <div
              key={a.id}
              className={`summary-list-row summary-list-row-accounts ${editingAccountId === a.id ? "" : "summary-list-row-draggable"} ${dragOverAccountId === a.id ? "summary-list-row-drag-over" : ""}`}
              draggable={editingAccountId !== a.id}
              onDragStart={() => {
                if (editingAccountId !== a.id) {
                  setDragAccountId(a.id);
                }
              }}
              onDragOver={(e) => {
                if (editingAccountId !== a.id && dragAccountId && dragAccountId !== a.id) {
                  e.preventDefault();
                  setDragOverAccountId(a.id);
                }
              }}
              onDragLeave={() => {
                if (dragOverAccountId === a.id) {
                  setDragOverAccountId(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                moveAccountToPosition(dragAccountId, a.id);
                setDragAccountId(null);
                setDragOverAccountId(null);
              }}
              onDragEnd={() => {
                setDragAccountId(null);
                setDragOverAccountId(null);
              }}
            >
              {editingAccountId === a.id ? (
                <>
                  <input value={editingAccountName} onChange={(e) => setEditingAccountName(e.target.value)} />
                  <input
                    type="number"
                    step="0.01"
                    value={editingAccountBalance}
                    onChange={(e) => setEditingAccountBalance(e.target.value)}
                  />
                  <span className="summary-row-actions">
                    <button type="button" onClick={saveAccountEdit}>Save</button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAccountId(null);
                        setEditingAccountBalance("");
                      }}
                    >
                      Cancel
                    </button>
                  </span>
                </>
              ) : (
                <>
                  <span><strong className="drag-handle" aria-label={`Drag ${a.name}`}>↕</strong> {a.name}</span>
                  <span>{Number(a.balance || 0).toFixed(2)}</span>
                  <span className="summary-row-actions">
                    <button type="button" onClick={() => startAccountEdit(a)}>Edit</button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        if (window.confirm("Delete this account? Linked transactions will keep data but lose the account assignment.")) {
                          removeAccount.mutate(a.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      </SimpleCard>

      <SimpleCard title="Categories">
        <div className="form-row">
          <input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="New category" />
          <button onClick={() => { if (categoryName.trim()) { addCategory.mutate(categoryName.trim()); setCategoryName(""); } }}>Add</button>
        </div>
        {addCategory.error || updateCategory.error || removeCategory.error ? <p className="status status-error">Could not save category changes.</p> : null}
        {!summary.isLoading && !summary.isError && categories.length === 0 ? <p className="status status-empty">No categories yet.</p> : null}
        <div className="summary-list">
          <div className="summary-list-header summary-list-header-categories">
            <span>Category Name</span>
            <span className="summary-row-actions">Actions</span>
          </div>
          {categories.map((c) => (
            <div key={c.id} className="summary-list-row summary-list-row-categories">
              {editingCategoryId === c.id ? (
                <>
                  <input value={editingCategoryName} onChange={(e) => setEditingCategoryName(e.target.value)} />
                  <span className="summary-row-actions">
                    <button type="button" onClick={saveCategoryEdit}>Save</button>
                    <button type="button" onClick={() => setEditingCategoryId(null)}>Cancel</button>
                  </span>
                </>
              ) : (
                <>
                  <span>{c.name}</span>
                  <span className="summary-row-actions">
                    <button type="button" onClick={() => startCategoryEdit(c)}>Edit</button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        if (window.confirm("Delete this category? Linked transactions will keep data but lose the category assignment.")) {
                          removeCategory.mutate(c.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      </SimpleCard>
    </div>
  );
}
