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


export type GameSettings = Record<string, any>
export type GameState = Record<string, any>
export type PlayerState = Record<string, any>

export type SetupState = {
  players: Player[]
  settings: GameSettings
}

export type GameUpdate = {
  game: GameState
  players: {
    position: number
    state: PlayerState
  }[]
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
  rseed: string
}

export type ProcessMoveEvent = {
  type: "processMove"
  previousState: GameState
  move: Move
  id: string
  rseed: string
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
  state: GameState
}
