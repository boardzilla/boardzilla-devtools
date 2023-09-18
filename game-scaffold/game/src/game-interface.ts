import setup from './index';
import { createInteface } from 'boardzilla/game/utils';

const { initialState, processMove } = createInteface(setup)
export { initialState, processMove };
