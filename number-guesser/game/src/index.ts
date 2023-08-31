export type Player = {
  position: number
  name: string
  color: string
}

export type Message = {
  position: number
  body: string
}

export type PlayerState = {
  position: number
	winner : number | undefined
	currentPlayer: number,
	move: number
}

export type GameUpdate = {
  game: GameState
  players: PlayerState[]
  messages: Message[]
}

type GameState = {
	currentPlayer: number
	players: Player[]
  number: number
  finished: boolean
  move: number
	winner: number | undefined
}

type Move<T> = {
	id: string
	data: T
}

type NumberGuessingMove = {
	number: number
}


export function initialState(players: Player[], setup: {}): GameUpdate {
	const currentPlayer = Math.min(...players.map(p => p.position))
	return {
		game: {number: 5, finished: false, move: 0, players, currentPlayer, winner: undefined},
		players: players.map(p => { return {
			position: p.position,
			currentPlayer,
			winner: undefined,
			move: 0,
		}}),
		messages: []
	}
}

export function processMove(state: GameState, position: number, move: Move<NumberGuessingMove>): GameUpdate {
	if (position !== state.currentPlayer) throw new Error ("not your turn");
	if (move.data.number === state.number) {
		state.finished = true
		state.winner = state.currentPlayer
	} else {
		state.move++
		let positions = state.players.map(p => p.position)
		positions.sort()
		const currentIndex = positions.indexOf(state.currentPlayer)
		state.currentPlayer = currentIndex === positions.length - 1 ? positions[0] : positions[currentIndex+1]
	}
	return {
		game: state,
		players: state.players.map(p => { return {
			position: p.position,
			currentPlayer: state.currentPlayer,
			winner: state.winner,
			move: state.move,
		}}),
		messages: []
	}
}
