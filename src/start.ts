import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

/**
 * Content-Security-Policy tuned for this app's actual needs:
 *  - SSR hydration injects inline <script>/<style>, so 'unsafe-inline' is required
 *    (TanStack Start does not wire nonces through the Lovable preset).
 *  - Images come from the user's own files as blob:/data: URLs (drag-drop / open)
 *    and canvas exports; layer thumbnails use data: URLs.
 *  - Fonts are served from Google Fonts (fonts.googleapis.com / fonts.gstatic.com).
 *  - Plausible (https://plausible.io) is allowed for the optional, cookieless
 *    analytics script — the script only loads when VITE_PLAUSIBLE_DOMAIN is set,
 *    but allowing the origin here keeps that purely an env toggle.
 *  - frame-ancestors 'none' blocks clickjacking (also covered by X-Frame-Options).
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "script-src 'self' 'unsafe-inline' https://plausible.io",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "connect-src 'self' https://plausible.io",
  "worker-src 'self' blob:",
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy": CSP,
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  // 180 days. No preload — keep the option to revert to HTTP if ever needed.
  "strict-transport-security": "max-age=15552000; includeSubDomains",
};

function applySecurityHeaders(headers: Headers): void {
  try {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(key, value);
    }
  } catch {
    // Some runtimes expose immutable header sets on certain responses; never let
    // header hardening break the actual response.
  }
}

const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next();
  applySecurityHeaders(result.response.headers);
  return result;
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    const response = new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    applySecurityHeaders(response.headers);
    return response;
  }
});

export const startInstance = createStart(() => ({
  // Order matters: the error middleware runs outermost so it can catch throws
  // from inner middleware; the security-headers middleware then stamps headers
  // onto whatever response comes back from the handler.
  requestMiddleware: [errorMiddleware, securityHeadersMiddleware],
}));
