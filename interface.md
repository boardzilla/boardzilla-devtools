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

type Player = {
  id: string
  position: number
  name: string
  color: string
}

type Message = {
  position: number
  body: string
}

type PlayerState = {
  position: number
  state: GameState // Game state, scrubbed
}

type GameSettings = Record<string, any>

type GameState = any
/*
{
  players: (Player & Record<string, any>)[] // Game-specific player object
  settings: GameSettings
  currentPlayerPosition: number
  position: any[]
  board: any // json tree
}
*/

type SetupState = {
  players: (Player & { settings: Record<string, any> })[] // permit add'l per-player settings
  settings: GameSettings
}

type GameUpdate = {
  game: GameState
  players: PlayerState[]
  messages: Message[]
}

type Move = {
  position: number
  data: any // string[]
}
```

### UI

The game ui occurs in two phases "new" and "started".  The phase will be indicated by

During "new", it will recv the following events.

```ts
window.addEventListener('message', (evt: MessageEvent<UserEvent | SetupUpdateEvent | MessageProcessed>))
window.top.postMessage(m: SetupUpdated, PlayerUpdated, StartMessage | ReadyMessage)

```

During "started", it will recv the following events.

```ts
window.addEventListener('message', (evt: MessageEvent<GameUpdateEvent | MessageProcessed>))
window.top.postMessage(m: MoveMessage | ReadyMessage)

```

#### recv events by ui
```ts

// host-only
// indicates a user was added
type UserEvent = {
  type: "user"
  id: string
  name: string
  added: boolean
}

type PlayerUpdateEvent = {
  type: "player"
  id: string
  name: string
  color: string
}

// non-host
// an update to the setup state
type SetupUpdateEvent = {
  type: "setupUpdate"
  state: SetupState
}

// all players
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
```

#### sent events by ui

```ts
// host-only
// used to update the current setup json state
type SetupUpdated = {
  type: "setupUpdated"
  data: SetupState
}

// non-host
type PlayerUpdated = {
  type: "player"
  name: string
  color: string
}

// all players
// used to send a move
type MoveMessage = {
  id: string
  type: 'move'
  data: any
}

// used to actually start the game
type StartMessage = {
  id: string
  type: 'start'
  setup: SetupState
}

// used to tell the top that you're ready to recv events
type ReadyMessage = {
  type: 'ready'
}
```
