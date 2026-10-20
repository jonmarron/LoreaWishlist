"use client";

/**
 * Remembers the name this browser last claimed with, so repeat visitors do not
 * retype it. localStorage can throw in private windows or with site data
 * blocked, so both accessors are guarded.
 *
 * Which claims are "mine" is not tracked here -- that comes from the Supabase
 * auth uid, which release_item() can actually verify.
 */

const NAME_KEY = "wishlist.claimer-name";

export function rememberName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}

export function recallName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}
