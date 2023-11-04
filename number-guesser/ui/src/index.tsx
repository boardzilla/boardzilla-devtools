import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Message, NumberGuesserMove, NumberGuesserPlayer, NumberGuesserPlayerState, NumberGuesserSettings, PlayerState } from '../../types';

type Bootstrap = {
  userID: string
  host: boolean
  minPlayers: number
  maxPlayers: number
}

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
  currentPlayers: number[]
}

type GameFinishedEvent = {
  type: "gameFinished"
  state: PlayerState<NumberGuesserPlayerState>
  winners: number[]
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
  settings: NumberGuesserSettings | {}
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
const bootstrap = JSON.parse(body.getAttribute("data-bootstrap-json")!) as Bootstrap;

type pendingPromise = {
  resolve: (d: any) => void
  reject: (e: Error) => void
}
const pendingPromises = new Map<string, pendingPromise>()

const Game = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [players, setPlayers] = useState<NumberGuesserPlayer[]>([]);
  const [readySent, setReadySent] = useState<boolean>(false);
  const [phase, setPhase] = useState<"new" | "started" | "finished">("new");
  const [setupState, setSetupState] = useState<NumberGuesserSettings | {}>({evenOnly: false});
  const [gameState, setGameState] = useState<PlayerState<NumberGuesserPlayerState>>();
  const [error, setError] = useState<string>("");
  const [winner, setWinner] = useState<number | undefined>();

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
      GameFinishedEvent |
      SettingsUpdateEvent |
      MessageProcessedEvent
    >) => {
      const e = event.data
      console.log("got a", e.type, "message", e)
      switch(e.type) {
        case 'settingsUpdate':
        console.log("e.settings!!!", e.settings)
          setSetupState(e.settings);
          break
        case 'players':
          setPlayers(e.players)
          setUsers(e.users)
          break
        case 'gameUpdate':
          setPhase('started');
          setGameState(e.state);
          break
        case 'gameFinished':
          setPhase('finished');
          setGameState(e.state);
          setWinner(e.winners[0])
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
    <pre>{JSON.stringify(bootstrap)}</pre>
    {error !== "" && <div style={{backgroundColor: "#faa", margin: '4px'}}>{error}</div>}
    {phase === 'finished' && <span>Game is done! {winner === gameState?.position ? "YOU WIN": "YOU LOSE"}</span>}
    {phase === 'started' && gameState?.state.possibleGuesses.map(n => <button onClick={() => makeMove(n)} key={n}>{n}</button>)}
    {phase === 'new' && <>
      {bootstrap.host && <p><input type="checkbox" checked={(setupState as any)['evenOnly'] ? true : false} onChange={e => setSetupState({evenOnly: e.currentTarget.checked})} />Even numbers only</p>}
      <h2>Users</h2>
      <ul>
        {users.map(p => <li key={p.id}>{p.name}</li>)}
      </ul>
      {bootstrap.host && <button onClick={() => startGame()}>Start game</button>}</>}

  </div>
}

const rootElement = document.getElementById('root')!
const root = ReactDOM.createRoot(rootElement);
root.render(<Game />);
