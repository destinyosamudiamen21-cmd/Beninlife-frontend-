import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import type { City, CityPlace } from "../api/travel";
import {
  cameraSpot,
  clampView,
  easeView,
  flyTo,
  mapView,
  panBy,
  showAt,
  turnBy,
  zoomBy,
  type MapView,
} from "./cityCamera";
import {
  COMING_SOON,
  DISTRICT_AT,
  DISTRICT_SPAN,
  MAP_EDGE,
  PIN,
  PLAIN_PIN,
  districtPatch,
  toMap,
} from "./cityLayout";
import { EARTH, buildCityGround, buildDistrictModel } from "./cityShapes";
import type { Bounds, DistrictData } from "./districtData";
import type { MeshData } from "./districtGeometry";
import {
  bearing,
  middle,
  spread,
  turned,
  twistFilter,
  type Point,
} from "./gestures";
import { Glyph } from "./glyphs";

const SKY = "#e7c79c"; // the dusty sky over the edge of the map
const GLIDE = 9; // how quickly the view catches up with where it was sent
const TAP = 6; // pixels a finger may wander and still count as a tap
const TWIST_START = 0.1; // radians two fingers must turn before the map turns with them
const LOOK_PER_PIXEL = 0.006; // radians per pixel of a right-button drag
const WHEEL_ZOOM = 0.0015;
const PINCH_WHEEL_ZOOM = 0.01; // a trackpad pinch arrives as a ctrl+wheel event
// What is drawn over the map depends on how many pixels a metre gets.
const DISTRICTS_ONLY = 0.45; // fewer than this: only the districts are named
const NAMES_FROM = 1.25; // more than this: every place shows its name
const PIN_HEIGHT = 16; // metres above the ground that a pin points at: just over the roofs
const NEAR_PLANE = 5;
const FAR_PLANE = 9000;

