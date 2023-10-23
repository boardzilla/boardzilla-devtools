export type Player<T> = {
  color: string
  name: string
  position: number
  settings?: T
}

export type Message = {
  position?: number
  body: string
}

export type PlayerState<T> = {
  position: number
  state: T
}

export type StartedPlayerState<T> = {
  phase: "started"
  currentPlayers: number[]
  position: number
  state: T
}

export type FinishedPlayerState<T> = {
  phase: "finished"
  winners: number[]
  position: number
  state: T
}

export type AnyPlayerState<T> = StartedPlayerState<T> | FinishedPlayerState<T>

export type GameSettings = Record<string, any>

export type SetupState<P, S extends GameSettings> = {
  players: Player<P>[]
  settings: S
}

export type GameStartedState<G> = {
  phase : 'started'
  currentPlayers: number[]
} & G

export type GameFinishedState<G> = {
  phase: 'finished'
  winners: number[]
} & G

export type GameAnyState<G> = GameStartedState<G> | GameFinishedState<G>

export type GameUpdate<G, P> = {
  game: GameAnyState<G>
  players: PlayerState<P>[]
  messages: Message[]
}

export type GameMove<T> = {
	position: number
	data: T
}

// number guesser specific types...
type _NumberGuesserPlayerSetup = void

export type NumberGuesserGamePlayerState = {
  possibleGuesses: number[]
  move: number
}

export type NumberGuesserPlayerState = {
  possibleGuesses: number[]
  move: number
}

export type NumberGuesserGameState = {
	players: Player<_NumberGuesserPlayerSetup>[]
  number: number
  move: number
	possibleGuesses: number[]
}

export type NumberGuesserSettings = {
  evenOnly: boolean
}

export type NumberGuesserMove = {
	number: number
}

export type NumberGuesserPlayer = Player<_NumberGuesserPlayerSetup>
export type NumberGuesserSetupState = SetupState<_NumberGuesserPlayerSetup, NumberGuesserSettings>
export type NumberGuesserGameUpdate = GameUpdate<NumberGuesserGameState, NumberGuesserPlayerState>
export type NumberGuesserGameMove = GameMove<NumberGuesserMove>
