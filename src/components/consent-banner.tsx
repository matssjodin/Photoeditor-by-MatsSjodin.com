import { useEffect, useState } from "react";

// Bump the suffix to re-show the notice if the wording materially changes.
const STORAGE_KEY = "pe-notice-ack-v1";

/**
 * One-time, dismissible site notice. Renders nothing during SSR / before mount
 * (the acknowledgement lives in localStorage) so there's no hydration mismatch.
 * It's a notice, not a gate — the editor stays usable behind it.
 */
export function ConsentBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "1") setShow(true);
    } catch {
      // localStorage blocked (e.g. private mode): show, but we can't persist.
      setShow(true);
    }
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignore — dismissing for this session is still useful.
    }
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notice-title"
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl"
      >
        <h2 id="notice-title" className="text-base font-semibold text-foreground">
          Welcome to Photo Editor
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          This editor runs{" "}
          <span className="font-medium text-foreground">entirely in your browser</span>
          —your images and edits never leave your device and nothing is uploaded. Only small
          preferences (like dismissing this notice) are stored locally in your browser.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The site may use privacy-friendly, cookieless analytics to count visits and may report
          errors to help fix bugs. The software is provided free, &ldquo;as is&rdquo;, without
          warranties of any kind.
        </p>
        <button
          type="button"
          autoFocus
          onClick={dismiss}
          className="mt-5 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
