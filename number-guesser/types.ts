export type Player<T> = {
  color: string
  name: string
  position: number
  settings?: any
}

export type Message = {
  position: number
  body: string
}

export type PlayerState<T> = {
  position: number
  state: T
}

export type GameSettings = Record<string, any>

export type SetupState<P, G extends GameSettings> = {
  players: Player<P>[]
  settings: G
}

export type GameUpdate<G, P> = {
  game: G
  players: PlayerState<P>[]
  messages: Message[]
}

export type GameMove<T> = {
	position: number
	data: T
}

// number guesser specific types...
type _NumberGuesserPlayerSetup = void

export type NumberGuesserPlayerState = {
  winner: number | undefined
  currentPlayer: number
  possibleGuesses: number[]
  move: number
}

export type NumberGuesserGameState = {
	currentPlayer: number
	players: Player<_NumberGuesserPlayerSetup>[]
  number: number
  finished: boolean
  move: number
	winner: number | undefined
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
