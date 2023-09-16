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
initialState(players: Player[], setup: any): GameUpdate
processMove(previousState: GameState, move: Move): GameUpdate

type Player = {
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
  state: GameState
}

type GameState = any

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

During "new", it will recv the following events.

```ts
window.addEventListener('message', (evt: MessageEvent<PlayerEvent | UpdateEvent | MessageProcessed>))
window.top.postMessage(m: StartMessage | ReadyMessage)

```

During "started", it will recv the following events.

```ts
window.addEventListener('message', (evt: MessageEvent<UpdateEvent | MessageProcessed>))
window.top.postMessage(m: MoveMessage | ReadyMessage)

```

#### recv events by ui
```ts

type Player = {
  id: string
  name: string
  color: string
  position: number
}

// indicates a player was added
type PlayerEvent = {
  type: "player"
  player: Player
  added: boolean
}

// an update to the current game state
type UpdateEvent = {
  type: "update"
  phase: "new" | "started"
  state: any
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
// used to update the current setup json state
type SetupUpdated = {
  type: "setupUpdated"
  data: any
}

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
  setup: any
  players: Player[]
}

// used to tell the top that you're ready to recv events
type ReadyMessage = {
  type: 'ready'
}
```
