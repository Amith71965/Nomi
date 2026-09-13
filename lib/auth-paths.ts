/**
 * Post-authentication destinations. Only paths inside the app are accepted so
 * a crafted `?next=` can never send a fresh session to another site.
 */
const APP_PATH = /^\/app(\/[A-Za-z0-9_\-/]*)?(\?[A-Za-z0-9_\-=&%]*)?$/;

export const DEFAULT_AFTER_LOGIN = "/app";
export const DEFAULT_AFTER_SIGNUP = "/app/connections?welcome=1";

export function safeAppPath(candidate: string | undefined | null, fallback: string = DEFAULT_AFTER_LOGIN): string {
  if (!candidate) return fallback;
  return APP_PATH.test(candidate) ? candidate : fallback;
}
