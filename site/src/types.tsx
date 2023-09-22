import * as Game from './types/game'

export type HistoryItem = {
  seq: number
  data: Game.GameUpdate | undefined
  move: any
  position: number
}

