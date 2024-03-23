export type Player = {
  id: string;
  color: string;
  name: string;
  avatar: string;
  host: boolean;
  position: number;
  settings?: any;
};

export type Message = {
  position: number;
  body: string;
};

export type GameSettings = Record<string, any>;

export type InternalGameState = any;

export type InternalPlayerState = any;

export type GameStartedState = {
  currentPlayers: number[];
  phase: "started";
  state: InternalGameState;
};

export type GameFinishedState = {
  winners: number[];
  phase: "finished";
  state: InternalGameState;
};

export type GameState = GameStartedState | GameFinishedState;

export type SetupState = {
  randomSeed: string;
  players: Player[];
  settings: GameSettings;
};

export type PlayerState = {
  position: number;
  state: InternalPlayerState;
  summary?: string;
  score?: number;
};

export type GameUpdate = {
  game: GameState;
  players: PlayerState[];
  messages: Message[];
};

export type Move = {
  position: number;
  data: any;
};

export type InitialStateResultMessage = {
  type: "initialStateResult";
  id: string;
  state: GameUpdate;
};

export type ProcessMoveResultMessage = {
  type: "processMoveResult";
  id: string;
  error: string | undefined;
  state: GameUpdate;
};

export type ReprocessHistoryResultMessage = {
  type: "reprocessHistoryResult";
  id: string;
  error: string | undefined;
  initialState: GameUpdate;
  updates: GameUpdate[];
};

export type GetPlayerStateMessage = {
  type: "getPlayerStateResult";
  id: string;
  state: InternalPlayerState;
};

export type ReprocessHistoryResult = {
  initialState: GameUpdate;
  updates: GameUpdate[];
  error?: string;
};
