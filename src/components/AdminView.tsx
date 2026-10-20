"use client";

import { useMemo, useState } from "react";
import { describeAuthError, signInAdmin, signOutAdmin, useAuth } from "@/lib/auth";
import { config, configProblems } from "@/lib/config";
import type { WishlistItem } from "@/lib/types";
import { useWishlist } from "@/lib/useWishlist";
import {
  addItem,
  clearClaim,
  deleteItem,
  describeDbError,
  renameList,
} from "@/lib/wishlist";
import { Banner, Shell } from "./Shell";
import { SetupNotice } from "./SetupNotice";

function SignIn({ signedInAsOther }: { signedInAsOther: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="rounded-xl border border-border bg-surface p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setProblem(null);
        try {
          await signInAdmin(email.trim(), password);
        } catch (cause) {
          setProblem(describeAuthError(cause));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-lg font-medium">Admin sign-in</h2>
      <p className="mt-1 mb-4 text-sm text-muted">
        {signedInAsOther
          ? "You are signed in, but not as the admin account."
          : "Sign in with the admin account to manage the list."}
      </p>

      <div className="space-y-3">
        <div>
          <label htmlFor="admin-email" className="mb-1 block text-sm text-muted">
            Email
          </label>
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="admin-password" className="mb-1 block text-sm text-muted">
            Password
          </label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>

      {problem ? <p className="mt-3 text-sm text-danger">{problem}</p> : null}
    </form>
  );
}

export function AdminView() {
  const problems = useMemo(() => configProblems(), []);
  const { user, ready, isAdmin } = useAuth();
  const { items, title, error, setError, loading } = useWishlist();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // null means "follow whatever the list says", which avoids seeding this
  // input from async data in an effect.
  const [titleDraft, setTitleDraft] = useState<string | null>(null);

  async function run(action: () => Promise<void>, itemId?: string): Promise<boolean> {
    if (itemId) setBusyId(itemId);
    try {
      await action();
      setError(null);
      return true;
    } catch (cause) {
      setError(describeDbError(cause));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function submitItem(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    // Accept "example.com" as well as a full URL.
    let trimmedUrl = url.trim();
    if (trimmedUrl && !/^https?:\/\//i.test(trimmedUrl)) trimmedUrl = `https://${trimmedUrl}`;

    setSaving(true);
    const ok = await run(() =>
      addItem({ name: trimmedName, url: trimmedUrl, note: note.trim() }),
    );
    setSaving(false);

    if (ok) {
      setName("");
      setUrl("");
      setNote("");
    }
  }

  const removeItem = (item: WishlistItem) => {
    const warning = item.claimedBy
      ? `“${item.name}” is claimed by ${item.claimedBy}. Delete it anyway?`
      : `Delete “${item.name}”?`;
    if (!confirm(warning)) return;
    void run(() => deleteItem(item.id), item.id);
  };

  const dropClaim = (item: WishlistItem) => {
    if (!confirm(`Clear the claim by ${item.claimedBy} on “${item.name}”?`)) return;
    void run(() => clearClaim(item.id), item.id);
  };

  if (problems.length > 0) {
    return (
      <Shell title="Admin">
        <SetupNotice problems={problems} />
      </Shell>
    );
  }

  if (!ready) {
    return (
      <Shell title="Admin">
        <p className="text-sm text-muted">Loading…</p>
      </Shell>
    );
  }

  if (!isAdmin) {
    return (
      <Shell title="Admin">
        <SignIn signedInAsOther={Boolean(user && !user.is_anonymous)} />
      </Shell>
    );
  }

  return (
    <Shell
      title="Admin"
      subtitle={`Signed in as ${user?.email ?? config.adminEmail}`}
      action={
        <button
          type="button"
          onClick={() => void signOutAdmin()}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
        >
          Sign out
        </button>
      }
    >
      {error ? <Banner>{error}</Banner> : null}

      <form
        className="mb-6 rounded-xl border border-border bg-surface p-5"
        onSubmit={(event) => {
          event.preventDefault();
          const next = (titleDraft ?? "").trim();
          if (!next || next === title) return;
          void run(() => renameList(next)).then((ok) => {
            if (ok) setTitleDraft(null);
          });
        }}
      >
        <label htmlFor="list-title" className="mb-1 block text-sm text-muted">
          List title
        </label>
        <div className="flex gap-2">
          <input
            id="list-title"
            value={titleDraft ?? title}
            onChange={(event) => setTitleDraft(event.target.value)}
            maxLength={80}
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={titleDraft === null || !titleDraft.trim() || titleDraft.trim() === title}
            className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-40"
          >
            Rename
          </button>
        </div>
      </form>

      <form onSubmit={submitItem} className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-lg font-medium">Add an item</h2>
        <div className="space-y-3">
          <div>
            <label htmlFor="item-name" className="mb-1 block text-sm text-muted">
              Name
            </label>
            <input
              id="item-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={160}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="item-url" className="mb-1 block text-sm text-muted">
              Link
            </label>
            <input
              id="item-url"
              type="text"
              inputMode="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="example.com/product"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="item-note" className="mb-1 block text-sm text-muted">
              Note <span className="text-xs">(optional — size, colour, …)</span>
            </label>
            <input
              id="item-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={200}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add to wishlist"}
        </button>
      </form>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
          On the list ({items?.length ?? 0})
        </h2>

        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (items?.length ?? 0) === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">
            Nothing here yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {items?.map((item) => (
              <li key={item.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium break-words">{item.name}</h3>
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 block truncate font-mono text-xs text-muted hover:text-accent"
                      >
                        {item.url}
                      </a>
                    ) : null}
                    {item.note ? <p className="mt-1.5 text-sm text-muted">{item.note}</p> : null}
                    {item.claimedBy ? (
                      <p className="mt-2 inline-flex rounded-full bg-claimed-soft px-2.5 py-1 text-xs font-medium text-claimed">
                        Claimed by {item.claimedBy}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {item.claimedBy ? (
                      <button
                        type="button"
                        onClick={() => dropClaim(item)}
                        disabled={busyId === item.id}
                        className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground disabled:opacity-50"
                      >
                        Clear claim
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeItem(item)}
                      disabled={busyId === item.id}
                      className="rounded-lg border border-danger/40 px-3 py-1.5 text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
                    >
                      {busyId === item.id ? "…" : "Delete"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  );
}
