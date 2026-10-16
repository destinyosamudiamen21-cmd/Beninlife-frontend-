import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  buildRoom,
  buyItem,
  demolishRoom,
  finishRoom,
  moveItem,
  nextStage,
  quoteRoom,
  sellItem,
  type FurnitureOption,
  type Home,
  type HomeChange,
  type PlacedItem,
  type Room,
  type RoomQuote,
  type RoomShape,
  type Spot,
} from "../api/home";
import { sellPrice } from "./homeDecor";
import {
  buildCam,
  buildInput,
  cellAt,
  centredSpot,
  clock,
  EMPTY_VIEW,
  frameHouse,
  naira,
  nearestFreeSpot,
  pieceAt,
  pieceProblem,
  roomSpotNear,
  roomUnder,
  screenSteps,
  type BuildView,
} from "./homeBuild";
import { STAGE_SECONDS } from "./homeGeometry";
import { floorPrice, isDone, paintPrice, ROOM_SIZES, serverNow, stageProgress, whyNoRoom } from "./homeRooms";
import { ItemIcon } from "./ItemIcon";

type Tab = "buy" | "rooms" | "paint";
type Placing = { option: FurnitureOption; spot: Spot; moving: PlacedItem | null };
type Draft = { shape: RoomShape; name: string; quote: RoomQuote | null };

const STAGE_NAMES = ["Foundation", "Blockwork", "Roofing", "Plastering and painting"];

type Props = {
  playerId: string;
  home: Home;
  floor: number;
  money: number;
  onChange: (change: HomeChange) => void;
  /** What the scene should draw over the house. */
  onView: (view: BuildView) => void;
  /** Go up or down a floor while building. */
  onFloor: (floor: number) => void;
  onDone: () => void;
};

/**
 * Build mode, as in The Sims. The camera is up above the house. Three tabs:
 *  - Buy: the catalogue. Pick a piece, it appears where it fits; tap the floor or use the
 *    arrows to move it, turn it, and buy it. Tap a piece already there to move, turn or sell it.
 *  - Rooms: lay out a new room against the house, see the bill for every stage, and pay
 *    the workers stage by stage as they go.
 *  - Paint: tap a room, try paints and floors on it, and keep the one you like.
 * The server checks everything again.
 */
