import { api } from "./client";

export const masterDataApi = {
  summary: () => api.get("/api/master-data/summary"),
  accounts: () => api.get("/api/master-data/accounts"),
  categories: () => api.get("/api/master-data/categories"),
  addAccount: (name) => api.post("/api/master-data/accounts", { name }),
  updateAccount: (id, payload) => api.put(`/api/master-data/accounts/${id}`, payload),
  reorderAccount: (id, direction) => api.post(`/api/master-data/accounts/${id}/reorder`, { direction }),
  reorderAccounts: (accountIds) => api.post("/api/master-data/accounts/reorder", { accountIds }),
  deleteAccount: (id) => api.del(`/api/master-data/accounts/${id}`),
  addCategory: (name) => api.post("/api/master-data/categories", { name }),
  updateCategory: (id, name) => api.put(`/api/master-data/categories/${id}`, { name }),
  deleteCategory: (id) => api.del(`/api/master-data/categories/${id}`)
};
