import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';

const numbers = [1,2,3,4,5,6,7,8,9,10]

type Player = {
  id: string
  position: number
  name: string
  color: string
}

type PlayerEvent = {
  type: "player"
  player: Player
  added: boolean
}

type UpdateEvent = {
  type: "update"
  phase: "new" | "started"
  state: any
}

type MessageProcessed = {
  type: "messageProcessed"
  id: string
  error: string | undefined
}

type SetupState = {
  evenOnly: boolean
}

type GameState = {
  winner: number | undefined
  position: number
}

const Game = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [readySent, setReadySent] = useState<boolean>(false);
  const [phase, setPhase] = useState<"new" | "started">("new");
  const [setupState, setSetupState] = useState<SetupState | undefined>();
  const [gameState, setGameState] = useState<GameState | undefined>();
  const [error, setError] = useState<string>("");
  const listener = useCallback((event: MessageEvent<PlayerEvent | UpdateEvent | MessageProcessed>) => {
    if (event.data.type === 'update') {
      switch (event.data.phase) {
        case 'new':
          setPhase(event.data.phase)
          setSetupState(event.data.state)
          break
        case 'started':
          setPhase(event.data.phase)
          setGameState(event.data.state)
          break
        }
      return
    }
    console.log("dealing with", event.data)
    switch (phase) {
      case 'new':
        switch(event.data.type) {
          case 'player':
            let player = event.data.player
            if (event.data.added) {
              setPlayers([...players, player])
            } else {
              setPlayers(players.filter(p => p.id === player.id))
            }
            break;
          case 'messageProcessed':
            break;
          }
        break
      case 'started':
        switch(event.data.type) {
          case 'messageProcessed':
            setError(event.data.error || "");
            break;
        }
        break
    }
  }, [phase])

  const makeMove = useCallback((n: number) => {
    window.top!.postMessage({type: "move", id: crypto.randomUUID(), data: {number: n}}, "*")
  }, [])

  const startGame = useCallback(() => {
    window.top!.postMessage({type: "start", id: crypto.randomUUID(), setupState, players}, "*")
  }, [setupState, players])

  useEffect(() => {
    window.addEventListener('message', listener, false)
    if (!readySent) {
      window.top!.postMessage({type: "ready"}, "*");
      setReadySent(true);
    }
    return () => window.removeEventListener('message', listener)
  }, [phase])

  useEffect(() => {
    if (error === "") return
    setTimeout(() => setError(""), 5000)
  }, [error])

  return <div>
    {error !== "" && <div style={{backgroundColor: "#faa", margin: '4px'}}>{error}</div>}
    {phase === "new" ? <>
      <input type="checkbox" onChange={e => setSetupState({evenOnly: e.currentTarget.checked})} checked={setupState?.evenOnly} />Even numbers only
      <h2>Players</h2>
      <ul>
      {players.map(p => <li key={p.id}>{p.name}</li>)}
      </ul>
      <button onClick={() => startGame()}>Start game</button>
    </> : <>
      {gameState?.winner !== undefined ? <span>Game is done! {gameState.winner === gameState.position ? "YOU WIN": "YOU LOSE"}</span> : numbers.map(n => <button onClick={() => makeMove(n)} key={n}>{n}</button>)}
      <pre>{JSON.stringify(gameState, null, 2)}</pre>
    </>}
  </div>
}

const rootElement = document.getElementById('root')!
const root = ReactDOM.createRoot(rootElement);
root.render(<Game />);
