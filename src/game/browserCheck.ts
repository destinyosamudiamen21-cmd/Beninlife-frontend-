// Can this browser run the game? The apps people share links in (TikTok, Instagram, Facebook,
// Snapchat, X) open them in a browser of their own, and some of those cannot draw 3D
// (WebGL), keep a sign-in, or play sound: there the game is a blank screen. These say which
// app it is, so the page can tell the player to open it in Safari or Chrome instead.

const IN_APP: [RegExp, string][] = [
  [/musical_ly|BytedanceWebview|TikTok|trill_/i, "TikTok"],
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, "Facebook"],
  [/Snapchat/i, "Snapchat"],
  [/Twitter/i, "X"],
  [/Line\//i, "LINE"],
];

/** The app whose own browser this is ("TikTok"), or null in an ordinary browser. */
export function inAppBrowser(agent: string = navigator.userAgent): string | null {
  for (const [pattern, name] of IN_APP) if (pattern.test(agent)) return name;
  return null;
}

/** Can this browser draw the city (WebGL)? Asked once. */
let webgl: boolean | null = null;
export function canDraw3D(): boolean {
  if (webgl !== null) return webgl;
  try {
    const canvas = document.createElement("canvas");
    webgl = Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    webgl = false;
  }
  return webgl;
}

/** Copy the game's address, for pasting into Safari or Chrome. True if it was copied. */
export async function copyLink(): Promise<boolean> {
  const link = window.location.origin + "/";
  try {
    await navigator.clipboard.writeText(link);
    return true;
  } catch {
    try {
      const box = document.createElement("textarea");
      box.value = link;
      box.style.position = "fixed";
      box.style.opacity = "0";
      document.body.appendChild(box);
      box.select();
      const done = document.execCommand("copy");
      box.remove();
      return done;
    } catch {
      return false;
    }
  }
}
