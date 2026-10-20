import { useMemo } from "react";
import { buildOffices } from "./officeShapes";
import { Built } from "./PalmCourt";

/** Oba Trust Bank and Edo Tech Hub, on Boundary Road in GRA (officeShapes.ts). Drawn only in GRA. */
export function Offices() {
  const parts = useMemo(() => buildOffices(), []);
  return <Built parts={parts} name="offices" />;
}
