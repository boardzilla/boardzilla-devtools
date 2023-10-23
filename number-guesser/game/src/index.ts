import { NumberGuesserGameMove, NumberGuesserGameState, NumberGuesserGameUpdate, NumberGuesserSetupState, NumberGuesserPlayerState, GameStartedState, GameFinishedState, GameAnyState } from "../../types";

export function initialState(setup: NumberGuesserSetupState): NumberGuesserGameUpdate {
	const possibleGuesses: number[] = []
	for (let i = 0; i != 20; i += setup.settings.evenOnly ? 2 : 1) {
		possibleGuesses.push(i)
	}
	const currentPlayer = Math.min(...setup.players.map(p => p.position))
	const number = possibleGuesses[Math.floor(Math.random()*possibleGuesses.length)];
	const game = {number, move: 0, players: setup.players, currentPlayers: [currentPlayer], possibleGuesses, phase: <const>"started"}
	return {
		game,
		players: setup.players.map(p => ({
			position: p.position,
			state: getPlayerState(game, p.position)
		})),
		messages: [{
			body: "Let's guess some numbers!"
		}]
	}
}

export function processMove(state: GameAnyState<NumberGuesserGameState>, move: NumberGuesserGameMove): NumberGuesserGameUpdate {
	if (state.phase !== 'started') throw new Error("cannot act on non started phase")
	const currentPlayer = state.players.find(p => p.position === state.currentPlayers[0])
	if (move.position !== currentPlayer?.position) throw new Error ("not your turn");
	if (move.data.number === state.number) {
		return {
			game: {
				number: state.number,
				move: state.move+1,
				players: state.players,
				possibleGuesses: state.possibleGuesses,
				phase: "finished",
				winners: [move.position],
			},
			players: state.players.map(p => ({
				position: p.position,
				state: getPlayerState(state, p.position)
			})),
			messages: [{
				body: `${currentPlayer!.name} won!`
			}]
		}
	}
	state.move++
	let positions = state.players.map(p => p.position)
	positions.sort()
	const currentIndex = positions.indexOf(state.currentPlayers[0])
	state.currentPlayers = [currentIndex === positions.length - 1 ? positions[0] : positions[currentIndex+1]]
	return {
		game: state,
		players: state.players.map(p => ({
			position: p.position,
			state: getPlayerState(state, p.position)
		})),
		messages: [{
			body: `${currentPlayer!.name} guessed ${move.data.number}`
		}]
	}
}

export function getPlayerState(state: NumberGuesserGameState, position: number): NumberGuesserPlayerState {
	return {
		move: state.move,
		possibleGuesses: state.possibleGuesses,
	}
}
