"use client";

import type { User } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { config } from "./config";
import { supabase } from "./supabase";

type AuthState = { user: User | null; ready: boolean };

const SERVER_STATE: AuthState = { user: null, ready: false };

let state: AuthState = SERVER_STATE;
let started = false;
const listeners = new Set<() => void>();

function publish(next: AuthState): void {
  state = next;
  for (const listener of listeners) listener();
}

function start(): void {
  if (started) return;
  started = true;

  // onAuthStateChange fires immediately with the restored session, but only
  // once the client has read it back out of storage; getSession settles the
  // `ready` flag even when there is no session at all.
  supabase().auth.onAuthStateChange((_event, session) => {
    publish({ user: session?.user ?? null, ready: true });
  });

  void supabase()
    .auth.getSession()
    .then(({ data }) => publish({ user: data.session?.user ?? null, ready: true }));
}

function subscribe(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The admin is one specific address. The same address is in admin_email() in
 * the database -- this check only decides what the UI offers.
 */
function isAdminUser(user: User | null): boolean {
  if (!user || user.is_anonymous || !user.email || !config.adminEmail) return false;
  return user.email.toLowerCase() === config.adminEmail.toLowerCase();
}

export function useAuth() {
  const current = useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
  return { user: current.user, ready: current.ready, isAdmin: isAdminUser(current.user) };
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
