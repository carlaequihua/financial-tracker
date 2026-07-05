import { api } from "./client.js";

function toQuery(params) {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  return parts.length ? "?" + parts.join("&") : "";
}

export const modificationsApi = {
  // List modifications for a recurring entry
  list(recurringRuleId) {
    return api.get(`/api/recurring/${recurringRuleId}/modifications`);
  },

  // Create a new modification
  create(recurringRuleId, input) {
    return api.post(`/api/recurring/${recurringRuleId}/modifications`, input);
  },

  // Update an existing modification
  update(modificationId, input) {
    return api.put(`/api/modifications/${modificationId}`, input);
  },

  // Delete a modification
  remove(modificationId) {
    return api.del(`/api/modifications/${modificationId}`);
  }
};
