var game = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var src_exports = {};
  __export(src_exports, {
    initialState: () => initialState,
    processMove: () => processMove
  });
  function initialState(players, setup) {
    const currentPlayer = Math.min(...players.map((p) => p.position));
    return {
      game: { number: 5, finished: false, move: 0, players, currentPlayer, winner: void 0 },
      players: players.map((p) => {
        return {
          position: p.position,
          currentPlayer,
          winner: void 0,
          move: 0
        };
      }),
      messages: []
    };
  }
  function processMove(state, position, move) {
    if (position !== state.currentPlayer)
      throw new Error("not your turn");
    if (move.number === state.number) {
      state.finished = true;
      state.winner = state.currentPlayer;
    } else {
      state.move++;
      let positions = state.players.map((p) => p.position);
      positions.sort();
      const currentIndex = positions.indexOf(state.currentPlayer);
      state.currentPlayer = currentIndex === positions.length - 1 ? positions[0] : positions[currentIndex + 1];
    }
    return {
      game: state,
      players: state.players.map((p) => {
        return {
          position: p.position,
          currentPlayer: state.currentPlayer,
          winner: state.winner,
          move: state.move
        };
      }),
      messages: []
    };
  }
  return __toCommonJS(src_exports);
})();
