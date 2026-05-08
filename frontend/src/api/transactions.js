import { api } from "./client";

export function normalizeTransactionFilters(filters = {}) {
  return {
    from: filters.from || "",
    to: filters.to || "",
    account_id: filters.account_id || "",
    category_id: filters.category_id || "",
    type: filters.type || "",
    cleared: filters.cleared || ""
  };
}

function toQuery(filters = {}) {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") p.set(key, String(value));
  }
  const query = p.toString();
  return query ? `?${query}` : "";
}

export const transactionsApi = {
  list: (filters = {}) => api.get(`/api/transactions${toQuery(filters)}`),
  create: (payload) => api.post("/api/transactions", payload),
  update: (id, payload) => api.put(`/api/transactions/${id}`, payload),
  setCleared: (id, cleared) => api.patch(`/api/transactions/${id}/cleared`, { cleared }),
  remove: (id) => api.del(`/api/transactions/${id}`)
};
