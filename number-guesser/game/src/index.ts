import { NumberGuesserGameMove, NumberGuesserGameState, NumberGuesserGameUpdate, NumberGuesserSetupState } from "../../types";

export function initialState(setup: NumberGuesserSetupState): NumberGuesserGameUpdate {
	const possibleGuesses: number[] = []
	for (let i = 0; i != 20; i += setup.settings.evenOnly ? 2 : 1) {
		possibleGuesses.push(i)
	}
	const currentPlayer = Math.min(...setup.players.map(p => p.position))
	const number = possibleGuesses[Math.floor(Math.random()*possibleGuesses.length)];
	return {
		game: {number, finished: false, move: 0, players: setup.players, currentPlayer, winner: undefined, possibleGuesses},
		players: setup.players.map(p => ({
			position: p.position,
			state: {
				currentPlayer,
				winner: undefined,
				move: 0,
				possibleGuesses,
			}
		})),
		messages: []
	}
}

export function processMove(state: NumberGuesserGameState, move: NumberGuesserGameMove): NumberGuesserGameUpdate {
	if (move.position !== state.currentPlayer) throw new Error ("not your turn");
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
		players: state.players.map(p => ({
			position: p.position,
			state: {
				currentPlayer: state.currentPlayer,
				winner: state.winner,
				move: state.move,
				possibleGuesses: state.possibleGuesses,
			}
		})),
		messages: []
	}
}
