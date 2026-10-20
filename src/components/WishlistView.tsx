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
      // Losing a race is expected and not an error worth a red banner.
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3
              className={`font-medium break-words ${
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
              <p className="mt-2 inline-flex rounded-full bg-claimed-soft px-2.5 py-1 text-xs font-medium text-claimed">
                Claimed by {isMine ? "you" : item.claimedBy}
              </p>
            ) : null}
          </div>

          <div className="shrink-0">
            {item.claimedBy ? (
              isMine ? (
                <button
                  type="button"
                  onClick={() => void release(item)}
                  disabled={busy}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground disabled:opacity-50"
                >
                  {busy ? "Releasing…" : "Release"}
                </button>
              ) : null
            ) : claimingId === item.id ? null : (
              <button
                type="button"
                onClick={() => startClaim(item)}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Claim
              </button>
            )}
          </div>
        </div>

        {claimingId === item.id && !item.claimedBy ? (
          <form
            className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void claim(item);
            }}
          >
            <label htmlFor={`name-${item.id}`} className="sr-only">
              Your name
            </label>
            <input
              id={`name-${item.id}`}
              autoFocus
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="Your name"
              maxLength={60}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              disabled={busy || !draftName.trim()}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Claiming…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setClaimingId(null)}
              className="rounded-lg px-2 py-1.5 text-sm text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </form>
        ) : null}
      </li>
    );
  };

  if (problems.length > 0) {
    return (
      <Shell title="Wishlist">
        <SetupNotice problems={problems} />
      </Shell>
    );
  }

  return (
    <Shell
      title={title}
      subtitle="Pick anything that is still open and claim it, so nobody buys the same thing twice."
    >
      {error ? <Banner>{error}</Banner> : null}
      {notice ? <Banner tone="info">{notice}</Banner> : null}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : open.length === 0 && claimed.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">
          Nothing on the list yet.
        </p>
      ) : (
        <div className="space-y-8">
          {open.length > 0 ? <ul className="space-y-3">{open.map(renderItem)}</ul> : null}

          {claimed.length > 0 ? (
            <section>
              <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
                Already claimed
              </h2>
              <ul className="space-y-3">{claimed.map(renderItem)}</ul>
            </section>
          ) : null}
        </div>
      )}
    </Shell>
  );
}
