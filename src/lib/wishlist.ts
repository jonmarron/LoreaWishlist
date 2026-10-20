"use client";

import { ensureVisitor } from "./auth";
import { supabase } from "./supabase";
import { DEFAULT_TITLE, itemFromRow, type ItemRow, type WishlistItem } from "./types";

/** Thrown when someone else claimed the item a moment earlier. */
export class ClaimTakenError extends Error {
  constructor(readonly by: string) {
    super(`${by} war einen Moment schneller als du.`);
    this.name = "ClaimTakenError";
  }
}

/** Thrown when a write was silently dropped by row-level security. */
class NotAllowedError extends Error {
  constructor() {
    super("Die Datenbank hat diese Änderung abgelehnt.");
    this.name = "NotAllowedError";
  }
}

export function describeDbError(cause: unknown): string {
  if (cause instanceof ClaimTakenError) return cause.message;

  const code = (cause as { code?: string })?.code ?? "";
  const message = (cause as { message?: string })?.message ?? "";

  switch (code) {
    case "42501": // insufficient_privilege
      return "Die Datenbank hat diese Änderung abgelehnt. Melde dich als Admin an und prüf, ob das Schema eingespielt wurde.";
    case "22023":
      return "Dieser Name geht nicht – er muss zwischen 1 und 60 Zeichen lang sein.";
    case "P0002":
      return "Diesen Wunsch gibt es nicht mehr.";
    case "42P01":
      return "Die Tabelle „items“ existiert noch nicht. Führ supabase/schema.sql im SQL-Editor aus.";
    case "PGRST202":
      return "Die Funktion claim_item fehlt. Führ supabase/schema.sql im SQL-Editor aus.";
    default:
      break;
  }

  if (cause instanceof NotAllowedError) {
    return "Die Datenbank hat diese Änderung abgelehnt. Melde dich als Admin an und prüf, ob das Schema eingespielt wurde.";
  }
  if (message.toLowerCase().includes("failed to fetch")) {
    return "Supabase ist nicht erreichbar. Ein kostenloses Projekt pausiert nach etwa einer Woche ohne Nutzung und muss im Dashboard wieder gestartet werden.";
  }
  return message || "Da ist etwas schiefgelaufen.";
}

async function fetchItems(): Promise<WishlistItem[]> {
  const { data, error } = await supabase()
    .from("items")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data as ItemRow[]).map(itemFromRow);
}

async function fetchTitle(): Promise<string> {
  const { data, error } = await supabase().from("meta").select("title").maybeSingle();
  if (error) throw error;
  const title = (data as { title?: string } | null)?.title;
  return title?.trim() ? title : DEFAULT_TITLE;
}

type Handlers = {
  onItems: (items: WishlistItem[]) => void;
  onTitle: (title: string) => void;
  onError: (message: string) => void;
};

/**
 * Live subscription. Postgres streams every change over realtime, so a claim
 * made in one browser crosses the item off in every other open tab within a
 * second. Any notification just triggers a refetch -- the lists are tiny, and
 * refetching avoids having to replay deltas correctly.
 */
export function subscribeWishlist({ onItems, onTitle, onError }: Handlers): () => void {
  let stopped = false;

  const reload = async () => {
    try {
      const [items, title] = await Promise.all([fetchItems(), fetchTitle()]);
      if (stopped) return;
      onItems(items);
      onTitle(title);
    } catch (cause) {
      if (!stopped) onError(describeDbError(cause));
    }
  };

  void reload();

  const channel = supabase()
    .channel("wishlist")
    .on("postgres_changes", { event: "*", schema: "public", table: "items" }, () => void reload())
    .on("postgres_changes", { event: "*", schema: "public", table: "meta" }, () => void reload())
    .subscribe();

  return () => {
    stopped = true;
    void supabase().removeChannel(channel);
  };
}

/**
 * Claim an item.
 *
 * Done in the database rather than here: claim_item() updates the row only
 * `where claimed_by is null`, so two people tapping Claim at the same instant
 * are resolved by Postgres. The loser is told who got there first instead of
 * silently overwriting them.
 */
export async function claimItem(itemId: string, name: string): Promise<void> {
  await ensureVisitor();

  const { data, error } = await supabase().rpc("claim_item", {
    item_id: itemId,
    claimer_name: name,
  });
  if (error) throw error;

  const result = data as { ok?: boolean; claimed_by?: string } | null;
  if (!result?.ok) throw new ClaimTakenError(result?.claimed_by ?? "Someone");
}

/** Release your own claim. The function checks the uid matches. */
export async function releaseItem(itemId: string): Promise<void> {
  await ensureVisitor();

  const { data, error } = await supabase().rpc("release_item", { item_id: itemId });
  if (error) throw error;
  if (!(data as { ok?: boolean } | null)?.ok) throw new NotAllowedError();
}

// --- admin only (enforced by row-level security) ---

/**
 * These go straight at the table, where the policies allow writes only to the
 * admin account. A denied UPDATE or DELETE affects zero rows rather than
 * raising, so each one asks for the affected rows back and treats an empty
 * result as a refusal.
 */
async function expectRows(
  query: PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<void> {
  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) throw new NotAllowedError();
}

export async function addItem(fields: {
  name: string;
  url: string;
  note: string;
}): Promise<void> {
  const { error } = await supabase().from("items").insert(fields);
  if (error) throw error;
}

export async function deleteItem(itemId: string): Promise<void> {
  await expectRows(supabase().from("items").delete().eq("id", itemId).select("id"));
}

/**
 * Edit an item's details. Deliberately touches only these three columns, so
 * editing never disturbs an existing claim.
 */
export async function updateItem(
  itemId: string,
  fields: { name: string; url: string; note: string },
): Promise<void> {
  await expectRows(supabase().from("items").update(fields).eq("id", itemId).select("id"));
}

export async function clearClaim(itemId: string): Promise<void> {
  await expectRows(
    supabase()
      .from("items")
      .update({ claimed_by: null, claimed_by_uid: null, claimed_at: null })
      .eq("id", itemId)
      .select("id"),
  );
}

export async function renameList(title: string): Promise<void> {
  await expectRows(supabase().from("meta").update({ title }).eq("id", true).select("id"));
}
