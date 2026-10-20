import Link from "next/link";
import type { ReactNode } from "react";

export function Shell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-10 sm:py-14">
      <header className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-4xl leading-tight font-bold tracking-tight sm:text-5xl">
            {title}
          </h1>
          {action}
        </div>
        {subtitle ? <p className="mt-2 text-sm text-muted">{subtitle}</p> : null}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-12 border-t border-border pt-4 text-xs text-muted">
        <Link href="/" className="underline-offset-4 hover:text-accent hover:underline">
          Wunschliste
        </Link>
        <span className="mx-2">·</span>
        <Link href="/admin" className="underline-offset-4 hover:text-accent hover:underline">
          Verwaltung
        </Link>
      </footer>
    </div>
  );
}

export function Banner({
  tone = "error",
  children,
}: {
  tone?: "error" | "info";
  children: ReactNode;
}) {
  const toneClasses =
    tone === "error"
      ? "border-danger/40 bg-danger/10 text-danger"
      : "border-border bg-surface text-muted";

  return (
    <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${toneClasses}`} role="status">
      {children}
    </div>
  );
}
