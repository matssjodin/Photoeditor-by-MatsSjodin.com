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
    <div
      role="region"
      aria-label="Site notice"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-card/95 px-4 py-3 backdrop-blur"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">
            Photo Editor runs entirely in your browser.
          </span>{" "}
          Your images and edits never leave your device — nothing is uploaded. Only small
          preferences (like this dismissal) are stored locally in your browser. This site may use
          privacy-friendly, cookieless analytics to count visits and may report errors to help fix
          bugs. The software is provided free, &ldquo;as is&rdquo;, without warranties of any kind.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 self-start rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 sm:self-auto"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
