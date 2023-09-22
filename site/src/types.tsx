import * as Game from './types/game'

export type HistoryItem = {
  seq: number
  data: Game.GameUpdate
  move: any
  rseed: string
  position: number
}

export type InitialStateHistoryItem = {
  data: Game.GameUpdate
  players: Game.Player[]
  settings: any
  rseed: string
}


