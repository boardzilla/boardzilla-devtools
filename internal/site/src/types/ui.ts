import * as Game from './game'

export type User = {
  id: string
  name: string
  avatar: string
  playerDetails?: {
    color: string
    position: number
    ready: boolean
    settings?: any
    sessionURL?: string // only exposed to host for reserved players
  };
};

export type UsersEvent = {
  type: "users"
  users: User[]
}

export type OpenSeatsEvent = {
  type: "openSeats";
  openSeats: boolean[];
};

// an update to the setup state
export type SettingsUpdateEvent = {
  type: "settingsUpdate"
  settings: Game.GameSettings
  seatCount: number
}

export type GameUpdateEvent = {
  type: "gameUpdate"
  state: Game.InternalPlayerState
  position: number
  currentPlayers: number[]
  readOnly?: boolean
}

export type GameFinishedEvent = {
  type: "gameFinished"
  state: Game.InternalPlayerState
  position: number
  winners: number[]
}

// indicates the disposition of a message that was processed
export type MessageProcessedEvent = {
  type: "messageProcessed"
  id: string
  error?: string
}

export type UserPlayer = Game.Player

// host only
export type UpdateSettingsMessage = {
  type: "updateSettings"
  id: string
  settings: Game.GameSettings
  seatCount: number
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

type OpenSeatOperation = {
  type: 'openSeat'
  position: number
  open: boolean
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

type PlayerOperation = SeatOperation | UnseatOperation | OpenSeatOperation | UpdateOperation | ReserveOperation

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
  name?: string
  color?: string
  position?: number
  ready?: boolean
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

export type UserOnlineEvent = {
  type: "userOnline";
  id: string;
  online: boolean;
};
