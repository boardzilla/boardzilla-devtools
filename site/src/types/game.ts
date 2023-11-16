export type Player = {
  color: string
  name: string
  avatar: string
  position: number
  settings?: any
}

export type Message = {
  position: number
  body: string
}

export type GameSettings = Record<string, any>
export type PlayerGameState = Record<string, any>

export type PlayerState = {
  position: number
  state: PlayerGameState
}

export type SetupState = {
  players: Player[]
  settings: GameSettings
}

export type GameStartedState = {
  currentPlayers: number[]
  phase: 'started'
} & Record<string, any>

export type GameFinishedState = {
  winners: number[]
  phase: 'finished'
} & Record<string, any>

export type GameState = GameStartedState | GameFinishedState

export type GameUpdate = {
  game: GameState
  players: PlayerState[]
  messages: Message[]
}

export type Move = {
  position: number
  data: any
}

export type InitialStateEvent = {
  type: "initialState"
  setup: SetupState
  id: string
}

export type ProcessMoveEvent = {
  type: "processMove"
  previousState: GameState
  move: Move
  id: string
}

export type GetPlayerStateEvent = {
  type: "getPlayerState"
  id: string
  state: GameState
  position: number
}

export type InitialStateResultMessage = {
  type: "initialStateResult"
  id: string
  state: GameUpdate
}

export type ProcessMoveResultMessage = {
  type: "processMoveResult"
  id: string
  error: string | undefined
  state: GameUpdate
}

export type GetPlayerStateMessage = {
  type: "getPlayerStateResult"
  id: string
  state: PlayerGameState
}
