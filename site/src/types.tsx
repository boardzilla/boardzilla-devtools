import * as Game from './types/game'
import * as UI from './types/ui'

export type HistoryItem = {
  seq: number
  state: Game.GameState
  move: any
  position: number
  messages: Game.Message[]
}

export type InitialStateHistoryItem = {
  state: Game.GameState
  players: UI.UserPlayer[]
  settings: any
}
