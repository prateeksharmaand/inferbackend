"use client";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/services";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: authApi.me, retry: false, staleTime: 5 * 60_000 });
}
