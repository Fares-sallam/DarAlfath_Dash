/**
 * Where the customer-facing store lives, for the links that open it from here. Set
 * VITE_STOREFRONT_URL when the store moves to its own domain; until then it is the Vercel address.
 */
export const STOREFRONT_URL = (
  (import.meta.env.VITE_STOREFRONT_URL as string | undefined)?.trim() || 'https://dar-alfath-client.vercel.app'
).replace(/\/+$/, '');

/** A book's (or bundle's) page in the store. */
export const storefrontBookUrl = (productId: string) => `${STOREFRONT_URL}/book/${encodeURIComponent(productId)}`;
