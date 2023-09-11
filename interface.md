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

```ts
// submit move with ...

type UIMove = {
  id: string
  data: any
}

window.top.postMessage(m: UIMove)

type SetStateData = {
  type: "setState",
  data: any
}

type MoveProcessed = {
  type: "moveProcessed"
  id: string
  error: string?
}

window.addEventListener('message', (evt: MessageEvent<SetStateData | MoveErrorData>))
```
