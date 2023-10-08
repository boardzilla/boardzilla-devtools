import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Message, NumberGuesserMove, NumberGuesserPlayer, NumberGuesserPlayerState, NumberGuesserSettings, PlayerState } from '../../types';

type User = {
  id: string
  name: string
}

type PlayersEvent = {
  type: "players"
  players: NumberGuesserPlayer[]
  users: User[]
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
type SeatOperation = {
  type: 'seat'
  position: number,
  userID: string
  color: string
  name: string
  settings?: any
}

type UnseatOperation = {
  type: 'unseat'
  position: number,
}

type UpdateOperation = {
  type: 'update'
  position: number,
  color?: string
  name?: string
  settings?: any
}

type ReserveOperation = {
  type: 'reserve'
  position: number,
  color: string
  name: string
  settings?: any
}

type PlayerOperation = SeatOperation | UnseatOperation | UpdateOperation | ReserveOperation

// host only
type UpdatePlayersMessage = {
  type: "updatePlayers"
  id: string
  operations: PlayerOperation[]
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

const colors = [
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#666600",
  "#006666",
  "#660066",
  "#333333",
  "#ff6633",
  "#3366ff",
  "#f01a44",
]

const body = document.getElementsByTagName("body")[0];
const bootstrap = JSON.parse(body.getAttribute("data-bootstrap-json")!);

type pendingPromise = {
  resolve: (d: any) => void
  reject: (e: Error) => void
}
const pendingPromises = new Map<string, pendingPromise>()

const Game = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [players, setPlayers] = useState<NumberGuesserPlayer[]>([]);
  const [readySent, setReadySent] = useState<boolean>(false);
  const [phase, setPhase] = useState<"new" | "started">("new");
  const [setupState, setSetupState] = useState<NumberGuesserSettings>({evenOnly: false});
  const [gameState, setGameState] = useState<PlayerState<NumberGuesserPlayerState>>();
  const [error, setError] = useState<string>("");

  const sendToTop = useCallback(async (m:
    Omit<UpdateSettingsMessage, "id"> |
    Omit<UpdatePlayersMessage, "id"> |
    Omit<UpdateSelfPlayerMessage, "id"> |
    Omit<NumberGuesserMoveMessage, "id"> |
    Omit<StartMessage, "id"> |
    Omit<ReadyMessage, "id">) =>
  {
    const id = crypto.randomUUID()
    await new Promise((resolve, reject) => {
      pendingPromises.set(id, {resolve, reject})
      window.top!.postMessage({...m, id }, "*")
    })
  }, [])

  const makeMove = useCallback(async (n: number) => {
    try {
      await sendToTop({type: "move", data: {number: n}});
    } catch(e) {
      setError(String(e));
    }
  }, [])

  const startGame = useCallback(async () => {
    console.log("starting game...", setupState)
    await sendToTop({type: "updateSettings", settings: setupState})
    console.log("done sending settings", users.length)
    await sendToTop({type: "updatePlayers", operations: users.map((u, i) => ({
      type: "seat",
      position: i,
      userID: u.id,
      color: colors[i],
      name: u.name
    }))})
    console.log("done stting players")
    sendToTop({type: "start"})
    console.log("done stting")
  }, [setupState, players, users])

  useEffect(() => {
    const listener = (event: MessageEvent<
      PlayersEvent |
      GameUpdateEvent |
      SettingsUpdateEvent |
      MessageProcessedEvent
    >) => {
      const e = event.data
      console.log("got a", e.type, "message", e)
      switch(e.type) {
        case 'settingsUpdate':
          console.log("!!!! got settings", e)
          setSetupState(e.settings);
          break
        case 'players':
          setPlayers(e.players)
          setUsers(e.users)
          break
        case 'gameUpdate':
          setPhase('started');
          console.log("e", e)
          setGameState(e.state);
          break
        case 'messageProcessed':
          console.log("about to resolve", e.id, e.error, pendingPromises)
          if (e.error) {
            pendingPromises.get(e.id)!.reject(new Error(e.error))
          } else {
            pendingPromises.get(e.id)!.resolve(null)
          }
          pendingPromises.delete(e.id);
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
    {JSON.stringify(bootstrap)}
    {error !== "" && <div style={{backgroundColor: "#faa", margin: '4px'}}>{error}</div>}
    {gameState ? <>
      {gameState.state.winner !== undefined ? <span>Game is done! {gameState.state.winner === gameState.position ? "YOU WIN": "YOU LOSE"}</span> : gameState.state.possibleGuesses.map(n => <button onClick={() => makeMove(n)} key={n}>{n}</button>)}
      <pre>{JSON.stringify(gameState, null, 2)}</pre>
    </> : <>
      <input type="checkbox" checked={setupState ? setupState.evenOnly : false} onChange={e => setSetupState({evenOnly: e.currentTarget.checked})} />Even numbers only
      <h2>Users</h2>
      <ul>
      {users.map(p => <li key={p.id}>{p.name}</li>)}
      </ul>
      <button onClick={() => startGame()}>Start game</button>
    </>}
  </div>
}

const rootElement = document.getElementById('root')!
const root = ReactDOM.createRoot(rootElement);
root.render(<Game />);
