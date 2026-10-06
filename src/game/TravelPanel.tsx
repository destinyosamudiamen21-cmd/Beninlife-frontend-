import { useEffect, useState } from "react";
import {
  fetchTravel,
  takeBus,
  type TravelChoices,
  type Trip,
} from "../api/travel";

type Props = {
  playerId: string;
  /** The fare is paid and the server has moved the player. */
  onArrive: (trip: Trip) => void;
  onClose: () => void;
};

/** The bus stop: where you can go from here, and what it costs. */
export function TravelPanel({ playerId, onArrive, onClose }: Props) {
  const [choices, setChoices] = useState<TravelChoices | null>(null);
  const [error, setError] = useState("");
  const [going, setGoing] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchTravel(playerId)
      .then((loaded) => {
        if (!cancelled) setChoices(loaded);
      })
      .catch((problem: unknown) => {
        if (!cancelled)
          setError(
            problem instanceof Error ? problem.message : "No bus is answering."
          );
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const go = async (to: string) => {
    if (going) return;
    setGoing(to);
    setError("");
    try {
      onArrive(await takeBus(playerId, to));
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : "The bus did not move."
      );
      setGoing("");
    }
  };

  return (
    <div className='sheet'>
      <div className='sheet-card'>
        <div className='sheet-top'>
          <div>
            <h2>Enter bus</h2>
            <p>{choices ? `You are at ${choices.here_name}` : "…"}</p>
          </div>
          <button
            type='button'
            className='ghost'
            onClick={onClose}
            disabled={going !== ""}
          >
            Stay
          </button>
        </div>

        <div className='sheet-rows'>
          {choices?.places.map((place) => (
            <div key={place.id} className='sheet-row'>
              <span className='sheet-name'>{place.name}</span>
              <span className='sheet-price'>
                ₦{place.fare.toLocaleString()}
              </span>
              <button
                type='button'
                className='primary'
                onClick={() => void go(place.id)}
                disabled={going !== "" || choices.money < place.fare}
              >
                {going === place.id ? "Going…" : "Go"}
              </button>
            </div>
          ))}
        </div>

        {error && <p className='error'>{error}</p>}
        {choices && (
          <p className='sheet-small'>
            You have ₦{choices.money.toLocaleString()}.
          </p>
        )}
      </div>
    </div>
  );
}
