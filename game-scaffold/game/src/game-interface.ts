import setup from './index';
import { createInteface } from 'boardzilla/game/utils';

const { initialState, processMove, getPlayerState } = createInteface(setup)
export { initialState, processMove, getPlayerState };
