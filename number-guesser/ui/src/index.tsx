import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';

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
  possibleGuesses: number[]
}

const Game = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [readySent, setReadySent] = useState<boolean>(false);
  const [phase, setPhase] = useState<"new" | "started">("new");
  const [setupState, setSetupState] = useState<SetupState | undefined>({evenOnly: false});
  const [gameState, setGameState] = useState<GameState | undefined>();
  const [error, setError] = useState<string>("");

  const makeMove = useCallback((n: number) => {
    window.top!.postMessage({type: "move", id: crypto.randomUUID(), data: {number: n}}, "*")
  }, [])

  const startGame = useCallback(() => {
    window.top!.postMessage({type: "start", id: crypto.randomUUID(), setup: setupState, players}, "*")
  }, [setupState, players])

  useEffect(() => {
    const listener = (event: MessageEvent<PlayerEvent | UpdateEvent | MessageProcessed>) => {
      if (event.data.type === 'update') {
        switch (event.data.phase) {
          case 'new':
            setSetupState(event.data.state)
            setGameState(undefined)
            break
          case 'started':
            setSetupState(undefined)
            setGameState(event.data.state)
            break
          }
        setPhase(event.data.phase)
        return
      }
      switch (phase) {
        case 'new':
          switch(event.data.type) {
            case 'player':
              let player = event.data.player
              if (event.data.added) {
                setPlayers((players) => {
                  if (players.find(p => p.id === player.id)) return players
                  return [...players, player]
                })
              } else {
                setPlayers((players) => players.filter(p => p.id !== player.id))
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
    }

    window.addEventListener('message', listener, false)
    if (!readySent) {
      window.top!.postMessage({type: "ready"}, "*");
      setReadySent(true);
    }
    return () => window.removeEventListener('message', listener)
  }, [phase, players, readySent])

  useEffect(() => {
    if (error === "") return
    setTimeout(() => setError(""), 5000)
  }, [error])

  return <div>
    {error !== "" && <div style={{backgroundColor: "#faa", margin: '4px'}}>{error}</div>}
    {gameState ? <>
      {gameState.winner !== undefined ? <span>Game is done! {gameState.winner === gameState.position ? "YOU WIN": "YOU LOSE"}</span> : gameState.possibleGuesses.map(n => <button onClick={() => makeMove(n)} key={n}>{n}</button>)}
      <pre>{JSON.stringify(gameState, null, 2)}</pre>
    </> : <>
      <input type="checkbox" checked={setupState ? setupState.evenOnly : false} onChange={e => setSetupState({evenOnly: e.currentTarget.checked})} />Even numbers only
      <h2>Players</h2>
      <ul>
      {players.map(p => <li key={p.id}>{p.name}</li>)}
      </ul>
      <button onClick={() => startGame()}>Start game</button>
    </>}
  </div>
}

const rootElement = document.getElementById('root')!
const root = ReactDOM.createRoot(rootElement);
root.render(<Game />);
