import type { ReactNode } from "react";

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <p className="mb-2 text-sm font-medium uppercase tracking-wide text-stone-500">Tasks</p>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">{children}</div>
    </main>
  );
}

export const fieldClassName =
  "mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500";
