# Boardzilla game packaging

## game.v1.json

```
{
  "minPlayers": 2,
  "maxPlayers": 2,
  "defaultPlayers": 2 // optional, implied if min == max, default min
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
processMove(previousState: GameStartedState, move: Move): GameUpdate

type Player = {
  id: string
  color: string
  name: string
  position: number
  avatar: string
  host: boolean
  settings?: any
}

type Message = {
  position?: number
  body: string
}

type GameSettings = Record<string, any>

type InternalGameState = any

type InternalPlayerState = any

type GameStartedState = {
  currentPlayers: number[]
  phase: 'started'
  state: InternalGameState
}

type GameFinishedState = {
  winners: number[]
  phase: 'finished'
  state: InternalGameState
}

type GameState = GameStartedState | GameFinishedState

type SetupState = {
  players: Player[]
  settings: GameSettings
}

type PlayerState = {
  position: number
  state: InternalPlayerState
  summary?: string
  score?: number
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

The game ui occurs in three phases "new", "started" and "finished".

During "new", it will recv the following messages.

```ts
window.addEventListener('message', (evt: MessageEvent<
  UsersEvent |
  SettingsUpdateEvent |
  GameUpdateEvent |
  GameFinishedEvent |
  MessageProcessedEvent
  UserOnlineEvent
>))
window.top.postMessage(m: UpdateSettingsMessage | UpdatePlayersMessage | StartMessage | UpdateSelfPlayerMessage | ReadyMessage)
```

Only the host is permitted to send `UpdatePlayerMessage`.

During "started", it will recv the following events.

```ts
window.addEventListener('message', (evt: MessageEvent<
  GameUpdateEvent |
  GameFinishedEvent |
  MessageProcessed |
  UserOnlineEvent
>))
window.top.postMessage(m: MoveMessage | ReadyMessage)
```

Once a game has received `GameFinishedEvent`, it will receive no other events.

#### recv events by ui

```ts
type User = {
  id: string;
  name: string;
  avatar: string;
  playerDetails?: {
    color: string;
    position: number;
    ready: boolean;
    settings?: any;
    sessionURL?: string; // only exposed to host for reserved players
  };
};

type UsersEvent = {
  type: "users";
  users: User[];
};

type UserOnlineEvent = {
  type: "userOnline";
  id: string;
  online: boolean;
};

// an update to the setup state
type SettingsUpdateEvent = {
  type: "settingsUpdate";
  settings: GameSettings;
};

type GameUpdateEvent = {
  type: "gameUpdate";
  state: InternalPlayerState;
  position: number;
  currentPlayers: number[];
  readOnly?: boolean;
};

type GameFinishedEvent = {
  type: "gameFinished";
  state: InternalPlayerState;
  position: number;
  winners: number[];
};

// indicates the disposition of a message that was processed
type MessageProcessedEvent = {
  type: "messageProcessed";
  id: string;
  error?: string;
};
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
type SeatOperation = {
  type: 'seat'
  position: number
  userID: string
  color: string
  name: string
  settings?: any
}

// only host can specify any user id, rejected if non-host supplies other user id
type UnseatOperation = {
  type: 'unseat'
  userID: string
}

// host only
type OpenSeatOperation = {
  type: 'openSeat'
  position: number
  open: boolean
}

type UpdateOperation = {
  type: 'update'
  userID: string
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

type PlayerOperation = SeatOperation | UnseatOperation | UpdateOperation | ReserveOperation | OpenSeatOperation

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
  name?: string
  color?: string
  position?: number
  ready?: boolean
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
