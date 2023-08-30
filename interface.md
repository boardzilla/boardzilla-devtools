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
type Message = {
  position: number
  body: string
}

type Player = {
  position: number
  name: string
  color: string
}

type PlayerState = {
  position: number
  state: any
}

export type GameState = any

type GameUpdate = {
  game: GameState
  players: PlayerState[]
  messages: Message[]
}

export type HistoryItem = {
  seq: number
  data: GameUpdate | undefined
  move: any
}

initialState(players: Player[], setup: any): GameUpdate
processMove(previousState: GameState, position: number, move: number): GameUpdate
```

### UI

```ts

type SetStateData = {
  type: "setState",
  data: any
}

type MoveErrorData = {
  type: "moveError"
  error: string
  move: any
}

window.addEventListener('message', (evt: MessageEvent<SetStateData | MoveErrorData>))
```
