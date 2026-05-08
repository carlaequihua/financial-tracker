import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import SimpleCard from "../components/SimpleCard.jsx";
import { api } from "../api/client";

export default function ImportExportPage() {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [message, setMessage] = useState("");
  const [importFormat, setImportFormat] = useState("csv");
  const [exportFormat, setExportFormat] = useState("csv");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  async function onImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMessage("Select a file first.");
      return;
    }

    const form = new FormData();
    form.append("file", file);
    const query = new URLSearchParams({ format: importFormat }).toString();

    const res = await fetch(`${api.rawBase}/api/io/import/transactions?${query}`, {
      method: "POST",
      body: form
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Import failed");
      return;
    }

    const failed = Number(data.failed ?? data.skipped ?? 0);
    setMessage(`Imported ${data.inserted}/${data.total} (${failed} failed)`);
  }

  function onExport() {
    const query = new URLSearchParams();
    query.set("format", exportFormat);
    if (fromDate) query.set("from", fromDate);
    if (toDate) query.set("to", toDate);
    window.location.href = `${api.rawBase}/api/io/export/transactions?${query.toString()}`;
  }

  async function onClearAllTransactions() {
    const ok = window.confirm("Clear all transactions? Accounts and categories will be kept.");
    if (!ok) return;

    const res = await fetch(`${api.rawBase}/api/io/clear-transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Failed to clear transactions.");
      return;
    }

    await Promise.all([
      qc.invalidateQueries({ queryKey: ["transactions"] }),
      qc.invalidateQueries({ queryKey: ["budgets"] }),
      qc.invalidateQueries({ queryKey: ["alerts"] }),
      qc.invalidateQueries({ queryKey: ["summary"] }),
      qc.invalidateQueries({ queryKey: ["accounts"] }),
      qc.invalidateQueries({ queryKey: ["categories"] })
    ]);

    setMessage("All transactions cleared. Accounts and categories were kept.");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onClearAllData() {
    const ok = window.confirm("Clear all data? This will permanently delete transactions, recurring entries, budgets, accounts, and categories.");
    if (!ok) return;

    const res = await fetch(`${api.rawBase}/api/io/clear-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Failed to clear all data.");
      return;
    }

    await Promise.all([
      qc.invalidateQueries({ queryKey: ["transactions"] }),
      qc.invalidateQueries({ queryKey: ["recurring"] }),
      qc.invalidateQueries({ queryKey: ["upcoming"] }),
      qc.invalidateQueries({ queryKey: ["budgets"] }),
      qc.invalidateQueries({ queryKey: ["alerts"] }),
      qc.invalidateQueries({ queryKey: ["summary"] }),
      qc.invalidateQueries({ queryKey: ["accounts"] }),
      qc.invalidateQueries({ queryKey: ["categories"] })
    ]);

    setMessage("All data cleared.");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <SimpleCard title="Import / Export">
      <div className="form-row">
        <select value={importFormat} onChange={(e) => setImportFormat(e.target.value)}>
          <option value="csv">CSV</option>
          <option value="xlsx">XLSX</option>
        </select>
        <input ref={fileRef} type="file" accept={importFormat === "xlsx" ? ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : ".csv,text/csv"} />
        <button type="button" onClick={onImport}>Import Transactions</button>
      </div>
      <div className="form-row">
        <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}>
          <option value="csv">CSV</option>
          <option value="xlsx">XLSX</option>
        </select>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <button type="button" onClick={onExport}>Export Transactions</button>
      </div>
      <div className="form-row">
        <button type="button" className="danger" onClick={onClearAllTransactions}>Clear All Transactions</button>
        <button type="button" className="danger" onClick={onClearAllData}>Clear All Data</button>
      </div>
      <p className="status">{message}</p>
    </SimpleCard>
  );
}
