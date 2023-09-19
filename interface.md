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
  playerInfo: PlayerInfo | undefined
}

type PlayerInfo = {
  position: number
  color: string
  settings: any
}

type Message = {
  position: number
  body: string
}

type PlayerState = {
  position: number
  state: any // Game state, scrubbed
}

type GameSettings = Record<string, any>
type GameState = any

type SetupState = {
  users: User[]
  settings: GameSettings
}

type GameUpdate = {
  game: GameState
  players: PlayerState[]
  messages: Message[]
}

/*
{
  players: (Player & Record<string, any>)[] // Game-specific player object
  settings: GameSettings
  currentPlayerPosition: number
  position: any[]
  board: any // json tree
}
*/


type Move = {
  position: number
  data: any // string[]
}
```

### UI

The game ui occurs in two phases "new" and "started".  The phase will be indicated by

During "new", it will recv the following events.

```ts
// host-only
window.addEventListener('message', (evt: MessageEvent<
  GameUpdateEvent |
  SetupUpdateEvent |
  MessageProcessed
>))
window.top.postMessage(m: UpdateSettingsMessage | UpdatePlayerAsHostMessage | UpdatePlayerMessage | StartMessage | ReadyMessage)
```

During "started", it will recv the following events.

```ts
window.addEventListener('message', (evt: MessageEvent<
  GameUpdateEvent |
  SetupUpdateEvent |
  MessageProcessed
>))
window.top.postMessage(m: UpdatePlayerMessage | ReadyMessage)
```

// set position
// set metadata on player
// set game settings
// update color & name

// all of this is communicated back out via settings json
type SetupState = {
  players: (Player & { settings: Record<string, any> })[] // permit add'l per-player settings
  settings: GameSettings

}

#### recv events by ui
```ts

type GameUpdateEvent = {
  type: "gameUpdate"
  state: any
}

// non-host
// an update to the setup state
type SetupUpdateEvent = {
  type: "setupUpdate"
  state: SetupState
}

// indicates the disposition of a message that was processed
type MessageProcessed = {
  type: "messageProcessed"
  id: string
  error: string | undefined
}
```

StartMessage | ReadyMessage

#### sent events by ui

```ts
type UpdateSettingsMessage = {
  type: "updateSettings"
  id: string
  data: any
}

type UpdatePlayerAsHostMessage = {
  type: "updatePlayerAsHost"
  id: string
  userID: string
  info: Partial<PlayerInfo>
}

type UpdatePlayerMessage = {
  type: "updatePlayer"
  id: string
  name: string
  color: string
}

type StartMessage = {
  type: "start"
  id: string
  setup: SetupState
}

type ReadyMessage = {
  type: "ready"
}

// all players
// used to send a move
type MoveMessage = {
  type: 'move'
  id: string
  data: any
}

// bootstrap data

{userID: number, host: bool}
```
