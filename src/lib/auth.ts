"use client";

import type { User } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

type AuthState = {
  user: User | null;
  /** The stored session has been read back; we know whether anyone is signed in. */
  ready: boolean;
  /** Confirmed by the database, never inferred from the email in the browser. */
  isAdmin: boolean;
  /** An is_admin() check is in flight; the answer is not known yet. */
  checking: boolean;
};

const SERVER_STATE: AuthState = { user: null, ready: false, isAdmin: false, checking: false };

let state: AuthState = SERVER_STATE;
let started = false;
const listeners = new Set<() => void>();

function publish(next: AuthState): void {
  state = next;
  for (const listener of listeners) listener();
}

/**
 * Who is an admin lives in the database, so the browser has to ask. Each answer
 * is tagged with the request that produced it, and a late reply from a previous
 * sign-in is discarded rather than overwriting the current one.
 */
let generation = 0;

async function resolve(user: User | null): Promise<void> {
  const mine = ++generation;

  if (!user || user.is_anonymous) {
    publish({ user, ready: true, isAdmin: false, checking: false });
    return;
  }

  // `checking` keeps the admin page on its loading state instead of flashing
  // the sign-in form at someone who is in fact an admin.
  publish({ user, ready: true, isAdmin: false, checking: true });

  const { data, error } = await supabase().rpc("is_admin");
  if (mine !== generation) return;

  publish({ user, ready: true, isAdmin: !error && data === true, checking: false });
}

function start(): void {
  if (started) return;
  started = true;

  supabase().auth.onAuthStateChange((_event, session) => {
    void resolve(session?.user ?? null);
  });

  void supabase()
    .auth.getSession()
    .then(({ data }) => resolve(data.session?.user ?? null));
}

function subscribe(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAuth() {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}

let pendingVisitor: Promise<void> | null = null;

/**
 * Give this browser an identity without asking anyone to sign up. Anonymous
 * sign-in is invisible to the visitor but gives the database a stable uid to
 * bind each claim to. Deduplicated, so two rapid clicks do not create two.
 */
export async function ensureVisitor(): Promise<void> {
  const { data } = await supabase().auth.getSession();
  if (data.session) return;

  pendingVisitor ??= supabase()
    .auth.signInAnonymously()
    .then(({ error }) => {
      if (error) throw error;
    })
    .finally(() => {
      pendingVisitor = null;
    });

  return pendingVisitor;
}

export async function signInAdmin(email: string, password: string): Promise<void> {
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOutAdmin(): Promise<void> {
  await supabase().auth.signOut();
}

/** Supabase's auth errors are terse; make them actionable. */
export function describeAuthError(cause: unknown): string {
  const message = (cause as { message?: string })?.message ?? "";
  const lower = message.toLowerCase();

  if (lower.includes("invalid login credentials")) return "E-Mail oder Passwort stimmt nicht.";
  if (lower.includes("email logins are disabled")) {
    return "Die Anmeldung per E-Mail ist für dieses Supabase-Projekt deaktiviert.";
  }
  if (lower.includes("signup") && lower.includes("disabled")) {
    return "Registrierungen sind in Supabase deaktiviert – das blockiert auch die anonyme Anmeldung.";
  }
  if (lower.includes("anonymous sign-ins are disabled")) {
    return "Anonyme Anmeldungen sind deaktiviert – in Supabase aktivieren, damit reserviert werden kann.";
  }
  if (lower.includes("email not confirmed")) {
    return "Für dieses Konto muss die E-Mail noch bestätigt werden.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Zu viele Versuche. Warte kurz und probier es noch einmal.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Supabase ist nicht erreichbar. Prüf die Verbindung und die Projekt-URL.";
  }
  return message || "Anmeldung nicht möglich.";
}
