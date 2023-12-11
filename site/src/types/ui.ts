import * as Game from './game'

type User = {
  id: string
  name: string
  avatar: string
  playerDetails?: {
    color: string
    position: number
    settings?: any
  }
}

export type UsersEvent = {
  type: "users"
  users: User[]
}

// an update to the setup state
export type SettingsUpdateEvent = {
  type: "settingsUpdate"
  settings: Game.GameSettings
}

export type GameUpdateEvent = {
  type: "gameUpdate"
  state: Game.PlayerState
  currentPlayers: number[]
}

export type GameFinishedEvent = {
  type: "gameFinished"
  state: Game.PlayerState
  winners: number[]
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
  position: number
  userID: string
  color: string
  name: string
  settings?: any
}

type UnseatOperation = {
  type: 'unseat'
  userID: string
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

type PlayerOperation = SeatOperation | UnseatOperation | UpdateOperation | ReserveOperation

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

export type KeyMessage = {
  type: "key"
  code: string
}

// weird message for dark mode
export type SendDarkMessage = {
  type: 'sendDark'
}


export type DarkSettingEvent = {
  type: 'darkSetting'
  dark: boolean
}

