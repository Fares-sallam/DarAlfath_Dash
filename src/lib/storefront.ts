/**
 * Where the customer-facing store lives, for the links that open it from here. Set
 * VITE_STOREFRONT_URL when the store moves to its own domain; the default is the store's own path on the custom domain.
 */
export const STOREFRONT_URL = (
  (import.meta.env.VITE_STOREFRONT_URL as string | undefined)?.trim() || 'https://darolfath.com/store'
).replace(/\/+$/, '');

/** The company links page: it is the front page of the domain, the store itself lives below /store. */
export const LINKS_PAGE_URL = (() => {
  try {
    return `${new URL(STOREFRONT_URL).origin}/`;
  } catch {
    return `${STOREFRONT_URL}/`;
  }
})();

/** A book's (or bundle's) page in the store. */
export const storefrontBookUrl = (productId: string) => `${STOREFRONT_URL}/book/${encodeURIComponent(productId)}`;
