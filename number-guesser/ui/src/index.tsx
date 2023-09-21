import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Message, NumberGuesserMove, NumberGuesserPlayer, NumberGuesserPlayerState, NumberGuesserSettings, PlayerState } from '../../types';

type User = {
  id: string
  name: string
}

type UserEvent = {
  type: "user"
  userID: string
  userName: string
  added: boolean
}

type PlayersEvent = {
  type: "players"
  players: NumberGuesserPlayer[]
}

// an update to the setup state
type SettingsUpdateEvent = {
  type: "settingsUpdate"
  settings: NumberGuesserSettings
}

type GameUpdateEvent = {
  type: "gameUpdate"
  state: PlayerState<NumberGuesserPlayerState>
  messages: Message[]
}

// indicates the disposition of a message that was processed
type MessageProcessedEvent = {
  type: "messageProcessed"
  id: string
  error?: string
}

type UpdateSettingsMessage = {
  type: "updateSettings"
  id: string
  settings: NumberGuesserSettings
}

// host only
type UpdatePlayersMessage = {
  type: "updatePlayers"
  id: string
  players: Partial<NumberGuesserPlayer & {
    userID: string
  }>[]
}

// host only
type StartMessage = {
  type: "start"
  id: string
}

type UpdateSelfPlayerMessage = {
  type: "updateSelfPlayer"
  id: string
  name: string
  color: string
}

type ReadyMessage = {
  type: "ready"
}

// used to send a move
type MoveMessage<T> = {
  type: 'move'
  id: string
  data: T
}

type NumberGuesserMoveMessage = MoveMessage<NumberGuesserMove>

const Game = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [players, setPlayers] = useState<NumberGuesserPlayer[]>([]);
  const [readySent, setReadySent] = useState<boolean>(false);
  const [phase, setPhase] = useState<"new" | "started">("new");
  const [setupState, setSetupState] = useState<NumberGuesserSettings>({evenOnly: false});
  const [gameState, setGameState] = useState<PlayerState<NumberGuesserPlayerState>>();
  const [error, setError] = useState<string>("");

  const sendToTop = useCallback((m: UpdateSettingsMessage | UpdatePlayersMessage | UpdateSelfPlayerMessage | NumberGuesserMoveMessage | StartMessage | ReadyMessage) => {
    window.top!.postMessage(m, "*")
  }, [])

  const makeMove = useCallback((n: number) => {
    sendToTop({type: "move", id: crypto.randomUUID(), data: {number: n}})
  }, [])

  const startGame = useCallback(() => {
    sendToTop({type: "start", id: crypto.randomUUID()})
  }, [setupState, players])

  useEffect(() => {
    const listener = (event: MessageEvent<
      UserEvent |
      PlayersEvent |
      GameUpdateEvent |
      SettingsUpdateEvent |
      MessageProcessedEvent
    >) => {
      const e = event.data
      console.log("ui got", e.type, "event")
      switch(e.type) {
        case 'user':
          if (e.added) {
            setUsers((users) => {
              if (users.find(u => u.id === u.id)) return users
              return [...users, { name: e.userName, id: e.userID }]
            })
          } else {
            setUsers((users) => users.filter(u => u.id !== e.userID))
          }
          break;
        case 'settingsUpdate':
          setSetupState(e.settings);
          break
        case 'players':
          setPlayers(e.players)
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
      {gameState.state.winner !== undefined ? <span>Game is done! {gameState.state.winner === gameState.position ? "YOU WIN": "YOU LOSE"}</span> : gameState.state.possibleGuesses.map(n => <button onClick={() => makeMove(n)} key={n}>{n}</button>)}
      <pre>{JSON.stringify(gameState, null, 2)}</pre>
    </> : <>
      <input type="checkbox" checked={setupState ? setupState.evenOnly : false} onChange={e => setSetupState({evenOnly: e.currentTarget.checked})} />Even numbers only
      <h2>Players</h2>
      <ul>
      {players.map(p => <li key={p.position}>{p.name}</li>)}
      </ul>
      <button onClick={() => startGame()}>Start game</button>
    </>}
  </div>
}

const rootElement = document.getElementById('root')!
const root = ReactDOM.createRoot(rootElement);
root.render(<Game />);
