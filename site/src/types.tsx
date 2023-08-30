export type Message = {
  position: number
  body: string
}

export type Player = {
  position: number
  name: string
  color: string
}

export type PlayerState = {
  position: number
  state: any
}

export type GameState = any

export type GameUpdate = {
  game: GameState
  players: PlayerState[]
  messages: Message[]
}

export type HistoryItem = {
  seq: number
  data: GameUpdate | undefined
  move: any
}

