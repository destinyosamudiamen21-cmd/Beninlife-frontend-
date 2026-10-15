import { useEffect, useState, type FormEvent } from "react";
import { register, signIn, signOut, whoAmI } from "./api/auth";
import type { Player } from "./api/players";
import { Game } from "./game/Game";

type Mode = "signin" | "register";

/**
 * The way in: sign in with an email and a password, or make an account. A browser that is
 * already signed in goes straight into the city.
 */
export default function App() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    void whoAmI().then((signed) => {
      if (!live) return;
      if (signed) setPlayer(signed.player);
      setChecking(false);
    });
    return () => {
      live = false;
    };
  }, []);

  if (player) {
    return (
      <Game
        player={player}
        onSignOut={() => {
          void signOut().then(() => setPlayer(null));
        }}
      />
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Type your email and your password.");
      return;
    }
    if (mode === "register" && username.trim().length < 3) {
      setError("Pick a username of at least 3 characters.");
      return;
    }
    if (mode === "register" && password.length < 8) {
      setError("A password is at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const signed = mode === "register" ? await register(email.trim(), password, username.trim()) : await signIn(email.trim(), password);
      setPlayer(signed.player);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not sign in.");
    } finally {
      setLoading(false);
    }
  };

  const switchTo = (next: Mode) => {
    setMode(next);
    setError("");
  };

  return (
    <div className="gate">
      <style>{`
        .gate { position: fixed; inset: 0; overflow-y: auto; display: grid; place-items: center; padding: 24px 16px 140px; color: #fff;
          font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", system-ui, sans-serif;
          background: linear-gradient(180deg, #2a0f3d 0%, #7a1f4b 42%, #e2553a 72%, #f9a03f 100%); }
        .gate-skyline { position: fixed; left: 0; right: 0; bottom: 0; height: 170px; pointer-events: none; }
        .gate-card { position: relative; z-index: 1; width: min(380px, 100%); display: flex; flex-direction: column; gap: 14px; }
        .gate-title { text-align: center; margin-bottom: 10px; }
        .gate-title h1 { font-size: clamp(44px, 12vw, 64px); font-weight: 900; letter-spacing: -0.045em; line-height: 0.95; }
        .gate-title h1 span { color: #f5c400; }
        .gate-title p { margin-top: 10px; font-size: 16px; color: rgba(255, 255, 255, 0.82); }
        .gate-panel { background: rgba(18, 8, 26, 0.72); -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px); border-radius: 24px;
          padding: 18px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35); }
        .gate-tabs { display: grid; grid-template-columns: 1fr 1fr; background: rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 4px; }
        .gate-tabs button { border: none; background: none; color: rgba(255, 255, 255, 0.75); font: inherit; font-weight: 700; font-size: 15px; padding: 10px; border-radius: 11px; cursor: pointer; }
        .gate-tabs button[aria-pressed="true"] { background: #fff; color: #1a0b24; }
        .gate label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; color: rgba(255, 255, 255, 0.8); }
        .gate input { border: 1.5px solid rgba(255, 255, 255, 0.18); background: rgba(255, 255, 255, 0.08); color: #fff; border-radius: 12px; padding: 13px 14px;
          font: inherit; font-size: 16px; }
        .gate input::placeholder { color: rgba(255, 255, 255, 0.4); }
        .gate input:focus { outline: none; border-color: #f5c400; background: rgba(255, 255, 255, 0.12); }
        .gate-go { border: none; border-radius: 14px; background: #f5c400; color: #1a0b24; font: inherit; font-weight: 800; font-size: 17px; padding: 15px; cursor: pointer;
          box-shadow: 0 4px 0 #b88f00; }
        .gate-go:active { transform: translateY(2px); box-shadow: 0 2px 0 #b88f00; }
        .gate-go:disabled { opacity: 0.6; }
        .gate-go:focus-visible, .gate-tabs button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
        .gate-error { background: rgba(255, 59, 48, 0.18); border-radius: 10px; padding: 9px 12px; font-size: 14px; font-weight: 600; color: #ffd4d1; }
        .gate-small { text-align: center; font-size: 13px; color: rgba(255, 255, 255, 0.7); }
        .gate-small button { border: none; background: none; color: #f5c400; font: inherit; font-weight: 700; cursor: pointer; padding: 0; }
        .gate-keke { animation: gate-drive 14s linear infinite; }
        @keyframes gate-drive { from { transform: translateX(-160px); } to { transform: translateX(110vw); } }
        @media (prefers-reduced-motion: reduce) { .gate-keke { animation: none; transform: translateX(20vw); } }
      `}</style>

      {/* Benin at dusk: rooftops, the flyover on its pillars, and a keke going home. */}
      <svg className="gate-skyline" viewBox="0 0 1200 170" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <path
          fill="#1a0b24"
          d="M0 170V112h40V96h36v20h30V84h44v30h26V70h50v44h22V98h40v16h30V58h60v56h20V90h44v24h36V76h40v38h30V100h46v14h40V64h56v50h24V92h40v22h30V80h52v34h26V104h40v10h44V72h50v42h30V96h42v74z"
        />
        <g fill="#24102f">
          <rect x="0" y="128" width="1200" height="9" />
          {[120, 330, 540, 750, 960].map((x) => (
            <rect key={x} x={x} y="137" width="14" height="33" />
          ))}
        </g>
        <g fill="#f5c400" opacity="0.85">
          {[60, 180, 300, 420, 540, 660, 780, 900, 1020, 1140].map((x) => (
            <rect key={x} x={x} y="122" width="3" height="6" />
          ))}
        </g>
        <g className="gate-keke">
          <path fill="#f5c400" d="M8 118c0-10 8-18 18-18h22l16 14v10H8z" />
          <rect x="8" y="118" width="56" height="8" fill="#c8102e" />
          <circle cx="18" cy="128" r="5" fill="#0e0612" />
          <circle cx="54" cy="128" r="5" fill="#0e0612" />
          <rect x="40" y="104" width="10" height="9" fill="#1a0b24" />
        </g>
      </svg>

      <form className="gate-card" onSubmit={submit}>
        <div className="gate-title">
          <h1>
            Benin<span>life</span>
          </h1>
          <p>Live it in Benin City, with your people.</p>
        </div>
        <div className="gate-panel">
          <div className="gate-tabs" role="group" aria-label="Sign in or make an account">
            <button type="button" aria-pressed={mode === "signin"} onClick={() => switchTo("signin")}>
              Sign in
            </button>
            <button type="button" aria-pressed={mode === "register"} onClick={() => switchTo("register")}>
              Create account
            </button>
          </div>
          {mode === "register" && (
            <label>
              Username
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="what the city calls you" maxLength={20} autoCapitalize="none" autoComplete="username" />
            </label>
          )}
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" autoCapitalize="none" />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? "at least 8 characters" : "your password"}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
          </label>
          {error && (
            <p className="gate-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="gate-go" disabled={loading || checking}>
            {checking ? "One moment…" : loading ? (mode === "register" ? "Making your account…" : "Signing in…") : mode === "register" ? "Create account" : "Enter the city"}
          </button>
        </div>
        <p className="gate-small">
          {mode === "signin" ? (
            <>
              New here?{" "}
              <button type="button" onClick={() => switchTo("register")}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Have an account?{" "}
              <button type="button" onClick={() => switchTo("signin")}>
                Sign in
              </button>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
