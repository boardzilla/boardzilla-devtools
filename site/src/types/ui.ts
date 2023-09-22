import * as Game from './game'

export type UserEvent = {
  type: "user"
  userID: string
  userName: string
  added: boolean
}

export type PlayersEvent = {
  type: "players"
  players: Game.Player[]
}

// an update to the setup state
export type SettingsUpdateEvent = {
  type: "settingsUpdate"
  settings: Game.GameSettings
}

export type GameUpdateEvent = {
  type: "gameUpdate"
  state: Game.PlayerState
}

// indicates the disposition of a message that was processed
export type MessageProcessedEvent = {
  type: "messageProcessed"
  id: string
  error?: string
}

export type UserPlayer = Game.Player & {
  userID?: string
}

// host only
export type UpdateSettingsMessage = {
  type: "updateSettings"
  id: string
  settings: Game.GameSettings
}

// host only
type SeatOperation = {
  type: 'seat'
  position: number,
  userID: string
  color: string
  name: string
  settings?: any
}

type UnseatOperation = {
  type: 'unseat'
  position: number,
}

type UpdateOperation = {
  type: 'update'
  position: number,
  color?: string
  name?: string
  settings?: any
}

type ReserveOperation = {
  type: 'reserve'
  position: number,
  color: string
  name: string
  settings?: any
}

type PlayerOperation = SeatOperation | UnseatOperation | UpdateOperation |ReserveOperation

// host only
export type UpdatePlayersMessage = {
  type: "updatePlayers"
  id: string
  operations: PlayerOperation[]
}

// host only
export type StartMessage = {
  type: "start"
  id: string
}

export type UpdateSelfPlayerMessage = {
  type: "updateSelfPlayer"
  id: string
  name: string
  color: string
}

export type ReadyMessage = {
  type: "ready"
}

// used to send a move
export type MoveMessage = {
  type: 'move'
  id: string
  data: any
}

export type SwitchPlayerMessage = {
  type: "switchPlayer"
  index: number
}
