import { useQuery } from "@tanstack/react-query";
import SimpleCard from "../components/SimpleCard.jsx";
import { transactionsApi } from "../api/transactions";
import { recurringApi } from "../api/recurring";
import { budgetsApi } from "../api/budgets";

export default function DashboardPage() {
  const tx = useQuery({
    queryKey: ["transactions"],
    queryFn: transactionsApi.list,
    staleTime: 1000 * 30
  });
  const up = useQuery({
    queryKey: ["upcoming", 30],
    queryFn: () => recurringApi.upcoming(30),
    staleTime: 1000 * 60
  });
  const alerts = useQuery({
    queryKey: ["alerts"],
    queryFn: () => budgetsApi.alerts(),
    staleTime: 1000 * 60
  });

  const recent = (tx.data || []).slice(0, 10);

  return (
    <div className="grid">
      <SimpleCard title="Recent Transactions">
        {tx.isLoading ? <p className="status">Loading...</p> : null}
        {tx.isError ? <p className="status status-error">Failed to load transactions.</p> : null}
        {!tx.isLoading && !tx.isError && recent.length === 0 ? <p className="status status-empty">No transactions yet.</p> : null}
        {!tx.isLoading && !tx.isError && recent.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.id}>
                    <td>{String(row.txn_date).slice(0, 10)}</td>
                    <td>{row.description}</td>
                    <td>{row.amount}</td>
                    <td>{row.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </SimpleCard>
      <SimpleCard title="Upcoming Expenses">
        <p>{up.isLoading ? "Loading..." : `${up.data?.length || 0} upcoming`}</p>
      </SimpleCard>
      <SimpleCard title="Budget Alerts (>= 80%)">
        <p>
          {alerts.isLoading
            ? "Loading..."
            : `${(alerts.data || []).filter((a) => a.alert).length} categories`}
        </p>
      </SimpleCard>
    </div>
  );
}