export function BuildPanel({ playerId, home, floor, money, onChange, onView, onFloor, onDone }: Props) {
  const [tab, setTab] = useState<Tab>("buy");
  const [group, setGroup] = useState<string>(home.catalogue[0]?.group ?? "");
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [selected, setSelected] = useState<PlacedItem | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sizeIndex, setSizeIndex] = useState(2);
  const [paintRoom, setPaintRoom] = useState<Room | null>(null);
  const [trying, setTrying] = useState<{ wall?: string; ground?: string } | null>(null);
  const [confirm, setConfirm] = useState<"sell" | "demolish" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [, setTick] = useState(0);

  const options = useMemo(() => new Map(home.catalogue.map((option) => [option.id, option])), [home.catalogue]);
  const groups = useMemo(() => [...new Set(home.catalogue.map((option) => option.group))], [home.catalogue]);
  const shown = useMemo(() => home.catalogue.filter((option) => option.group === group), [home.catalogue, group]);
  const storeys = home.plan.floors.length;
  const building = home.rooms.filter((room) => !isDone(room));

  // Start where the house is.
  useEffect(() => {
    frameHouse(home, floor);
    // Only when building starts or the floor changes, not on every change to the house.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor]);

  // A clock for the workers: the countdown and the "pay for the next stage" button keep time.
  useEffect(() => {
    if (building.length === 0) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [building.length]);

  const flash = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast((now) => (now === text ? "" : now)), 2600);
  };

  // ---- what the scene draws ---------------------------------------------------------
  const ghostOk = placing ? !pieceProblem(home, placing.option, placing.spot, placing.moving?.id ?? null) : false;
  const ghostWhy = placing ? pieceProblem(home, placing.option, placing.spot, placing.moving?.id ?? null) : null;
  const draftWhy = draft ? whyNoRoom(home.plan, home.rooms, draft.shape) : null;
  useEffect(() => {
    onView({
      ...EMPTY_VIEW,
      ghost: placing ? { option: placing.option, spot: placing.spot, ok: ghostOk } : null,
      moving: placing?.moving?.id ?? null,
      selected: selected?.id ?? null,
      room: draft ? { shape: draft.shape, ok: !draftWhy } : null,
      selectedRoom: tab === "paint" ? paintRoom?.id ?? null : null,
      preview: paintRoom && trying ? { roomId: paintRoom.id, ...trying } : null,
    });
  }, [placing, ghostOk, selected, draft, draftWhy, paintRoom, trying, tab, onView]);
  useEffect(() => () => onView(EMPTY_VIEW), [onView]);

  // ---- talking to the server --------------------------------------------------------
  const send = async (work: () => Promise<HomeChange>, fallback: string, after?: () => void) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      onChange(await work());
      after?.();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : fallback);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  // ---- furniture --------------------------------------------------------------------
  const startPlacing = (option: FurnitureOption, moving: PlacedItem | null = null) => {
    setError("");
    setSelected(null);
    setDraft(null);
    const rot = moving?.rot ?? 0;
    const at = moving ? { cx: moving.x, cz: moving.z } : cellAt(home, buildCam.x, buildCam.z);
    const spot = moving ? { floor, x: moving.x, z: moving.z, rot } : nearestFreeSpot(home, option, rot, floor, at.cx, at.cz, null);
    setPlacing({ option, spot, moving });
  };
  const moveGhost = (dx: number, dz: number) =>
    setPlacing((now) => (now ? { ...now, spot: { ...now.spot, x: now.spot.x + dx, z: now.spot.z + dz } } : now));
  const turnGhost = () =>
    setPlacing((now) => {
      if (!now) return now;
      const rot = (now.spot.rot + 1) % 4;
      const middle = { cx: now.spot.x + Math.floor(now.option.w / 2), cz: now.spot.z + Math.floor(now.option.d / 2) };
      return { ...now, spot: centredSpot(now.option, rot, floor, middle.cx, middle.cz) };
    });
  const placeIt = () => {
    if (!placing || !ghostOk) return;
    const { option, spot, moving } = placing;
    if (moving) {
      void send(() => moveItem(playerId, moving.id, spot), "Could not move it.", () => {
        setPlacing(null);
        flash(`${option.name} moved`);
      });
    } else {
      void send(() => buyItem(playerId, option.id, spot), "Could not buy it.", () => {
        setPlacing(null);
        flash(`${option.name} bought · ${naira(option.price)}`);
      });
    }
  };
  const turnSelected = () => {
    if (!selected) return;
    const option = options.get(selected.item);
    if (!option) return;
    const rot = (selected.rot + 1) % 4;
    const middle = { cx: selected.x + Math.floor(option.w / 2), cz: selected.z + Math.floor(option.d / 2) };
    const spot = centredSpot(option, rot, floor, middle.cx, middle.cz);
    const why = pieceProblem(home, option, spot, selected.id);
    if (why) {
      setError(`It will not turn there: ${why}`);
      return;
    }
    void send(() => moveItem(playerId, selected.id, spot), "Could not turn it.", () => setSelected({ ...selected, ...spot }));
  };

  // ---- rooms ------------------------------------------------------------------------
  const startRoom = (index: number) => {
    setError("");
    setSelected(null);
    setPlacing(null);
    setSizeIndex(index);
    const size = ROOM_SIZES[index];
    const at = cellAt(home, buildCam.x, buildCam.z);
    const shape = roomSpotNear(home, floor, size.w, size.d, at.cx, at.cz)
      ?? { floor, x: at.cx - Math.floor(size.w / 2), z: at.cz - Math.floor(size.d / 2), w: size.w, d: size.d };
    setDraft({ shape, name: draft?.name ?? "New room", quote: null });
  };
  const moveRoom = (dx: number, dz: number) =>
    setDraft((now) => (now ? { ...now, quote: null, shape: { ...now.shape, x: now.shape.x + dx, z: now.shape.z + dz } } : now));
  const turnRoom = () =>
    setDraft((now) => (now ? { ...now, quote: null, shape: { ...now.shape, w: now.shape.d, d: now.shape.w } } : now));

  // Ask the server for the bill whenever the room being laid out settles somewhere it can go.
  const quoteFor = useRef("");
  useEffect(() => {
    if (!draft || draftWhy) return;
    const key = JSON.stringify(draft.shape);
    if (quoteFor.current === key && draft.quote) return;
    const timer = window.setTimeout(() => {
      quoteFor.current = key;
      quoteRoom(playerId, { ...draft.shape, name: draft.name })
        .then((quote) => setDraft((now) => (now && JSON.stringify(now.shape) === key ? { ...now, quote } : now)))
        .catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, draftWhy, playerId]);

  const startBuilding = () => {
    if (!draft || draftWhy) return;
    const name = draft.name.trim() || "New room";
    void send(() => buildRoom(playerId, { ...draft.shape, name }), "Could not start building.", () => {
      setDraft(null);
      flash(`The workers have started on the ${name}`);
    });
  };

  // ---- taps on the house ------------------------------------------------------------
  const tapped = useCallback(
    (x: number, z: number) => {
      const { cx, cz } = cellAt(home, x, z);
      setError("");
      if (placing) {
        const spot = centredSpot(placing.option, placing.spot.rot, floor, cx, cz);
        const same = spot.x === placing.spot.x && spot.z === placing.spot.z;
        if (same) placeIt(); // a second tap on the same place puts it down
        else setPlacing({ ...placing, spot });
        return;
      }
      if (draft) {
        setDraft({ ...draft, quote: null, shape: { ...draft.shape, x: cx - Math.floor(draft.shape.w / 2), z: cz - Math.floor(draft.shape.d / 2) } });
        return;
      }
      if (tab === "paint") {
        const room = roomUnder(home.rooms, floor, cx, cz);
        setPaintRoom(room && isDone(room) ? room : null);
        setTrying(null);
        return;
      }
      const piece = pieceAt(home, floor, x, z);
      setSelected(piece);
      setConfirm(null);
      if (piece) setTab("buy");
    },
    // placeIt reads the same state as this; it is made fresh on every render with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [home, floor, placing, draft, tab],
  );
  useEffect(() => {
    buildInput.onTap = tapped;
    return () => {
      if (buildInput.onTap === tapped) buildInput.onTap = null;
    };
  }, [tapped]);

  // The keyboard: arrows move, R turns, Enter puts down, Escape lets go, Delete sells.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.tagName === "INPUT") return;
      const steps = screenSteps(buildCam.yaw);
      const step: Record<string, [number, number]> = {
        ArrowUp: steps.up, ArrowDown: [-steps.up[0], -steps.up[1]], ArrowRight: steps.right, ArrowLeft: [-steps.right[0], -steps.right[1]],
      };
      if (step[event.key] && (placing || draft)) {
        event.preventDefault();
        const [dx, dz] = step[event.key];
        if (placing) moveGhost(dx, dz);
        else moveRoom(dx, dz);
      } else if (event.key === "r" || event.key === "R") {
        if (placing) turnGhost();
        else if (draft) turnRoom();
        else if (selected) turnSelected();
      } else if (event.key === "Enter") {
        if (placing) placeIt();
      } else if (event.key === "Escape") {
        setPlacing(null);
        setDraft(null);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const nudge = (direction: "up" | "down" | "left" | "right") => {
    const steps = screenSteps(buildCam.yaw);
    const [dx, dz] = direction === "up" ? steps.up : direction === "down" ? [-steps.up[0], -steps.up[1]] : direction === "right" ? steps.right : [-steps.right[0], -steps.right[1]];
    if (placing) moveGhost(dx, dz);
    else if (draft) moveRoom(dx, dz);
  };

  const turnCamera = (quarter: number) => {
    buildCam.yaw += (quarter * Math.PI) / 2;
  };
  const zoom = (factor: number) => {
    buildCam.dist = Math.max(5, Math.min(46, buildCam.dist * factor));
  };

  // ---- pieces of the panel ------------------------------------------------------------
  const pad = (
    <div className="bld-pad" aria-label="Move it">
      <button type="button" className="bld-arrow up" onClick={() => nudge("up")} aria-label="Move up">▲</button>
      <button type="button" className="bld-arrow left" onClick={() => nudge("left")} aria-label="Move left">◀</button>
      <button type="button" className="bld-arrow right" onClick={() => nudge("right")} aria-label="Move right">▶</button>
      <button type="button" className="bld-arrow down" onClick={() => nudge("down")} aria-label="Move down">▼</button>
    </div>
  );

  const selectedOption = selected ? options.get(selected.item) : undefined;
  const now = serverNow();

  let body: ReactNode;
  if (placing) {
    const affordable = placing.moving || placing.option.price <= money;
    body = (
      <div className="bld-act">
        <div className="bld-act-head">
          <ItemIcon option={placing.option} cell={home.plan.cell} size={44} />
          <div>
            <strong>{placing.option.name}</strong>
            <span className={ghostWhy ? "bld-no" : "bld-ok"}>
              {ghostWhy ?? (placing.moving ? "Fits here. Tap again or press Put down." : "Fits here. Tap the same spot again to buy.")}
            </span>
          </div>
        </div>
        <div className="bld-act-row">
          {pad}
          <div className="bld-act-buttons">
            <button type="button" onClick={turnGhost}>Turn ⟳</button>
            <button type="button" className="bld-go" onClick={placeIt} disabled={!ghostOk || busy || !affordable}>
              {placing.moving ? "Put down" : affordable ? `Buy · ${naira(placing.option.price)}` : `Need ${naira(placing.option.price)}`}
            </button>
            <button type="button" onClick={() => setPlacing(null)}>Cancel</button>
          </div>
        </div>
      </div>
    );
  } else if (draft) {
    const size = ROOM_SIZES[sizeIndex];
    body = (
      <div className="bld-act">
        <div className="bld-act-head">
          <div>
            <strong>
              New room · {(draft.shape.w * home.plan.cell).toFixed(1)} m × {(draft.shape.d * home.plan.cell).toFixed(1)} m
            </strong>
            <span className={draftWhy ? "bld-no" : "bld-ok"}>{draftWhy ?? (draft.quote ? `All four stages: ${naira(draft.quote.total)}` : "Working out the bill…")}</span>
          </div>
        </div>
        <label className="bld-name">
          Name
          <input value={draft.name} maxLength={30} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
        {draft.quote && !draftWhy && (
          <details className="bld-bill">
            <summary>
              Foundation now: <strong>{naira(draft.quote.bills[0].total)}</strong> · then {draft.quote.bills.slice(1).map((bill) => naira(bill.total)).join(", ")}
            </summary>
            {draft.quote.bills.map((bill) => (
              <div key={bill.stage} className="bld-bill-stage">
                <p>
                  {bill.stage}. {bill.title} <span>{naira(bill.total)} · {clock(bill.seconds)}</span>
                </p>
                <ul>
                  {bill.lines.map((line) => (
                    <li key={line.name}>
                      {line.qty > 1 ? `${line.qty} × ` : ""}
                      {line.name} <span>{naira(line.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
        )}
        <div className="bld-act-row">
          {pad}
          <div className="bld-act-buttons">
            <button type="button" onClick={turnRoom}>Turn ⟳</button>
            <button
              type="button"
              className="bld-go"
              onClick={startBuilding}
              disabled={Boolean(draftWhy) || busy || !draft.quote || draft.quote.bills[0].total > money}
            >
              {draft.quote && draft.quote.bills[0].total > money ? `Need ${naira(draft.quote.bills[0].total)}` : "Start building"}
            </button>
            <button type="button" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
        <p className="bld-hint">{size.label}. Tap the ground where it should go, or use the arrows. It has to share at least 1 m of wall with a room.</p>
      </div>
    );
  } else if (tab === "buy") {
    body = selected && selectedOption ? (
      <div className="bld-act">
        <div className="bld-act-head">
          <ItemIcon option={selectedOption} cell={home.plan.cell} size={44} />
          <div>
            <strong>{selectedOption.name}</strong>
            <span>{selected.gift ? "Came with the house" : `Sells for ${naira(sellPrice(selectedOption, selected))}`}</span>
          </div>
        </div>
        {confirm === "sell" ? (
          <div className="bld-act-buttons">
            <span className="bld-no">{selected.gift ? "Throw it away? It came free, so it sells for nothing." : `Sell it for ${naira(sellPrice(selectedOption, selected))}?`}</span>
            <button type="button" className="bld-danger" disabled={busy} onClick={() => void send(() => sellItem(playerId, selected.id), "Could not sell it.", () => setSelected(null))}>
              {selected.gift ? "Throw away" : "Sell"}
            </button>
            <button type="button" onClick={() => setConfirm(null)}>Keep it</button>
          </div>
        ) : (
          <div className="bld-act-buttons">
            <button type="button" className="bld-go" onClick={() => startPlacing(selectedOption, selected)}>Move</button>
            <button type="button" onClick={turnSelected} disabled={busy}>Turn ⟳</button>
            <button type="button" onClick={() => setConfirm("sell")}>{selected.gift ? "Throw away" : "Sell"}</button>
            <button type="button" onClick={() => setSelected(null)}>Done</button>
          </div>
        )}
      </div>
    ) : (
      <>
        <div className="bld-chips" role="tablist" aria-label="Kinds of furniture">
          {groups.map((name) => (
            <button key={name} type="button" className={name === group ? "on" : ""} onClick={() => setGroup(name)}>
              {name}
            </button>
          ))}
        </div>
        <div className="bld-tiles">
          {shown.map((option) => (
            <button key={option.id} type="button" className={`bld-tile${option.price > money ? " dear" : ""}`} onClick={() => startPlacing(option)}>
              <ItemIcon option={option} cell={home.plan.cell} />
              <span className="bld-tile-name">{option.name}</span>
              <span className="bld-tile-price">{naira(option.price)}</span>
            </button>
          ))}
        </div>
        <p className="bld-hint">Tap something in the catalogue to place it. Tap a piece in the house to move, turn or sell it.</p>
      </>
    );
  } else if (tab === "rooms") {
    body = (
      <>
        {!home.plan.buildable && <p className="bld-hint">A hostel room cannot be built onto. Rent a place in Ekosodin or BDPA to build.</p>}
        {building.map((room) => {
          const stage = room.stage;
          const ready = room.ready_ms <= now;
          const left = (room.ready_ms - now) / 1000;
          const progress = stageProgress(room, STAGE_SECONDS[stage - 1] ?? 60, now);
          const bill = room.next_bill;
          return (
            <div key={room.id} className="bld-site">
              <div className="bld-site-head">
                <strong>{room.name}</strong>
                <span>
                  Stage {stage} of 4 · {STAGE_NAMES[stage - 1]}
                  {ready ? " · done" : ` · ${clock(left)} left`}
                </span>
              </div>
              <div className="bld-bar"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>
              {ready && bill && (
                <details className="bld-bill" open>
                  <summary>
                    Next: {bill.title} · <strong>{naira(bill.total)}</strong>
                  </summary>
                  <ul>
                    {bill.lines.map((line) => (
                      <li key={line.name}>
                        {line.qty > 1 ? `${line.qty} × ` : ""}
                        {line.name} <span>{naira(line.total)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="bld-act-buttons">
                {ready && bill && (
                  <button type="button" className="bld-go" disabled={busy || bill.total > money} onClick={() => void send(() => nextStage(playerId, room.id), "Could not pay the workers.", () => flash(`${bill.title} started`))}>
                    {bill.total > money ? `Need ${naira(bill.total)}` : `Pay for ${bill.title.toLowerCase()}`}
                  </button>
                )}
                {confirm === "demolish" ? (
                  <>
                    <button type="button" className="bld-danger" disabled={busy} onClick={() => void send(() => demolishRoom(playerId, room.id), "Could not stop it.")}>Stop and clear the site</button>
                    <button type="button" onClick={() => setConfirm(null)}>Keep building</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirm("demolish")}>Stop building</button>
                )}
              </div>
            </div>
          );
        })}
        {home.plan.buildable && building.length === 0 && (
          <>
            <p className="bld-hint">Pick a size, then put it against the house. You pay stage by stage, and the workers take a few minutes over each.</p>
            <div className="bld-sizes">
              {ROOM_SIZES.map((size, index) => (
                <button key={size.label} type="button" onClick={() => startRoom(index)}>
                  <span className="bld-size-box" style={{ width: size.w * 4, height: size.d * 4 }} />
                  {size.label}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="bld-roomlist">
          {home.rooms.filter((room) => room.floor === floor && isDone(room)).map((room) => (
            <span key={room.id} className="bld-roomchip">
              {room.name} · {(room.w * home.plan.cell).toFixed(1)}×{(room.d * home.plan.cell).toFixed(1)} m
              {!room.starter && (
                <button type="button" aria-label={`Knock down ${room.name}`} disabled={busy} onClick={() => void send(() => demolishRoom(playerId, room.id), "Could not knock it down.", () => flash(`${room.name} knocked down`))}>
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
      </>
    );
  } else {
    // Paint and floors.
    const room = paintRoom ? home.rooms.find((entry) => entry.id === paintRoom.id) ?? null : null;
    const wall = trying?.wall && trying.wall !== room?.wall ? home.paints.find((paint) => paint.id === trying.wall) : undefined;
    const ground = trying?.ground && trying.ground !== room?.ground ? home.finishes.find((finish) => finish.id === trying.ground) : undefined;
    const cost = room ? (wall ? paintPrice(room, wall) : 0) + (ground ? floorPrice(room, ground) : 0) : 0;
    body = !room ? (
      <p className="bld-hint">{home.plan.buildable ? "Tap a room to paint its walls or lay a new floor." : "The hostel does not let students paint. Rent a place of your own to decorate it."}</p>
    ) : (
      <div className="bld-paint">
        <div className="bld-act-head">
          <div>
            <strong>{room.name}</strong>
            <span>{cost > 0 ? `Trying it out · ${naira(cost)} to keep it` : "Tap a colour or a floor to try it"}</span>
          </div>
        </div>
        <p className="bld-label">Walls</p>
        <div className="bld-swatches">
          {home.paints.filter((paint) => paint.id !== "hostel").map((paint) => (
            <button
              key={paint.id}
              type="button"
              className={`bld-swatch${(trying?.wall ?? room.wall) === paint.id ? " on" : ""}`}
              style={{ background: paint.hex }}
              title={`${paint.name} · ${naira(paintPrice(room, paint))}`}
              aria-label={`${paint.name}, ${naira(paintPrice(room, paint))}`}
              onClick={() => setTrying({ ...trying, wall: paint.id })}
            />
          ))}
        </div>
        <p className="bld-label">Floor</p>
        <div className="bld-swatches">
          {home.finishes.map((finish) => (
            <button
              key={finish.id}
              type="button"
              className={`bld-swatch floor${(trying?.ground ?? room.ground) === finish.id ? " on" : ""}`}
              style={{ background: `repeating-conic-gradient(${finish.a} 0% 25%, ${finish.b} 0% 50%) 0 0 / 14px 14px` }}
              title={`${finish.name} · ${naira(floorPrice(room, finish))}`}
              aria-label={`${finish.name}, ${naira(floorPrice(room, finish))}`}
              onClick={() => setTrying({ ...trying, ground: finish.id })}
            />
          ))}
        </div>
        <div className="bld-act-buttons">
          <button
            type="button"
            className="bld-go"
            disabled={busy || cost === 0 || cost > money}
            onClick={() => void send(() => finishRoom(playerId, room.id, { wall: wall?.id, ground: ground?.id }), "Could not do it.", () => {
              setTrying(null);
              flash(`${room.name} done up · ${naira(cost)}`);
            })}
          >
            {cost > money ? `Need ${naira(cost)}` : cost > 0 ? `Keep it · ${naira(cost)}` : "Keep it"}
          </button>
          <button type="button" onClick={() => setTrying(null)} disabled={!trying}>Put it back</button>
          <button type="button" onClick={() => { setPaintRoom(null); setTrying(null); }}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .bld { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(8px + env(safe-area-inset-bottom)); z-index: 12;
          width: min(620px, calc(100vw - 16px)); max-height: min(52vh, 420px); overflow-y: auto; background: rgba(250, 248, 242, 0.97);
          color: #1f2a26; border-radius: 18px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28); padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 9px; }
        .bld-top { display: flex; align-items: center; gap: 6px; }
        .bld-tabs { display: flex; gap: 4px; background: #ebe6da; border-radius: 999px; padding: 3px; }
        .bld-tabs button { border: none; background: none; border-radius: 999px; padding: 7px 13px; font-weight: 700; font-size: 13px; color: #5b5448; }
        .bld-tabs button.on { background: #fff; color: #1f2a26; box-shadow: 0 1px 3px rgba(0,0,0,0.15); }
        .bld-money { margin-left: auto; font-weight: 800; font-size: 14px; }
        .bld-done { border: none; border-radius: 999px; background: #1f2a26; color: #fff; font-weight: 700; padding: 8px 14px; }
        .bld-chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
        .bld-chips button { flex-shrink: 0; border: 1px solid #ddd5c4; background: #fff; border-radius: 999px; padding: 6px 11px; font-size: 12.5px; font-weight: 600; color: #4a443a; }
        .bld-chips button.on { background: #f4d27a; border-color: #e0b84f; color: #1f2a26; }
        .bld-tiles { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scroll-snap-type: x proximity; }
        .bld-tile { flex: 0 0 96px; scroll-snap-align: start; border: 1px solid #e3dccd; background: #fff; border-radius: 14px; padding: 8px 6px;
          display: flex; flex-direction: column; align-items: center; gap: 3px; text-align: center; }
        .bld-tile:active { transform: scale(0.97); }
        .bld-tile.dear { opacity: 0.55; }
        .bld-tile-name { font-size: 11.5px; font-weight: 600; line-height: 1.15; min-height: 26px; }
        .bld-tile-price { font-size: 12px; font-weight: 800; color: #2f7a45; }
        .bld-tile.dear .bld-tile-price { color: #a33; }
        .bld-hint { margin: 0; font-size: 12px; color: #6b6355; }
        .bld-act { display: flex; flex-direction: column; gap: 8px; }
        .bld-act-head { display: flex; align-items: center; gap: 10px; }
        .bld-act-head strong { display: block; font-size: 15px; }
        .bld-act-head span { display: block; font-size: 12.5px; color: #5b5448; }
        .bld-ok { color: #2f7a45 !important; } .bld-no { color: #b03a2e !important; font-size: 12.5px; }
        .bld-act-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .bld-act-buttons { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
        .bld-act-buttons button, .bld-sizes button { border: 1px solid #ddd5c4; background: #fff; border-radius: 999px; padding: 9px 14px; font-weight: 700; font-size: 13.5px; color: #1f2a26; }
        .bld-act-buttons button.bld-go { background: #2f9e54; border-color: #2f9e54; color: #fff; }
        .bld-act-buttons button.bld-danger { background: #c0392b; border-color: #c0392b; color: #fff; }
        .bld-act-buttons button:disabled { opacity: 0.45; }
        .bld-pad { display: grid; grid-template-columns: repeat(3, 38px); grid-template-rows: repeat(2, 34px); gap: 4px; }
        .bld-arrow { border: none; border-radius: 10px; background: #1f2a26; color: #fff; font-size: 13px; }
        .bld-arrow.up { grid-column: 2; grid-row: 1; } .bld-arrow.left { grid-column: 1; grid-row: 2; }
        .bld-arrow.down { grid-column: 2; grid-row: 2; } .bld-arrow.right { grid-column: 3; grid-row: 2; }
        .bld-name { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 700; }
        .bld-name input { flex: 1; border: 1px solid #ddd5c4; border-radius: 10px; padding: 7px 10px; font-size: 14px; }
        .bld-bill { background: #fff; border: 1px solid #e3dccd; border-radius: 12px; padding: 8px 10px; font-size: 12.5px; }
        .bld-bill summary { cursor: pointer; }
        .bld-bill ul { margin: 6px 0 0; padding: 0; list-style: none; }
        .bld-bill li { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; border-bottom: 1px dashed #eee6d6; }
        .bld-bill-stage p { margin: 8px 0 0; font-weight: 700; display: flex; justify-content: space-between; }
        .bld-bill-stage p span, .bld-bill li span { font-variant-numeric: tabular-nums; color: #4a443a; }
        .bld-site { background: #fff; border: 1px solid #e3dccd; border-radius: 14px; padding: 9px 11px; display: flex; flex-direction: column; gap: 7px; }
        .bld-site-head strong { display: block; } .bld-site-head span { font-size: 12.5px; color: #5b5448; }
        .bld-bar { height: 8px; border-radius: 999px; background: #ebe6da; overflow: hidden; }
        .bld-bar span { display: block; height: 100%; background: repeating-linear-gradient(45deg, #f0a42a 0 8px, #e48d16 8px 16px); transition: width 0.9s linear; }
        .bld-sizes { display: flex; gap: 7px; overflow-x: auto; }
        .bld-sizes button { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 5px; border-radius: 12px; font-size: 12px; }
        .bld-size-box { display: block; border: 2px solid #c79a2b; background: #f7ecd0; border-radius: 3px; }
        .bld-roomlist { display: flex; flex-wrap: wrap; gap: 6px; }
        .bld-roomchip { display: inline-flex; align-items: center; gap: 6px; background: #ebe6da; border-radius: 999px; padding: 5px 10px; font-size: 12px; font-weight: 600; }
        .bld-roomchip button { border: none; background: #c0392b; color: #fff; border-radius: 999px; width: 20px; height: 20px; font-size: 11px; line-height: 1; }
        .bld-label { margin: 2px 0 0; font-size: 11.5px; font-weight: 800; color: #6b6355; }
        .bld-swatches { display: flex; flex-wrap: wrap; gap: 7px; }
        .bld-swatch { width: 34px; height: 34px; border-radius: 10px; border: 2px solid rgba(0,0,0,0.12); }
        .bld-swatch.on { border: 3px solid #1f2a26; box-shadow: 0 0 0 2px #f4d27a; }
        .bld-error { margin: 0; color: #b03a2e; font-size: 13px; font-weight: 600; }
        .bld-toast { position: absolute; left: 50%; transform: translateX(-50%); top: calc(70px + env(safe-area-inset-top)); z-index: 13; background: #1f2a26;
          color: #fff; padding: 9px 16px; border-radius: 999px; font-weight: 700; font-size: 14px; box-shadow: 0 6px 18px rgba(0,0,0,0.25); }
        .bld-cam { position: absolute; right: 12px; top: calc(76px + env(safe-area-inset-top)); z-index: 12; display: flex; flex-direction: column; gap: 6px; }
        .bld-cam button { width: 42px; height: 42px; border: none; border-radius: 12px; background: rgba(250,248,242,0.95); color: #1f2a26;
          font-size: 18px; font-weight: 800; box-shadow: 0 3px 10px rgba(0,0,0,0.2); }
        .bld-cam button.floor { font-size: 11px; }
        .site-tag { background: #f08a1c !important; color: #fff !important; }
      `}</style>

      <div className="bld-cam" aria-label="Camera">
        <button type="button" onClick={() => turnCamera(1)} aria-label="Turn the camera left">⟲</button>
        <button type="button" onClick={() => turnCamera(-1)} aria-label="Turn the camera right">⟳</button>
        <button type="button" onClick={() => zoom(0.8)} aria-label="Closer">＋</button>
        <button type="button" onClick={() => zoom(1.25)} aria-label="Further">－</button>
        {storeys > 1 && (
          <button type="button" className="floor" onClick={() => { setPlacing(null); setDraft(null); setSelected(null); onFloor(floor > 0 ? 0 : 1); }}>
            {floor > 0 ? "Down" : "Up"}
          </button>
        )}
      </div>
      {toast && <div className="bld-toast" role="status">{toast}</div>}

      <div className="bld" role="dialog" aria-label="Build mode">
        <div className="bld-top">
          <div className="bld-tabs" role="tablist">
            {(["buy", "rooms", "paint"] as Tab[]).map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={tab === name}
                className={tab === name ? "on" : ""}
                onClick={() => {
                  setTab(name);
                  setPlacing(null);
                  setDraft(null);
                  setSelected(null);
                  setConfirm(null);
                  setError("");
                  if (name !== "paint") { setPaintRoom(null); setTrying(null); }
                }}
              >
                {name === "buy" ? "Buy" : name === "rooms" ? `Build${building.length ? " •" : ""}` : "Paint"}
              </button>
            ))}
          </div>
          <span className="bld-money">{naira(money)}</span>
          <button type="button" className="bld-done" onClick={onDone}>Done</button>
        </div>
        {error && <p className="bld-error">{error}</p>}
        {body}
      </div>
    </>
  );
}
