import { useEffect, useState } from "react";

export default function ModificationForm({ accounts, categories, onSave, onCancel, isLoading, defaultStartDate }) {
  const [modificationType, setModificationType] = useState("one_time");
  const [startDate, setStartDate] = useState(defaultStartDate || new Date().toISOString().slice(0, 10));
  const [overrideTxnDate, setOverrideTxnDate] = useState(defaultStartDate || new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");

  useEffect(() => {
    const date = defaultStartDate || new Date().toISOString().slice(0, 10);
    setStartDate(date);
    setOverrideTxnDate(date);
  }, [defaultStartDate]);

  function handleSubmit(e) {
    e.preventDefault();

    const anchorDate = defaultStartDate || startDate;
    const input = {
      modification_type: modificationType,
      start_date: modificationType === "one_time" ? anchorDate : startDate,
      override_txn_date: modificationType === "one_time" ? overrideTxnDate : null,
      amount: amount ? Number(amount) : null,
      description: description || null,
      account_id: accountId ? Number(accountId) : null,
      category_id: categoryId ? Number(categoryId) : null
    };

    // For date_range, require end_date
    if (modificationType === "date_range") {
      if (!endDate) {
        alert("End date is required for date range modifications");
        return;
      }
      input.end_date = endDate;
    }

    onSave(input);
  }

  return (
    <form onSubmit={handleSubmit} className="modification-form">
      <div className="form-row">
        <label>Modification Type</label>
        <select value={modificationType} onChange={(e) => setModificationType(e.target.value)}>
          <option value="one_time">This occurrence only</option>
          <option value="future">This and future occurrences</option>
          <option value="date_range">Specific date range</option>
        </select>
      </div>

      {modificationType === "one_time" ? (
        <>
          <div className="form-row">
            <label>Original Occurrence Date</label>
            <input type="date" value={defaultStartDate || startDate} disabled readOnly />
          </div>
          <div className="form-row">
            <label>New Date for This Occurrence</label>
            <input
              type="date"
              value={overrideTxnDate}
              onChange={(e) => setOverrideTxnDate(e.target.value)}
              onInput={(e) => setOverrideTxnDate(e.target.value)}
              required
            />
          </div>
        </>
      ) : (
        <div className="form-row">
          <label>Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>
      )}

      {modificationType === "date_range" && (
        <div className="form-row">
          <label>End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
        </div>
      )}

      <div className="form-row">
        <label>Amount (optional - leave blank to keep original)</label>
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Leave blank to keep original"
        />
      </div>

      <div className="form-row">
        <label>Description (optional - leave blank to keep original)</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Leave blank to keep original"
        />
      </div>

      <div className="form-row">
        <label>Account (optional - leave blank to keep original)</label>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Keep original</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <label>Category (optional - leave blank to keep original)</label>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Keep original</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="form-row form-actions">
        <button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : "Save Modification"}
        </button>
        <button type="button" onClick={onCancel} disabled={isLoading}>
          Cancel
        </button>
      </div>
    </form>
  );
}
