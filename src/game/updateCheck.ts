// Is there a newer build of the game than the one this tab is running?
//
// Vercel serves a fresh index.html with every deploy, and that page names the new script by
// its hash (/assets/index-<hash>.js). A tab that was opened before the deploy is still running
// the old script while the server sends it new maps and new rules, which is how doors end
// up "not opening". So, every few minutes (and whenever the tab comes back into view), fetch
// the page, read which script it names, and compare it with the one this tab loaded.

import { useEffect, useState } from "react";

const EVERY_MS = 5 * 60 * 1000;
const SCRIPT = /<script[^>]+src="([^"]*\/assets\/[^"]+\.js)"/;

function runningScript(): string | null {
  const tag = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]');
  if (!tag) return null; // the dev server: nothing to compare
  return new URL(tag.src, window.location.href).pathname;
}

export async function newerBuild(): Promise<boolean> {
  const mine = runningScript();
  if (!mine) return false;
  try {
    const res = await fetch(`/?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return false;
    const found = SCRIPT.exec(await res.text());
    if (!found) return false;
    return new URL(found[1], window.location.href).pathname !== mine;
  } catch {
    return false; // offline: say nothing
  }
}

/** True once a newer build is out. It stays true: the tab only gets newer by reloading. */
export function useNewVersion(): boolean {
  const [newer, setNewer] = useState(false);
  useEffect(() => {
    if (newer) return;
    let live = true;
    const look = () => {
      void newerBuild().then((yes) => {
        if (live && yes) setNewer(true);
      });
    };
    const timer = window.setInterval(look, EVERY_MS);
    const back = () => {
      if (document.visibilityState === "visible") look();
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", back);
    };
  }, [newer]);
  return newer;
}
