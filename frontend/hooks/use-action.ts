"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/services/client";

/** Mutation helper: toasts success/error and invalidates the given query keys. */
export function useAction<A, R>(fn: (a: A) => Promise<R>, opts: { success?: string | ((r: R) => string); invalidate?: readonly (readonly unknown[])[] } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(r) : opts.success);
      opts.invalidate?.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
