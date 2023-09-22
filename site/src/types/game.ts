export type Player = {
  color: string
  name: string
  position: number
  settings?: any
}

export type Message = {
  position: number
  body: string
}

export type PlayerState = {
  position: number
  state: any
}

export type GameSettings = Record<string, any>
type GameState = any

type SetupState = {
  players: Player[]
  settings: GameSettings
}

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
}

export type ProcessMoveEvent = {
  type: "processMove"
  previousState: GameState
  move: Move
}

export type InitialStateResultMessage = {
  type: "initialStateResult"
  error: string | undefined
  state: GameUpdate
}

export type ProcessMoveResultMessage = {
  type: "processMoveResult"
  id: string
  error: string | undefined
  state: GameUpdate
}
