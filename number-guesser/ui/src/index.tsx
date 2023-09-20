import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';

type Player = {
  id: string
  position: number
  name: string
  color: string
}

type UserEvent = {
  type: "user"
  name: string
  id: string
  added: boolean
}

// an update to the setup state
type SetupUpdateEvent = {
  type: "setupUpdate"
  state: SetupState<NumberGuesserSetupState>
}

// an update to the current game state
type GameUpdateEvent = {
  type: "gameUpdate"
  state: GameState
}

// indicates the disposition of a message that was processed
type MessageProcessed = {
  type: "messageProcessed"
  id: string
  error: string | undefined
}

type NumberGuesserSetupState = {
  evenOnly: boolean
}

type SetupState<T> = {
  players: (Player & { settings: Record<string, any> })[] // permit add'l per-player settings
  settings: T
}

type GameState = {
  winner: number | undefined
  position: number
  possibleGuesses: number[]
}

type SetupUpdated = {
  type: "setupUpdated"
  data: SetupState<NumberGuesserSetupState>
}

type PlayerUpdated = {
  type: "player"
  name: string
  color: string
}

// used to send a move
type MoveMessage<T> = {
  id: string
  type: 'move'
  data: T
}

type NumberGuesserMove = {
  number: number
}

// used to actually start the game
type StartMessage = {
  id: string
  type: 'start'
  setup: SetupState<NumberGuesserSetupState>
}

// used to tell the top that you're ready to recv events
type ReadyMessage = {
  type: 'ready'
}

const Game = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [readySent, setReadySent] = useState<boolean>(false);
  const [phase, setPhase] = useState<"new" | "started">("new");
  const [setupState, setSetupState] = useState<NumberGuesserSetupState>({evenOnly: false});
  const [gameState, setGameState] = useState<GameState | undefined>();
  const [error, setError] = useState<string>("");

  const sendToTop = useCallback((m: SetupUpdated | PlayerUpdated | MoveMessage<NumberGuesserMove> | StartMessage | ReadyMessage) => {
    window.top!.postMessage(m, "*")
  }, [])

  const makeMove = useCallback((n: number) => {
    sendToTop({type: "move", id: crypto.randomUUID(), data: {number: n}})
  }, [])

  const startGame = useCallback(() => {
    sendToTop({type: "start", id: crypto.randomUUID(), setup: {settings: setupState!, players: players.map(p => {return {...p, settings: {}}})}})
  }, [setupState, players])

  useEffect(() => {
    const listener = (event: MessageEvent<UserEvent | SetupUpdateEvent | GameUpdateEvent | MessageProcessed>) => {
      const e = event.data
      console.log("ui got", e.type, "event")
      switch(e.type) {
        case 'user':
          if (e.added) {
            setPlayers((players) => {
              if (players.find(p => p.id === e.id)) return players
              return [...players, { position: players.length, name: e.name, id: e.id, color: "#ee00ee" }]
            })
          } else {
            setPlayers((players) => players.filter(p => p.id !== e.id))
          }
          break;
        case 'setupUpdate':
          setPhase('new');
          setSetupState(e.state.settings);
          setPlayers(e.state.players);
          break
        case 'gameUpdate':
          setPhase('started');
          setGameState(e.state);
          break
        case 'messageProcessed':
          setError(e.error || "");
          break;
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
