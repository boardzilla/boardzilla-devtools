import * as Game from './types/game'

type pendingPromise = {
  resolve: (d: Game.GameUpdate | Game.GameState) => void
  reject: (e: Error) => void
}
let pendingPromises: Record<string, pendingPromise> = {};
let promiseSequence = 0;

export const resolveGamePromise = (id: string, result: any) => pendingPromises[id].resolve(result);
export const rejectGamePromise = (id: string, result: any) => pendingPromises[id].reject(result);

const sendToGame = async (data: any) => {
  const id = String(promiseSequence++);
  return await new Promise((resolve, reject) => {
    pendingPromises[id] = { resolve, reject };
    (document.getElementById("game") as HTMLIFrameElement).contentWindow!.postMessage(Object.assign(data, { id }))
  });
};

export const sendInitialState = (setup: Game.SetupState, rseed: string) => {
  return sendToGame({ type: 'initialState', setup, rseed }) as Promise<Game.GameUpdate>;
};

export const processMove = (previousState: Game.GameState, move: Game.Move, rseed: string) => {
  return sendToGame({ type: 'processMove', previousState, move, rseed }) as Promise<Game.GameUpdate>;
}

export const getPlayerState = (state: Game.GameState, position: number) => {
  return sendToGame({ type: 'getPlayerState', state, position }) as Promise<Game.GameState>;;
}
