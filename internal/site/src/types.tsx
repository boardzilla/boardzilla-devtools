import * as Game from "./types/game";
import * as UI from "./types/ui";

export type HistoryItem = {
  seq: number;
  state: Game.GameUpdate;
  data: any;
  position: number;
};

export type InitialStateHistoryItem = {
  state: Game.GameUpdate;
  players: UI.UserPlayer[];
  settings: any;
};
