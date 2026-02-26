"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export function ManualRefreshButton() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const onApiRefresh = () => {
    const approved = window.confirm(
      "This will call provider APIs and may consume paid credits. Continue?"
    );
    if (!approved) return;

    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("refresh", String(Date.now()));
      router.push(`${pathname}?${params.toString()}`);
      router.refresh();
    });
  };

  const onCsvReload = () => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("refresh");
      router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={onCsvReload}
        disabled={isPending}
        className="rounded-full border border-slate-300 bg-white/70 px-4 py-2 text-xs font-semibold text-ink transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Refreshing..." : "Reload CSV"}
      </button>
      <button
        type="button"
        onClick={onApiRefresh}
        disabled={isPending}
        className="rounded-full border border-slate-300 bg-ink px-4 py-2 text-xs font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Refreshing..." : "Manual API Refresh"}
      </button>
    </div>
  );
}
