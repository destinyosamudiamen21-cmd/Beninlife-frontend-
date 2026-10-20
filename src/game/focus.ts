// Small facts about the local player that many parts of the game need every frame.
// Plain objects, not React state, so reading and writing them never causes a re-render.

/**
 * Where the local player is standing right now. `y` is how high their feet are: 0 on the
 * ground, more on a footbridge. LocalPlayer writes it; the sun, the stairs and the market
 * people read it.
 */
export const playerFocus = { x: 0, z: 0, y: 0 };

/**
 * Where the street should think the player is. On the ground it is the same spot. Up on
 * a footbridge it is the foot of the nearest stairs and `up` is true: the traffic below
 * must not brake for someone walking over it, and a tout cannot hold someone up there.
 */
export const playerStreet = { x: 0, z: 0, up: false };

/** How much the player is being slowed: 1 is free, 0.5 is half speed. The market people write it when a tout has hold of you. */
export const playerDrag = { factor: 1 };

/**
 * How far the camera is swung round the player right now, in radians. LocalPlayer writes
 * it; the crowd reads it to know which strip of ground lies between the player and the camera.
 */
export const cameraView = { yaw: 0, x: 0, y: 0, z: 0 };   // which way it looks, and where it is
