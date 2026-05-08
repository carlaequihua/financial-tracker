import { api } from "./client";

export const recurringApi = {
  list: () => api.get("/api/recurring"),
  upcoming: (days = 30) => api.get(`/api/recurring/upcoming-expenses?days=${days}`),
  create: (payload) => api.post("/api/recurring", payload),
  update: (id, payload) => api.put(`/api/recurring/${id}`, payload),
  remove: (id) => api.del(`/api/recurring/${id}`)
};
