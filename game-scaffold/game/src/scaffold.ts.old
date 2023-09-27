import setup, {
  Game,
  Action,
  MoveAction,
  Board,
  Space,
  Piece,
  union,
  Sequence,
  PlayerAction,
  Step,
  Loop,
  EachPlayer,
  Player,
} from 'boardzilla/game';

export class TestBoard extends Board { tokens: number = 0 };
export class Token extends Piece { color?: string };
export class TestPlayer extends Player { score: number = 0 };

export default setup({
  playerClass: TestPlayer,
  boardClass: TestBoard,
  elementClasses: [Token],
  players: [
    { userId: 101, name: 'Joe', color: 'red', position: 1, score: 0 },
    { userId: 102, name: 'Jane', color: 'green', position: 2, score: 0 },
    { userId: 103, name: 'Jag', color: 'yellow', position: 3, score: 0 },
    { userId: 104, name: 'Jin', color: 'purple', position: 4, score: 0 },
  ],

  setupBoard: (game, board) => {
    const deck = board.create(Space, "deck");
    const discard = board.create(Space, "discard");
    const hand = board.create(Space, "hand");

    deck.create(Token, "A", {player: game.players[0]});
    deck.create(Token, "B", {player: game.players[1], color: 'red'});
    deck.create(Token, "C", {player: game.players[1]});
    deck.create(Token, "D", {player: game.players[0]});
    deck.create(Token, "E", {player: game.players[0]});
    discard.create(Token, "F", {player: game.players[1]});
    discard.create(Token, "G", {player: game.players[0]});
    hand.create(Token, "H", {player: game.players[1]});
    hand.create(Token, "I", {player: game.players[0]});
  },

  setupFlow: (game, board) => new Sequence({
    steps: [
      new Step({ command: () => board.tokens = 4 }),
      new Loop({ while: () => board.tokens < 8, do: (
        new PlayerAction({ actions: {
          addSome: null,
          discardToken: null,
          takeToken: null,
          returnToken: null
        }})
      )}),
      new Loop({ while: () => board.tokens > 0, do: (
        new EachPlayer({ do: (
          new PlayerAction({ actions: {
            takeOne: null,
          }})
        )})
      )})
    ]
  }),

  actions: (game, board) => {
    const deck = board.first('deck')!;
    const discard = board.first('discard')!;
    const hand = board.first('hand')!;
    return {
      addSome: () => new Action({
        prompt: 'add some counters',
        selections: [{
          prompt: 'how many?',
          selectNumber: {
            min: 1,
            max: 3,
          }
        }],
        move: (n: number) => board.tokens += n
      }),
      takeOne: () => new Action({
        prompt: 'take one counter',
        move: () => board.tokens -= 1,
      }),
      discardToken: () => new MoveAction({
        prompt: 'discard token',
        piece: {
          chooseFrom: deck.all(Token),
        },
        to: discard,
      }),
      returnToken: () => new MoveAction({
        prompt: 'put token back',
        piece: {
          chooseFrom: union(discard, hand).all(Token)
        },
        to: deck,
      }),
      takeToken: () => new MoveAction({
        prompt: 'take token',
        promptTo: 'to where',
        piece: {
          chooseFrom: discard.all(Token)
        },
        to: {
          chooseFrom: [deck, hand]
        },
      }),
      sayHi: () => new Action({
        prompt: 'Hi',
        selections: [{
          prompt: 'Say it',
          enterText: {}
        }],
        move: () => {},
      })
    };
  }
});
