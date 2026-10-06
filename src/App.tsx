import { useState, type FormEvent } from "react";
import { joinGame, type Player } from "./api/players";
import { Game } from "./game/Game";

export default function App() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (player) return <Game player={player} />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const username = name.trim();
    if (username.length < 3) {
      setError("Pick at least 3 characters");
      return;
    }
    setLoading(true);
    try {
      setPlayer(await joinGame(username));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the city");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='join'>
      <form className='join-card' onSubmit={submit}>
        <h1>Benin City</h1>
        <p>Walk the city with your friends.</p>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          placeholder='Username'
          maxLength={20}
          autoFocus
        />
        {error && <p className='error'>{error}</p>}
        <button type='submit' disabled={loading}>
          {loading ? "Joining…" : "Enter the city"}
        </button>
      </form>
    </div>
  );
}
