import type { Crew } from "../api/crew";
import { Face } from "./phoneKit";

type Props = {
  crew: Crew | null;
  /** True while an answer is on its way to the server. */
  busy: boolean;
  onAccept: (fromId: string) => void;
  onDecline: (fromId: string) => void;
  onLeave: () => void;
  /** False while something else fills the screen (the map, the phone): only an invite still shows. */
  showCrew: boolean;
};

/**
 * Moving about with friends, on the screen: an invite waiting for an answer (big, at the
 * top, because it is a question), and the friends in the crew (small, by the needs panel,
 * because it is only a reminder of who is with you).
 */
export function CrewBar({ crew, busy, onAccept, onDecline, onLeave, showCrew }: Props) {
  if (!crew || (crew.members.length === 0 && crew.invites.length === 0)) return null;
  const invite = crew.invites[0];
  return (
    <>
      <style>{`
        .crew-invite { position: absolute; z-index: 22; bottom: calc(84px + env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); width: min(360px, calc(100vw - 32px));
          background: rgba(28, 28, 30, 0.94); color: #fff; border-radius: 22px; padding: 14px; display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); animation: crew-drop 0.3s ease-out; }
        .crew-invite p { flex: 1; min-width: 0; font-size: 14px; line-height: 1.3; }
        .crew-invite p strong { display: block; font-size: 15px; }
        .crew-invite p span { color: #aeaeb2; font-size: 13px; }
        .crew-invite .answers { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .crew-invite button { border: none; border-radius: 999px; padding: 9px 14px; font: inherit; font-weight: 700; font-size: 14px; cursor: pointer; }
        .crew-invite .yes { background: #34c759; color: #fff; }
        .crew-invite .no { background: rgba(255, 255, 255, 0.14); color: #fff; }
        .crew-invite .ph-face, .crew-with .ph-face { position: relative; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 700; flex-shrink: 0; }
        .crew-invite .ph-face i, .crew-with .ph-face i { position: absolute; right: -1px; bottom: -1px; width: 10px; height: 10px; border-radius: 50%; background: #34c759; border: 2px solid #fff; }
        .crew-invite .ph-face i { border-color: #1c1c1e; }
        .crew-with { position: absolute; z-index: 12; left: calc(16px + env(safe-area-inset-left)); top: calc(300px + env(safe-area-inset-top)); display: flex; align-items: center; gap: 6px; padding: 6px 6px 6px 10px;
          background: rgba(255, 255, 255, 0.92); border-radius: 999px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15); font-size: 13px; font-weight: 700; color: #1c1c1e; }
        .crew-with .faces { display: flex; }
        .crew-with .faces > * + * { margin-left: -8px; }
        .crew-with .ph-face { box-shadow: 0 0 0 2px #fff; }
        .crew-with button { border: none; background: #f2f2f7; color: #ff3b30; border-radius: 999px; padding: 5px 10px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
        @keyframes crew-drop { from { transform: translate(-50%, 16px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .crew-invite { animation: none; } }
      `}</style>
      {invite && (
        <div className="crew-invite" role="alertdialog" aria-label={`@${invite.name} wants you to roll with them`}>
          <Face name={invite.name} online size={40} />
          <p>
            <strong>@{invite.name} wants you to roll with them</strong>
            <span>{invite.where ? `They are at ${invite.where}.` : "Say yes and you go to them."}</span>
          </p>
          <div className="answers">
            <button type="button" className="no" disabled={busy} onClick={() => onDecline(invite.from_id)}>
              Not now
            </button>
            <button type="button" className="yes" disabled={busy} onClick={() => onAccept(invite.from_id)}>
              Go
            </button>
          </div>
        </div>
      )}
      {showCrew && crew.members.length > 0 && (
        <div className="crew-with" aria-label="Your crew">
          <span className="faces">
            {crew.members.map((member) => (
              <Face key={member.id} name={member.username} online={member.online} size={26} />
            ))}
          </span>
          <span>
            With {crew.members.length === 1 ? `@${crew.members[0].username}` : `${crew.members.length} friends`}
          </span>
          <button type="button" disabled={busy} onClick={onLeave}>
            Leave
          </button>
        </div>
      )}
    </>
  );
}
