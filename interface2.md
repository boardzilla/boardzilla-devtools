# Boardzilla game packaging

## game.v1.json

```
{
  "name": "Number guesser",
  "minPlayers": 2,
  "maxPlayers": 2,
  "ui": {
    "root": "ui",
    "build": "npm run build",
    "src": "src",
    "out": "build"
  },
  "game": {
    "root": "game",
    "build": "npm run build",
    "src": "src",
    "artifact": "build/index.js"
  }
}
```

## Interface

### Game

Must export an object `game` with three functions, `initialState`, `processMove` and `getPlayerState`.

```ts
initialState(players: Player[], settings: GameSettings): GameStartedState
processMoves(previousState: GameStartedState, moves: Move[]): ProcessMoveResult
getPlayerState(state: GameStartedState | GameFinishedState, position: number): PlayerGameState

type Player = {
  color: string
  name: string
  position: number
  settings?: any
}

type GameSettings = Record<string, any>

type GameStartedState = {
  phase: 'started'
  currentPlayers: number[]
} & Record<string, any>

type GameFinishedState = {
  phase: 'finished'
  winners: number[]
} & Record<string, any>

type ProcessMoveResult = {
  error?: string
  states[]: GameStartedState | GameFinishedState
}

type Move = {
  position: number
  data: any
}

type PlayerGameState = {
  messages: string[]
  state: any
}

```

### UI

The game ui occurs in two phases "new" and "started".  The phase will be indicated by

During "new", it will recv the following messages.

```ts
window.addEventListener('message', (evt: MessageEvent<
  UserEvent |
  PlayersEvent |
  SettingsUpdateEvent |
  GameUpdateEvent |
  GameFinishedEvent |
  MessageProcessedEvent
>))
window.top.postMessage(m: UpdateSettingsMessage | UpdatePlayersMessage | StartMessage | UpdateSelfPlayerMessage | ReadyMessage)
```

Only the host is permitted to send `UpdatePlayerMessage`.

During "started", it will recv the following events.

```ts
window.addEventListener('message', (evt: MessageEvent<
  GameUpdateEvent |
  GameFinishedEvent |
  MessageProcessed
>))
window.top.postMessage(m: MoveMessage | ReadyMessage)
```

#### recv events by ui
```ts
type User = {
  id: string
  name: string
}

type UserPlayer = {
  color: string
  name: string
  position: number
  settings?: any
  userID?: string
}

type PlayersEvent = {
  type: "players"
  players: UserPlayer[]
  users: User[]
}

// an update to the setup state
type SettingsUpdateEvent = {
  type: "settingsUpdate"
  settings: GameSettings
}

type GameUpdateEvent = {
  type: "gameUpdate"
  state: PlayerState
  currentPlayers: number[]
}

type GameFinishedEvent = {
  type: "gameFinished"
  state: PlayerState
  winners: number[]
}

// indicates the disposition of a message that was processed
type MessageProcessedEvent = {
  type: "messageProcessed"
  id: string
  error?: string
}

type HighlightEvent = {
  type: "highlight"
  id: string
}

type UnhighlightAllEvent = {
  type: "unhighlightAll"
}
```

#### sent events by ui

```ts
// host only
type UpdateSettingsMessage = {
  type: "updateSettings"
  id: string
  settings: GameSettings
}

type SeatOperation = {
  type: 'seat'
  position: number
  userID: string
  color: string
  name: string
  settings?: any
}

type UnseatOperation = {
  type: 'unseat'
  position: number
}

type UpdateOperation = {
  type: 'update'
  position: number
  color?: string
  name?: string
  settings?: any
}

type ReserveOperation = {
  type: 'reserve'
  position: number
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
type MoveMessage = {
  type: 'move'
  id: string
  data: any
}

// bootstrap data
{userID: string, host: bool, minPlayers: number, maxPlayers: number}
```
