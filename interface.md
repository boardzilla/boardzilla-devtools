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

Must export an object `game` with two functions, `initialState` and `processMove`.

```ts
initialState(setup: SetupState): GameUpdate
processMove(previousState: GameState, move: Move): GameUpdate

type User = {
  id: string
  name: string
}

type Player = {
  userID?: string
  color: string
  name: string
  position: number
  settings?: any
}

type Message = {
  position: number
  body: string
}

type PlayerState = {
  position: number
  state: GameState
}

type GameSettings = Record<string, any>

type GameState = any

type SetupState = {
  players: Player[]
  settings: GameSettings
}

type GameUpdate = {
  game: GameState
  players: PlayerState[]
  messages: Message[]
}

type Move = {
  position: number
  data: any
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
  MessageProcessedEvent
>))
window.top.postMessage(m: UpdateSettingsMessage | UpdatePlayersMessage | StartMessage | UpdateSelfPlayerMessage | ReadyMessage)
```

Only the host is permitted to send `UpdatePlayerMessage`.

During "started", it will recv the following events.

```ts
window.addEventListener('message', (evt: MessageEvent<
  GameUpdateEvent |
  MessageProcessed
>))
window.top.postMessage(m: MoveMessage | ReadyMessage)
```

#### recv events by ui
```ts

type UserEvent = {
  type: "user"
  user: User
  added: boolean
}

type PlayersEvent = {
  type: "player"
  players: Player[]
}

// an update to the setup state
type SettingsUpdateEvent = {
  type: "settingsUpdate"
  settings: GameSettings
}

type GameUpdateEvent = {
  type: "gameUpdate"
  state: GameState
  messages: Message[]
}

// indicates the disposition of a message that was processed
type MessageProcessedEvent = {
  type: "messageProcessed"
  id: string
  error?: string
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

// host only
type UpdatePlayersMessage = {
  type: "updatePlayer"
  id: string
  players: Partial<Player>[]
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
{userID: string, host: bool}
```
