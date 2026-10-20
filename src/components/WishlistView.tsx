"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { configProblems } from "@/lib/config";
import { recallName, rememberName } from "@/lib/identity";
import type { WishlistItem } from "@/lib/types";
import { useWishlist } from "@/lib/useWishlist";
import { claimItem, describeDbError, releaseItem } from "@/lib/wishlist";
import { Banner, Shell } from "./Shell";
import { SetupNotice } from "./SetupNotice";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function ExternalLinkIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 3H4a1.5 1.5 0 0 0-1.5 1.5v7.5A1.5 1.5 0 0 0 4 13.5h7.5A1.5 1.5 0 0 0 13 12V9" />
      <path d="M10 2.5h3.5V6" />
      <path d="M7.5 8.5 13.5 2.5" />
    </svg>
  );
}

export function WishlistView() {
  const problems = useMemo(() => configProblems(), []);
  const { items, title, error, setError, loading } = useWishlist();
  const { user } = useAuth();

  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const startClaim = (item: WishlistItem) => {
    setNotice(null);
    setDraftName(recallName());
    setClaimingId(item.id);
  };

  async function claim(item: WishlistItem) {
    const name = draftName.trim();
    if (!name) return;

    setBusyId(item.id);
    setNotice(null);
    try {
      await claimItem(item.id, name);
      rememberName(name);
      setClaimingId(null);
      setError(null);
    } catch (cause) {
      // Losing a race is expected and not worth a red banner.
      const message = describeDbError(cause);
      if ((cause as { name?: string })?.name === "ClaimTakenError") {
        setNotice(message);
        setClaimingId(null);
      } else {
        setError(message);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function release(item: WishlistItem) {
    setBusyId(item.id);
    setNotice(null);
    try {
      await releaseItem(item.id);
      setError(null);
    } catch (cause) {
      setError(describeDbError(cause));
    } finally {
      setBusyId(null);
    }
  }

  const open = items?.filter((item) => !item.claimedBy) ?? [];
  const claimed = items?.filter((item) => item.claimedBy) ?? [];

  const renderItem = (item: WishlistItem) => {
    const host = hostOf(item.url);
    const isMine = Boolean(item.claimedByUid && item.claimedByUid === user?.id);
    const busy = busyId === item.id;

    return (
      <li
        key={item.id}
        className={`rounded-xl border border-border bg-surface p-4 transition-opacity ${
          item.claimedBy ? "opacity-70" : ""
        }`}
      >
        {/* Below --breakpoint-wide the card stacks: the name gets the full width and the
            buttons sit underneath, pushed to the right. */}
        <div className="flex flex-col gap-3 wide:flex-row wide:items-start wide:justify-between">
          <div className="min-w-0 wide:flex-1">
            <h3
              className={`font-semibold break-words ${
                item.claimedBy ? "line-through decoration-muted" : ""
              }`}
            >
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-4 hover:text-accent hover:underline"
                >
                  {item.name}
                </a>
              ) : (
                item.name
              )}
            </h3>
            {host ? <p className="mt-0.5 font-mono text-xs text-muted">{host}</p> : null}
            {item.note ? <p className="mt-1.5 text-sm text-muted">{item.note}</p> : null}
            {item.claimedBy ? (
              <p className="mt-2 inline-flex rounded-full bg-claimed-soft px-2.5 py-1 text-xs font-semibold text-claimed">
                {isMine ? "Von dir reserviert" : `Reserviert von ${item.claimedBy}`}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2">
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-accent"
              >
                <ExternalLinkIcon />
                Ansehen
              </a>
            ) : null}

            {item.claimedBy ? (
              isMine ? (
                <button
                  type="button"
                  onClick={() => void release(item)}
                  disabled={busy}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted hover:text-foreground disabled:opacity-50"
                >
                  {busy ? "Wird freigegeben…" : "Freigeben"}
                </button>
              ) : null
            ) : claimingId === item.id ? null : (
              <button
                type="button"
                onClick={() => startClaim(item)}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-contrast hover:opacity-90"
              >
                Reservieren
              </button>
            )}
          </div>
        </div>

        {claimingId === item.id && !item.claimedBy ? (
          <form
            className="mt-4 flex flex-col gap-2 border-t border-border pt-4 wide:flex-row wide:items-center"
            onSubmit={(event) => {
              event.preventDefault();
              void claim(item);
            }}
          >
            <label htmlFor={`name-${item.id}`} className="sr-only">
              Dein Name
            </label>
            <input
              id={`name-${item.id}`}
              autoFocus
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="Dein Name"
              maxLength={60}
              className="min-w-0 rounded-lg border border-border bg-background px-3 py-1.5 text-sm wide:flex-1"
            />
            <div className="flex justify-end gap-2">
              <button
                type="submit"
                disabled={busy || !draftName.trim()}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-contrast disabled:opacity-50"
              >
                {busy ? "Wird reserviert…" : "Bestätigen"}
              </button>
              <button
                type="button"
                onClick={() => setClaimingId(null)}
                className="rounded-lg px-2 py-1.5 text-sm text-muted hover:text-foreground"
              >
                Abbrechen
              </button>
            </div>
          </form>
        ) : null}
      </li>
    );
  };

  if (problems.length > 0) {
    return (
      <Shell title="Wunschliste">
        <SetupNotice problems={problems} />
      </Shell>
    );
  }

  return (
    <Shell
      title={title}
      subtitle="Such dir etwas aus, das noch frei ist, und reservier es – so schenkt niemand zweimal dasselbe."
    >
      {error ? <Banner>{error}</Banner> : null}
      {notice ? <Banner tone="info">{notice}</Banner> : null}

      {loading ? (
        <p className="text-sm text-muted">Wird geladen…</p>
      ) : open.length === 0 && claimed.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">
          Noch nichts auf der Liste.
        </p>
      ) : (
        <div className="space-y-8">
          {open.length > 0 ? <ul className="space-y-3">{open.map(renderItem)}</ul> : null}

          {claimed.length > 0 ? (
            <section>
              <h2 className="mb-3 text-xs font-bold tracking-wide text-muted uppercase">
                Bereits reserviert
              </h2>
              <ul className="space-y-3">{claimed.map(renderItem)}</ul>
            </section>
          ) : null}
        </div>
      )}
    </Shell>
  );
}