function toGeometry(mesh: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(mesh.colors, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

const target = new Vector3();
const spot: [number, number, number] = [0, 0, 0];

type Props = {
  /** The districts whose maps have been downloaded. The rest appear as they arrive. */
  districts: DistrictData[];
  /** Every place and what it costs to get there, or null while the server is being asked. */
  city: City | null;
  /** Where the player is standing. */
  here: { district: string; x: number; z: number };
  /** The place whose travel choices are open, or null. */
  picked: string | null;
  onPick: (placeId: string | null) => void;
};

/**
 * The city map, drawn in place of the street while it is open: Benin from above, with a
 * small model of every district, the big roads between them, and a pin on every place a
 * player can go to.
 *
 * - Drag to slide the map. Pinch, or roll the wheel, to zoom.
 * - Twist two fingers, or drag with the right button, to turn it.
 * - Press a pin to see how to get there.
 */
export function CityMap({ districts, city, here, picked, onPick }: Props) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  const you = useMemo(
    () => toMap(here.district, here.x, here.z) ?? { x: 0, z: 0 },
    [here.district, here.x, here.z]
  );
  // The map opens on the player, close enough to see the district they are in.
  useState(() => {
    showAt(you.x, you.z, DISTRICT_SPAN);
    return null;
  });

  // ---- what is drawn -------------------------------------------------------------------
  const patches = useMemo(
    () =>
      districts
        .map((district) => districtPatch(district.id, district.bounds))
        .filter((patch): patch is Bounds => patch !== null),
    [districts]
  );
  const ground = useMemo(() => toGeometry(buildCityGround(patches)), [patches]);
  const models = useMemo(
    () =>
      districts.map((district) => ({
        id: district.id,
        geometry: toGeometry(buildDistrictModel(district)),
      })),
    [districts]
  );
  useEffect(() => () => ground.dispose(), [ground]);
  useEffect(
    () => () => models.forEach((model) => model.geometry.dispose()),
    [models]
  );

  // The map is far bigger than a street, so the camera has to see much further while it is open.
  useEffect(() => {
    const before = { near: camera.near, far: camera.far };
    camera.near = NEAR_PLANE;
    camera.far = FAR_PLANE;
    camera.updateProjectionMatrix();
    return () => {
      camera.near = before.near;
      camera.far = before.far;
      camera.updateProjectionMatrix();
    };
  }, [camera]);

  // ---- fingers and the mouse -------------------------------------------------------------
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  });
  useEffect(() => {
    // Listened for on the box the canvas sits in, not on the canvas itself: the pins are
    // drawn in that box beside the canvas, and a drag or a turn of the wheel that happens
    // to begin on a pin should still move the map.
    const canvas = gl.domElement;
    const element: HTMLElement = canvas.parentElement ?? canvas;
    const pointers = new Map<number, Point>();
    const twist = twistFilter(TWIST_START);
    let pinch: { gap: number; bearing: number; middle: Point } | null = null;
    let lookId: number | null = null;
    let last: Point = { x: 0, y: 0 };
    let wandered = 0;

    const at = (event: PointerEvent): Point => ({
      x: event.clientX,
      y: event.clientY,
    });
    const height = () => canvas.clientHeight || window.innerHeight;
    /** A change made by hand moves the view at once, with no glide. */
    const both = (change: (view: MapView) => void) => {
      for (const view of [mapView.now, mapView.goal]) {
        change(view);
        clampView(view, MAP_EDGE);
      }
    };
    /** Keep hearing from a pointer that began on the bare map, even if it leaves the window. */
    const hold = (event: PointerEvent) => {
      // One that began on a pin is left alone: holding it would take the press away from the pin.
      if (event.target !== canvas) return;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that has already gone cannot be held. Nothing depends on it.
      }
    };
    /** Two fingers are down (or still down after a third lifted): measure from where they are now. */
    const measure = () => {
      if (pointers.size < 2) {
        pinch = null;
        return;
      }
      const [a, b] = [...pointers.values()];
      pinch = {
        gap: spread(a, b),
        bearing: bearing(a, b),
        middle: middle(a, b),
      };
      twist.reset();
    };

    const down = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        if (event.button === 2) {
          lookId = event.pointerId;
          last = at(event);
          hold(event);
        }
        return;
      }
      Object.assign(mapView.goal, mapView.now); // taking hold of the map stops it gliding
      pointers.set(event.pointerId, at(event));
      hold(event);
      if (pointers.size === 1) wandered = 0;
      else wandered = TAP; // two fingers are never a tap
      measure();
    };

    const move = (event: PointerEvent) => {
      const point = at(event);
      if (event.pointerId === lookId) {
        const swing = -(point.x - last.x) * LOOK_PER_PIXEL;
        last = point;
        both((view) => turnBy(view, swing));
        return;
      }
      const before = pointers.get(event.pointerId);
      if (!before) return;
      pointers.set(event.pointerId, point);

      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const gap = spread(a, b),
          direction = bearing(a, b),
          centre = middle(a, b);
        const grow = pinch.gap / gap;
        const swing = twist.feed(turned(pinch.bearing, direction));
        const dx = centre.x - pinch.middle.x,
          dy = centre.y - pinch.middle.y;
        both((view) => {
          zoomBy(view, grow);
          turnBy(view, swing);
          panBy(view, dx, dy, height());
        });
        pinch = { gap, bearing: direction, middle: centre };
        return;
      }
      if (pointers.size === 1) {
        const dx = point.x - before.x,
          dy = point.y - before.y;
        wandered += Math.abs(dx) + Math.abs(dy);
        both((view) => panBy(view, dx, dy, height()));
      }
    };

    const up = (event: PointerEvent) => {
      if (event.pointerId === lookId) {
        lookId = null;
        return;
      }
      if (!pointers.delete(event.pointerId)) return;
      measure();
      // A tap on the bare map puts away whatever was open. (A tap on a pin is the pin's own business.)
      if (
        pointers.size === 0 &&
        wandered < TAP &&
        event.type === "pointerup" &&
        event.target === canvas
      )
        pick.current(null);
    };
    // A drag that began on a pin and ended on it has moved the map: it was not a press of the pin.
    const notAPress = (event: MouseEvent) => {
      // (`detail` is 0 when a pin is pressed from the keyboard: that is always a press.)
      if (wandered >= TAP && event.target !== canvas && event.detail !== 0)
        event.stopPropagation();
    };

    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const pixels = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
      zoomBy(
        mapView.goal,
        Math.exp(pixels * (event.ctrlKey ? PINCH_WHEEL_ZOOM : WHEEL_ZOOM))
      );
      clampView(mapView.goal, MAP_EDGE);
    };
    const noMenu = (event: Event) => event.preventDefault();
    // Stops the browser scrolling or zooming the page instead. Only for touches on the bare
    // map: on a pin it would also stop the pin being pressed.
    const noScroll = (event: TouchEvent) => {
      if (event.target === canvas) event.preventDefault();
    };

    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", up);
    element.addEventListener("click", notAPress, true);
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("contextmenu", noMenu);
    element.addEventListener("touchstart", noScroll, { passive: false });
    element.addEventListener("touchmove", noScroll, { passive: false });
    return () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
      element.removeEventListener("click", notAPress, true);
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("contextmenu", noMenu);
      element.removeEventListener("touchstart", noScroll);
      element.removeEventListener("touchmove", noScroll);
    };
  }, [gl]);

  // ---- the camera, and how much to write on the map ---------------------------------------
  const [detail, setDetail] = useState(1); // 0: districts only. 1: a pin for every place. 2: pins with names.
  const shown = useRef(1);
  useFrame((_, delta) => {
    easeView(
      mapView.now,
      mapView.goal,
      1 - Math.exp(-Math.min(delta, 0.1) * GLIDE)
    );
    cameraSpot(mapView.now, spot);
    camera.position.set(spot[0], spot[1], spot[2]);
    target.set(mapView.now.x, 0, mapView.now.z);
    camera.lookAt(target);

    const pixelsPerMetre = size.height / mapView.now.span;
    const wanted =
      pixelsPerMetre < DISTRICTS_ONLY ? 0 : pixelsPerMetre < NAMES_FROM ? 1 : 2;
    if (wanted !== shown.current) {
      shown.current = wanted;
      setDetail(wanted);
    }
  });

  const places = useMemo(() => city?.places ?? [], [city]);
  const counts = useMemo(() => {
    const found: Record<string, number> = {};
    for (const place of places)
      found[place.district] = (found[place.district] ?? 0) + 1;
    return found;
  }, [places]);

  const choose = (place: CityPlace) => {
    const where = toMap(place.district, place.x, place.z);
    if (where) flyTo(where.x, where.z, Math.min(mapView.goal.span, 560));
    onPick(place.id);
  };

  return (
    <>
      <color attach='background' args={[SKY]} />
      <hemisphereLight args={["#fff6e6", "#9a6a48", 1.5]} />
      <directionalLight
        position={[500, 1000, 350]}
        intensity={1.6}
        color='#fff1d6'
      />
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[14000, 14000]} />
        <meshLambertMaterial color={EARTH} />
      </mesh>
      <mesh geometry={ground}>
        <meshLambertMaterial vertexColors />
      </mesh>
      {models.map((model) => (
        <mesh key={model.id} geometry={model.geometry}>
          <meshLambertMaterial vertexColors />
        </mesh>
      ))}

      {/* Parts of town that are drawn but not open yet. */}
      {COMING_SOON.map((area) => (
        <Html
          key={area.name}
          position={[area.x, PIN_HEIGHT, area.z]}
          center
          zIndexRange={[1, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div className='citymap-soon'>
            {area.name}
            <small>Coming soon</small>
          </div>
        </Html>
      ))}

      {/* From far away: one plate for each district. Pressing it goes down to that district. */}
      {detail === 0 &&
        districts.map((district) => {
          const at = DISTRICT_AT[district.id];
          if (!at) return null;
          return (
            <Html
              key={district.id}
              position={[at.x, PIN_HEIGHT, at.z]}
              center
              zIndexRange={[3, 2]}
            >
              <button
                type='button'
                className='citymap-district'
                onClick={() => flyTo(at.x, at.z, DISTRICT_SPAN)}
              >
                <strong>{district.name}</strong>
                <span>
                  {counts[district.id]
                    ? `${counts[district.id]} places`
                    : "Open"}
                  {district.id === here.district ? " · You are here" : ""}
                </span>
              </button>
            </Html>
          );
        })}

      {/* Closer: a pin for every place. */}
      {detail > 0 &&
        places.map((place) => {
          const where = toMap(place.district, place.x, place.z);
          if (!where) return null;
          const look = PIN[place.kind] ?? PLAIN_PIN;
          const open = picked === place.id;
          return (
            <Html
              key={place.id}
              position={[where.x, PIN_HEIGHT, where.z]}
              center
              zIndexRange={open ? [4, 4] : [3, 2]}
            >
              <button
                type='button'
                className={`citymap-pin${open ? " open" : ""}${
                  detail > 1 || open ? " named" : ""
                }`}
                onClick={() => choose(place)}
                aria-label={`${place.name}, ${place.district_name}`}
                aria-pressed={open}
              >
                <i style={{ background: look.colour }}>
                  <Glyph name={look.glyph} size={17} stroke={2.1} />
                </i>
                <span>{place.name}</span>
              </button>
            </Html>
          );
        })}

      <Html
        position={[you.x, PIN_HEIGHT, you.z]}
        center
        zIndexRange={[2, 1]}
        style={{ pointerEvents: "none" }}
      >
        <div className='citymap-you'>
          <b />
          <span>You</span>
        </div>
      </Html>
    </>
  );
}
