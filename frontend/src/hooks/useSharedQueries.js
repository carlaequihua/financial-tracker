import { useQuery } from "@tanstack/react-query";
import { masterDataApi } from "../api/masterData";

const MASTER_DATA_STALE_MS = 1000 * 60 * 15;

export function useAccounts(options = {}) {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: masterDataApi.accounts,
    staleTime: MASTER_DATA_STALE_MS,
    ...options
  });
}

export function useCategories(options = {}) {
  return useQuery({
    queryKey: ["categories"],
    queryFn: masterDataApi.categories,
    staleTime: MASTER_DATA_STALE_MS,
    ...options
  });
}
