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
  updateItem,
} from "@/lib/wishlist";
import { Banner, Shell } from "./Shell";
import { SetupNotice } from "./SetupNotice";

/** Accept "beispiel.de/x" as well as a full URL. */
function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const fieldClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

/**
 * Inline editor for one item. Mounted only while that item is being edited,
 * so the draft state seeds itself from the row and is discarded on cancel.
 */
function ItemEditor({
  item,
  busy,
  onCancel,
  onSave,
}: {
  item: WishlistItem;
  busy: boolean;
  onCancel: () => void;
  onSave: (fields: { name: string; url: string; note: string }) => void;
}) {
  const [name, setName] = useState(item.name);
  const [url, setUrl] = useState(item.url);
  const [note, setNote] = useState(item.note);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        onSave({ name: trimmed, url: normalizeUrl(url), note: note.trim() });
      }}
    >
      <div className="space-y-3">
        <div>
          <label htmlFor={`edit-name-${item.id}`} className="mb-1 block text-sm text-muted">
            Name
          </label>
          <input
            id={`edit-name-${item.id}`}
            autoFocus
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={160}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor={`edit-url-${item.id}`} className="mb-1 block text-sm text-muted">
            Link
          </label>
          <input
            id={`edit-url-${item.id}`}
            type="text"
            inputMode="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="beispiel.de/produkt"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor={`edit-note-${item.id}`} className="mb-1 block text-sm text-muted">
            Notiz <span className="text-xs">(optional)</span>
          </label>
          <input
            id={`edit-note-${item.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={200}
            className={fieldClass}
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-foreground"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-accent-contrast disabled:opacity-50"
        >
          {busy ? "Wird gespeichert…" : "Speichern"}
        </button>
      </div>
    </form>
  );
}

/** Every item says where it stands, so "no badge" is never ambiguous. */
function ClaimStatus({ item }: { item: WishlistItem }) {
  if (!item.claimedBy) {
    return (
      <p className="mt-2 inline-flex rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted">
        Noch frei
      </p>
    );
  }

  const claimedAt = item.claimedAt ? new Date(item.claimedAt) : null;
  return (
    <p
      className="mt-2 inline-flex rounded-full bg-claimed-soft px-2.5 py-1 text-xs font-semibold text-claimed"
      title={claimedAt ? `Reserviert am ${claimedAt.toLocaleString("de-DE")}` : undefined}
    >
      Reserviert von {item.claimedBy}
    </p>
  );
}

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
      <h2 className="text-lg font-semibold">Anmeldung</h2>
      <p className="mt-1 mb-4 text-sm text-muted">
        {signedInAsOther
          ? "Du bist angemeldet, aber nicht als Admin-Konto."
          : "Melde dich mit dem Admin-Konto an, um die Liste zu verwalten."}
      </p>

      <div className="space-y-3">
        <div>
          <label htmlFor="admin-email" className="mb-1 block text-sm text-muted">
            E-Mail
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
            Passwort
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
        className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast disabled:opacity-50"
      >
        {busy ? "Wird angemeldet…" : "Anmelden"}
      </button>

      {problem ? <p className="mt-3 text-sm text-danger">{problem}</p> : null}
    </form>
  );
}

export function AdminView() {
  const problems = useMemo(() => configProblems(), []);
  const { user, ready, isAdmin } = useAuth();
  const { items, title, error, setError, loading } = useWishlist();
  const claimedCount = items?.filter((item) => item.claimedBy).length ?? 0;

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
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

    setSaving(true);
    const ok = await run(() =>
      addItem({ name: trimmedName, url: normalizeUrl(url), note: note.trim() }),
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
      ? `„${item.name}“ ist von ${item.claimedBy} reserviert. Trotzdem löschen?`
      : `„${item.name}“ löschen?`;
    if (!confirm(warning)) return;
    void run(() => deleteItem(item.id), item.id);
  };

  const saveEdit = (item: WishlistItem, fields: { name: string; url: string; note: string }) => {
    void run(() => updateItem(item.id, fields), item.id).then((ok) => {
      if (ok) setEditingId(null);
    });
  };

  const dropClaim = (item: WishlistItem) => {
    if (!confirm(`Reservierung von ${item.claimedBy} für „${item.name}“ aufheben?`)) return;
    void run(() => clearClaim(item.id), item.id);
  };

  if (problems.length > 0) {
    return (
      <Shell title="Verwaltung">
        <SetupNotice problems={problems} />
      </Shell>
    );
  }

  if (!ready) {
    return (
      <Shell title="Verwaltung">
        <p className="text-sm text-muted">Wird geladen…</p>
      </Shell>
    );
  }

  if (!isAdmin) {
    return (
      <Shell title="Verwaltung">
        <SignIn signedInAsOther={Boolean(user && !user.is_anonymous)} />
      </Shell>
    );
  }

  return (
    <Shell
      title="Verwaltung"
      subtitle={`Angemeldet als ${user?.email ?? config.adminEmail}`}
      action={
        <button
          type="button"
          onClick={() => void signOutAdmin()}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted hover:text-foreground"
        >
          Abmelden
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
          Titel der Liste
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
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            Umbenennen
          </button>
        </div>
      </form>

      <form onSubmit={submitItem} className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-lg font-semibold">Wunsch hinzufügen</h2>
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
              placeholder="beispiel.de/produkt"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="item-note" className="mb-1 block text-sm text-muted">
              Notiz <span className="text-xs">(optional – Größe, Farbe, …)</span>
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
          className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast disabled:opacity-50"
        >
          {saving ? "Wird hinzugefügt…" : "Zur Wunschliste hinzufügen"}
        </button>
      </form>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-bold tracking-wide text-muted uppercase">
          Auf der Liste ({items?.length ?? 0})
          {claimedCount > 0 ? ` · ${claimedCount} reserviert` : null}
        </h2>

        {loading ? (
          <p className="text-sm text-muted">Wird geladen…</p>
        ) : (items?.length ?? 0) === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">
            Noch nichts vorhanden.
          </p>
        ) : (
          <ul className="space-y-3">
            {items?.map((item) => (
              <li key={item.id} className="rounded-xl border border-border bg-surface p-4">
                {editingId === item.id ? (
                  <ItemEditor
                    item={item}
                    busy={busyId === item.id}
                    onCancel={() => setEditingId(null)}
                    onSave={(fields) => saveEdit(item, fields)}
                  />
                ) : (
                  <div className="flex flex-col gap-3 wide:flex-row wide:items-start wide:justify-between">
                    <div className="min-w-0 wide:flex-1">
                      <h3 className="font-semibold break-words">{item.name}</h3>
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
                      <ClaimStatus item={item} />
                    </div>

                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setEditingId(item.id);
                        }}
                        disabled={busyId === item.id}
                        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted hover:text-foreground disabled:opacity-50"
                      >
                        Bearbeiten
                      </button>
                      {item.claimedBy ? (
                        <button
                          type="button"
                          onClick={() => dropClaim(item)}
                          disabled={busyId === item.id}
                          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted hover:text-foreground disabled:opacity-50"
                        >
                          Reservierung aufheben
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeItem(item)}
                        disabled={busyId === item.id}
                        className="rounded-lg border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
                      >
                        {busyId === item.id ? "…" : "Löschen"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  );
}
