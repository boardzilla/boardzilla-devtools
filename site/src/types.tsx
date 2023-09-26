import * as Game from './types/game'
import * as UI from './types/ui'

export type HistoryItem = {
  seq: number
  state: Game.GameState
  move: any
  rseed: string
  position: number
}

export type InitialStateHistoryItem = {
  state: Game.GameState
  players: UI.UserPlayer[]
  settings: any
  rseed: string
}
