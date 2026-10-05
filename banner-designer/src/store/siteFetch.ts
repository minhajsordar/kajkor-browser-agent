/**
 * Thin fetch wrapper kept under its old name so call sites don't churn.
 * The CMS version injected an x-site-id header for tenant resolution;
 * the banner designer is single-tenant so this is a plain passthrough.
 */
export async function siteFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, init);
}
