import { api } from "./client";

function toQuery(params = {}) {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") p.set(key, String(value));
  }
  const query = p.toString();
  return query ? `?${query}` : "";
}

export const budgetsApi = {
  list: () => api.get("/api/budgets"),
  alerts: ({ month, year } = {}) => api.get(`/api/budgets/alerts${toQuery({ month, year })}`),
  create: (payload) => api.post("/api/budgets", payload),
  update: (id, payload) => api.put(`/api/budgets/${id}`, payload),
  remove: (id) => api.del(`/api/budgets/${id}`)
};
