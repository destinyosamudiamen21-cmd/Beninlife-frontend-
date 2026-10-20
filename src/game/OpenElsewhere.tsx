import { Component, useState, type ReactNode } from "react";
import { copyLink, inAppBrowser } from "./browserCheck";

/** "Open it in Safari or Chrome": how, for this phone, and a button that copies the link. */
export function OpenElsewhere({ why, compact = false }: { why: string; compact?: boolean }) {
  const [copied, setCopied] = useState<"" | "yes" | "no">("");
  const app = inAppBrowser();
  const iphone = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const how = app
    ? `In ${app}, tap ••• (top or bottom corner), then "Open in browser"${iphone ? " or \"Open in Safari\"" : ""}.`
    : `Open ${window.location.host} in ${iphone ? "Safari" : "Chrome"}.`;
  return (
    <div className={compact ? "open-elsewhere compact" : "open-elsewhere"} role="alert">
      <style>{`
        .open-elsewhere { background: #fff4d6; color: #2b1d0e; border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 8px;
          font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", system-ui, sans-serif; font-size: 14px; line-height: 1.45; text-align: left; }
        .open-elsewhere strong { font-size: 16px; }
        .open-elsewhere button { align-self: flex-start; border: none; border-radius: 12px; padding: 10px 14px; font: inherit; font-weight: 800; background: #1a0b24; color: #fff; cursor: pointer; }
        .open-elsewhere.compact { padding: 11px 12px; font-size: 13px; }
        .open-elsewhere.compact strong { font-size: 14px; }
      `}</style>
      <strong>{why}</strong>
      <span>{how}</span>
      <button type="button" onClick={() => void copyLink().then((ok) => setCopied(ok ? "yes" : "no"))}>
        {copied === "yes" ? "Link copied: paste it in your browser" : copied === "no" ? window.location.host : "Copy the link"}
      </button>
    </div>
  );
}

/** A full screen for when the game cannot run here (no 3D), or has broken. */
export function CannotRun({ why, reload = false }: { why: string; reload?: boolean }) {
  return (
    <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", padding: 20, overflowY: "auto",
      background: "linear-gradient(180deg, #2a0f3d 0%, #7a1f4b 55%, #e2553a 100%)" }}>
      <div style={{ width: "min(380px, 100%)", display: "flex", flexDirection: "column", gap: 12 }}>
        <OpenElsewhere why={why} />
        {reload && (
          <button type="button" onClick={() => window.location.reload()}
            style={{ border: "none", borderRadius: 14, padding: 14, fontWeight: 800, fontSize: 16, background: "#f5c400", color: "#1a0b24" }}>
            Reload the game
          </button>
        )}
      </div>
    </div>
  );
}

/** If the game breaks, a way back in instead of a blank screen. */
export class GameGuard extends Component<{ children: ReactNode }, { broken: boolean }> {
  state = { broken: false };

  static getDerivedStateFromError() {
    return { broken: true };
  }

  componentDidCatch(error: unknown) {
    console.error("The game broke:", error);
  }

  render() {
    if (this.state.broken) {
      return <CannotRun reload why="Something went wrong. Reload the game; if it keeps happening, open it in Safari or Chrome." />;
    }
    return this.props.children;
  }
}
