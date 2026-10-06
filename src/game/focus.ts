// Small facts about the local player that many parts of the game need every frame.
// Plain objects, not React state, so reading and writing them never causes a re-render.

/** Where the local player is standing right now. LocalPlayer writes it; the sun, the stairs and the market people read it. */
export const playerFocus = { x: 0, z: 0 };

/** How much the player is being slowed: 1 is free, 0.5 is half speed. The market people write it when a tout has hold of you. */
export const playerDrag = { factor: 1 };
