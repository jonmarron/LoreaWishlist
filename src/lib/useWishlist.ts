"use client";

import { useEffect, useState } from "react";
import { DEFAULT_TITLE, type WishlistItem } from "./types";
import { subscribeWishlist } from "./wishlist";

export function useWishlist() {
  const [items, setItems] = useState<WishlistItem[] | null>(null);
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Firestore is the external system here; every setState below runs from its
    // push callbacks, not during the effect.
    return subscribeWishlist({
      onItems: (next) => {
        setItems(next);
        setError(null);
      },
      onTitle: setTitle,
      onError: setError,
    });
  }, []);

  return { items, title, error, setError, loading: items === null };
}
