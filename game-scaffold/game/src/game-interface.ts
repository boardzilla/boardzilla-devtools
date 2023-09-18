import gameInterface from './index';
import type { SetupState } from 'boardzilla/game/types';

const { initialState, processMove } = gameInterface;

const initialStateInterface = (state: SetupState) => {
  const game = initialState(state);
  return {
    game: game.getState(),
    players: game.getPlayerStates(),
    messages: []
  }
}
const processMoveInterface = (
  state: Parameters<typeof processMove>[0],
  move: Parameters<typeof processMove>[1]
) => {
  const game = processMove(state, move);
  return {
    game: game.getState(),
    players: game.getPlayerStates(),
    messages: []
  }
};

export {
  initialStateInterface as initialState,
  processMoveInterface as processMove
};
