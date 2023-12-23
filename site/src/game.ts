import * as Game from './types/game'

type pendingPromise = {
  resolve: (d: any) => void
  reject: (e: Error) => void
}
let pendingPromises = new Map<string, pendingPromise>()
let promiseSequence = 0;

export const resolveGamePromise = (id: string, result: any) => pendingPromises.get(id)!.resolve(result);
export const rejectGamePromise = (id: string, result: any) => pendingPromises.get(id)!.reject(result);

const sendToGame = async <T>(data: any) => {
  const id = String(promiseSequence++);
  return await new Promise<T>((resolve, reject) => {
    pendingPromises.set(id, { resolve, reject });
    (document.getElementById("game") as HTMLIFrameElement).contentWindow!.postMessage(Object.assign(data, { id }))
  });
};

export const sendInitialState = (setup: Game.SetupState): Promise<Game.GameUpdate> => {
  return sendToGame({ type: 'initialState', setup });
};

export const processMove = (previousState: Game.GameStartedState, move: Game.Move, trackMovement=true): Promise<Game.GameUpdate> => {
  return sendToGame({ type: 'processMove', previousState, move, trackMovement });
}

export const getPlayerState = (state: Game.InternalGameState, position: number): Promise<Game.InternalPlayerState> => {
  return sendToGame({ type: 'getPlayerState', state, position });
}
