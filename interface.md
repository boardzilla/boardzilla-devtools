# Boardzilla game packaging

## Common types

```ts

type Player = {
  position: number
  name: string
  color: string
}

```

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
window.addEventListener('message', (evt: MessageEvent<MoveProcessed | UpdateEvent | MessageProcessed>))
window.top.postMessage(m: MoveMessage | UndoMessage | ReadyMessage)

```

```ts

type PlayerEvent = {
  player: Player
  added: boolean
}

type UpdateEvent = {
  phase: "new" | "started"
  state: any
}

type MoveMessage = {
  id: string
  type: 'move'
  data: any
}

type UndoMessage = {
  id: string
  type: 'undo'
  steps: number
}

type StartMessage = {
  id: string
  type: 'start'
  setup: any
  players: Player[]
}

type ReadyMessage = {
  id: string
  type: 'ready'
  setup: any
  players: Player[]
}

type MessageProcessed = {
  type: "messageProcessed"
  id: string
  error: string | undefined
}

// data-bootstrap-json="{ json encoded UpdateEvent }" on body
```
