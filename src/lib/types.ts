export type WishlistItem = {
  id: string;
  name: string;
  url: string;
  note: string;
  createdAt: string;
  /** Display name of the claimer, visible to everyone. Null when unclaimed. */
  claimedBy: string | null;
  /**
   * Supabase auth uid of the claimer -- an anonymous visitor still gets a
   * stable one. The release_item() function compares against it so that only
   * the person who claimed an item can give it back.
   */
  claimedByUid: string | null;
  claimedAt: string | null;
};

export const DEFAULT_TITLE = "My Wishlist";

/** Row shape as it comes back from PostgREST. */
export type ItemRow = {
  id: string;
  name: string | null;
  url: string | null;
  note: string | null;
  created_at: string | null;
  claimed_by: string | null;
  claimed_by_uid: string | null;
  claimed_at: string | null;
};

export function itemFromRow(row: ItemRow): WishlistItem {
  return {
    id: row.id,
    name: row.name ?? "",
    url: row.url ?? "",
    note: row.note ?? "",
    createdAt: row.created_at ?? "",
    claimedBy: row.claimed_by || null,
    claimedByUid: row.claimed_by_uid,
    claimedAt: row.claimed_at,
  };
}
