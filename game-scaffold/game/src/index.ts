/**
 * TODO
 * playing zones
 new Set(board.all(City, c => c.zone !== 'blue' && board.all(City, {zone: 'blue'}).some(c2 => c.adjacentTo(c2))).map(c => c.zone))
 * step 2/3
 * - replace the lowest plant at end of step3 round and beginning (only) of step2
 * - after step3 drawn, becomes highest plant. discard step3 and lowest after auction (or immediately if not auction) and do not replace(?), shuffle remainder
 * - step3 takes effect AFTER the current phase
 * - step3 triggers before step2, trigger step2 first
 * victory
 * - upon hitting score
 * - income instead creates the victory condition: # of cities powered, remaining elektro
 * 2-player rules add Trust...
 */

import setup, {
  Action,
  MoveAction,
  Player,
  Sequence,
  PlayerAction,
  Loop,
  Step,
  EachPlayer,
  IfElse,
  repeat,
  boardClasses,
} from 'boardzilla/game';

import { cards } from './cards';

export class PowergridPlayer extends Player {
  score: number = 0;
  elektro: number = 50;
  passedThisAuction: boolean = false;
  havePassedAuctionPhase: boolean = false;
};

const { Board, Space, Piece } = boardClasses<PowergridPlayer>();

type ResourceType = 'coal' | 'oil' | 'garbage' | 'uranium'
const resourceTypes: ResourceType[] = ['coal', 'oil', 'garbage', 'uranium'];

class PowergridBoard extends Board {
  step: number = 1;
  turn: number = 0;
  lastBid?: number;
  playerWithHighestBid?: PowergridPlayer;
  noMoreUranium = false;

  checkStepTriggers() {
    let advanceToStep2 = false;
    let advanceToStep3 = false;
    const powerplants = this.first('powerplants')!;
    const step2Score = this.game.players.length < 6 ? 7 : 6;
    if (this.step === 1 && this.game.players.max('score') >= step2Score) advanceToStep2 = true;
    if (powerplants.has('step-3')) advanceToStep3 = true;

    if (advanceToStep2) {
      this.game.message('Now in step 2');
      this.step = 2;
      powerplants.first(Card)?.remove();
      this.first('deck')!.top(Card)?.putInto(powerplants);
    }
    if (advanceToStep3) {
      this.game.message('Now in step 3');
      this.step = 3;
    }
  }

  sortPlayers(direction: 'asc' | 'desc') {
    this.game.players.sortBy([
      'score',
      player => this.all(Card, {player}).max('cost') || 0
    ], direction);
  }

  applyMinimumRule() {
    const powerplants = this.first('powerplants')!;
    for (const card of powerplants.all(Card)) {
      if (card.cost <= this.game.players.max('score')) {
        card.remove();
        this.first('deck')!.top(Card)?.putInto(powerplants);
      }
    }
  };

  refillResources(resource: ResourceType, amount: number) {
    if (resource === 'uranium' && this.noMoreUranium) return;
    for (const space of this.lastN(amount, ResourceSpace, {resource, empty: true})) {
      this.pile.first(Resource, resource)?.putInto(space)
    };
  }
}

export class Card extends Piece {
  image: string;
  cost: number;
  resourceType?: ResourceType | 'hybrid';
  resources?: number;
  power?: number;
  auction?: boolean = false;
  discount?: boolean = false;
  powered?: boolean = false;

  purchaseCost = () => this.discount ? 1 : this.cost;

  spaceFor(resource: ResourceType) {
    if (this.resourceType === resource || (this.resourceType === 'hybrid' && ['oil', 'coal'].includes(resource))) {
      return this.resources! * 2 - this.all(Resource).length;
    }
    return 0;
  }

  resourcesAvailableToPower() {
    const availableResources = this.all(Resource);
    if (availableResources.length >= this.resources!) return availableResources;
  }
}
Card.hiddenAttributes = ['name', 'image', 'cost', 'resourceType', 'resources', 'power'];

class Resource extends Piece {
  type: ResourceType;
}

class ResourceSpace extends Space {
  resource: ResourceType;
  cost: number;
}

class City extends Space {
  owners: PowergridPlayer[] = [];
  zone: string

  costToBuild() {
    const closestCity = this.closest(City, city => !!city.first(Building, {mine: true}));
    return [10, 15, 20][this.owners.length] + (closestCity ? this.distanceTo(closestCity)! : 0);
  }

  canBuild() {
    return this.owners.length < (this.board as PowergridBoard).step;
  }

  canBuildFor(elektro: number) {
    return this.canBuild() && elektro >= this.costToBuild();
  }
}

export class PlayerMat extends Space {
}

export class Building extends Piece {
  powered?: boolean;
}

const refill = {
  coal: [
    [3, 4, 3],
    [3, 4, 3],
    [4, 5, 3],
    [5, 6, 4],
    [5, 7, 5],
    [7, 9, 6],
  ],
  oil: [
    [2, 2, 4],
    [2, 2, 4],
    [2, 3, 4],
    [3, 4, 5],
    [4, 5, 6],
    [5, 6, 7],
  ],
  garbage: [
    [1, 2, 3],
    [1, 2, 3],
    [1, 2, 3],
    [2, 3, 4],
    [3, 3, 5],
    [3, 5, 6],
  ],
  uranium: [
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
    [1, 2, 2],
    [2, 3, 2],
    [2, 3, 3],
  ],
};

const income = [10, 22, 33, 44, 54, 64, 73, 82, 90, 98, 105, 112, 118, 124, 129, 134, 138, 142, 145, 148, 150];

export default setup({
  minPlayers: 1,
  maxPlayers: 4,
  playerClass: PowergridPlayer,
  boardClass: PowergridBoard,
  elementClasses: [
    Card,
    Resource,
    ResourceSpace,
    City,
    Building,
    PlayerMat
  ],
  setupBoard: (game, board) => {
    const map = board.create(Space, 'germany');
    const cuxhaven = map.create(City, 'Cuxhaven', {zone: 'green'})
    const bremen = map.create(City, 'Bremen', {zone: 'green'})
      .connectTo(cuxhaven, 8)
    const hannover = map.create(City, 'Hannover', {zone: 'green'})
      .connectTo(bremen, 10)
    const hamburg = map.create(City, 'Hamburg', {zone: 'green'})
      .connectTo(cuxhaven, 11)
      .connectTo(bremen, 11)
      .connectTo(hannover, 17)
    const kiel = map.create(City, 'Kiel', {zone: 'green'})
      .connectTo(hamburg, 8)
    map.create(City, 'Flensburg', {zone: 'green'})
      .connectTo(kiel, 4)
    const wilhelmshaven = map.create(City, 'Wilhelmshaven', {zone: 'green'})
      .connectTo(bremen, 11)

    const osnabruck = map.create(City, 'Osnabruck', {zone: 'red'})
      .connectTo(wilhelmshaven, 14)
      .connectTo(bremen, 11)
      .connectTo(hannover, 16)
    const munster = map.create(City, 'Münster', {zone: 'red'})
      .connectTo(osnabruck, 7)
    const essen = map.create(City, 'Essen', {zone: 'red'})
      .connectTo(munster, 6)
    map.create(City, 'Duisberg', {zone: 'red'})
      .connectTo(essen, 0)
    const dusseldorf = map.create(City, 'Dusseldorf', {zone: 'red'})
      .connectTo(essen, 2)
    const dortmund = map.create(City, 'Dortmund', {zone: 'red'})
      .connectTo(essen, 4)
      .connectTo(munster, 2)
    const kassel = map.create(City, 'Kassel', {zone: 'red'})
      .connectTo(hannover, 15)
      .connectTo(osnabruck, 20)
      .connectTo(dortmund, 18)

    const lubeck = map.create(City, 'Lübeck', {zone: 'brown'})
      .connectTo(kiel, 4)
      .connectTo(hamburg, 6)
    const schwerin = map.create(City, 'Schwerin', {zone: 'brown'})
      .connectTo(lubeck, 6)
      .connectTo(hamburg, 8)
      .connectTo(hannover, 19)
    const rostock = map.create(City, 'Rostock', {zone: 'brown'})
      .connectTo(schwerin, 6)
    const torgelow = map.create(City, 'Torgelow', {zone: 'brown'})
      .connectTo(rostock, 19)
      .connectTo(schwerin, 19)
    const berlin = map.create(City, 'Berlin', {zone: 'brown'})
      .connectTo(schwerin, 18)
      .connectTo(torgelow, 15)
    const magdeburg = map.create(City, 'Magdeburg', {zone: 'brown'})
      .connectTo(schwerin, 16)
      .connectTo(hannover, 15)
      .connectTo(berlin, 10)
    const frankfurto = map.create(City, 'Frankfurt-O', {zone: 'brown'})
      .connectTo(berlin, 6)

    const halle = map.create(City, 'Halle', {zone: 'yellow'})
      .connectTo(magdeburg, 11)
      .connectTo(berlin, 17)
    const leipzig = map.create(City, 'Leipzig', {zone: 'yellow'})
      .connectTo(halle, 0)
      .connectTo(frankfurto, 21)
    const dresden = map.create(City, 'Dresden', {zone: 'yellow'})
      .connectTo(leipzig, 13)
      .connectTo(frankfurto, 16)
    const erfurt = map.create(City, 'Erfurt', {zone: 'yellow'})
      .connectTo(halle, 6)
      .connectTo(hannover, 19)
      .connectTo(kassel, 15)
      .connectTo(dresden, 19)
    const fulda = map.create(City, 'Fulda', {zone: 'yellow'})
      .connectTo(kassel, 8)
      .connectTo(erfurt, 13)
    const wurzburg = map.create(City, 'Wurzburg', {zone: 'yellow'})
      .connectTo(fulda, 11)
    const nurnberg = map.create(City, 'Nurnberg', {zone: 'yellow'})
      .connectTo(wurzburg, 8)
      .connectTo(erfurt, 21)

    const koln = map.create(City, 'Koln', {zone: 'blue'})
      .connectTo(dusseldorf, 4)
      .connectTo(dortmund, 10)
    const aachen = map.create(City, 'Aachen', {zone: 'blue'})
      .connectTo(dusseldorf, 9)
      .connectTo(koln, 7)
    const trier = map.create(City, 'Trier', {zone: 'blue'})
      .connectTo(aachen, 19)
      .connectTo(koln, 20)
    const wiesbaden = map.create(City, 'Wiesbaden', {zone: 'blue'})
      .connectTo(koln, 21)
      .connectTo(trier, 18)
    map.create(City, 'Frankfurt-M', {zone: 'blue'})
      .connectTo(dortmund, 20)
      .connectTo(kassel, 13)
      .connectTo(fulda, 8)
      .connectTo(wiesbaden, 0)
      .connectTo(wurzburg, 13)
    const saarbrucken = map.create(City, 'Saarbrucken', {zone: 'blue'})
      .connectTo(trier, 11)
      .connectTo(wiesbaden, 10)
    const mannheim = map.create(City, 'Mannheim', {zone: 'blue'})
      .connectTo(wiesbaden, 11)
      .connectTo(saarbrucken, 11)
      .connectTo(wurzburg, 10)

    const stuttgart = map.create(City, 'Stuttgart', {zone: 'purple'})
      .connectTo(saarbrucken, 17)
      .connectTo(mannheim, 6)
      .connectTo(wurzburg, 12)
    const freiburg = map.create(City, 'Freiburg', {zone: 'purple'})
      .connectTo(stuttgart, 16)
    const konstanz = map.create(City, 'Konstanz', {zone: 'purple'})
      .connectTo(freiburg, 14)
      .connectTo(stuttgart, 16)
    const augsburg = map.create(City, 'Augsburg', {zone: 'purple'})
      .connectTo(stuttgart, 15)
      .connectTo(konstanz, 17)
      .connectTo(wurzburg, 19)
      .connectTo(nurnberg, 18)
    const regensburg = map.create(City, 'Regensburg', {zone: 'purple'})
      .connectTo(nurnberg, 12)
      .connectTo(augsburg, 13)
    const munchen = map.create(City, 'Munchen', {zone: 'purple'})
      .connectTo(augsburg, 6)
      .connectTo(regensburg, 10)
    map.create(City, 'Passau', {zone: 'purple'})
      .connectTo(regensburg, 12)
      .connectTo(munchen, 14)

    const resources = board.create(Space, 'resources');
    for (let cost = 1; cost <= 8; cost++) {
      resources.createMany(3, ResourceSpace, `coal-${cost}`, { cost, resource: 'coal' });
      resources.createMany(3, ResourceSpace, `oil-${cost}`, { cost, resource: 'oil' });
      resources.createMany(3, ResourceSpace, `garbage-${cost}`, { cost, resource: 'garbage' });
      resources.create(ResourceSpace, `uranium-${cost}`, { cost, resource: 'uranium' });
    };
    resources.create(ResourceSpace, 'uranium-10', { cost: 10, resource: 'uranium' });
    resources.create(ResourceSpace, 'uranium-12', { cost: 12, resource: 'uranium' });
    resources.create(ResourceSpace, 'uranium-14', { cost: 14, resource: 'uranium' });
    resources.create(ResourceSpace, 'uranium-16', { cost: 16, resource: 'uranium' });

    const powerplants = board.create(Space, 'powerplants');
    powerplants.onEnter(Card, c => {
      c.showToAll();
      board.applyMinimumRule();
      powerplants.sortBy<Card>('cost');
      const discount = powerplants.first(Card, { discount: true });
      if (discount && powerplants.first(Card) !== discount) {
        powerplants.first(Card)!.remove();
        discount.discount = false;
        deck.top(Card)?.putInto(powerplants);
      }
    })

    const deck = board.create(Space, 'deck');
    deck.onEnter(Card, c => c.hideFromAll());

    for (const [name, attrs] of Object.entries(cards)) deck.create(Card, name, attrs);
    board.pile.createMany(24, Resource, 'coal', { type: 'coal' });
    board.pile.createMany(24, Resource, 'oil', { type: 'oil' });
    board.pile.createMany(24, Resource, 'garbage', { type: 'garbage' });
    board.pile.createMany(12, Resource, 'uranium', { type: 'uranium' });

    for (const player of game.players) {
      const mat = board.create(PlayerMat, 'player-mat', { player });
      mat.createMany(22, Building, 'building', { player });
      mat.onEnter(Card, c => {
        c.auction = false
        c.discount = false
        if (c.name === 'nuclear-39' && map.name === 'germany') board.noMoreUranium = true
      });
    };

    // setup board
    deck.shuffle();
    deck.topN(8, Card, card => card.cost <= 15).putInto(powerplants);

    let removals = 0;
    if (game.players.length === 4) removals = 1;
    if (game.players.length === 3) removals = 2;
    if (game.players.length === 2) removals = 1;
    deck.topN(removals, Card, card => card.cost <= 15).remove();

    removals = 0;
    if (game.players.length === 4) removals = 3;
    if (game.players.length === 3) removals = 6;
    if (game.players.length === 2) removals = 5;
    deck.topN(removals, Card, card => card.cost > 15).remove();

    deck.top(Card, card => card.cost <= 15)!.putInto(deck);
    deck.top(Card, 'step-3')!.putInto(deck, {fromBottom: 0});

    // initial resources
    board.refillResources('coal', 24);
    board.refillResources('oil', 18);
    board.refillResources('garbage', 9);
    board.refillResources('uranium', 2);

    game.players.shuffle();
    game.players.next();
  },

  actions: (_, board) => {
    const map = board.first(Space)!;
    const deck = board.first(Space, 'deck')!;
    const powerplants = board.first(Space, 'powerplants')!;
    const resources = board.first(Space, 'resources')!;

    const costOf = (resource: ResourceType, amount: number) => {
      return resources.firstN(amount, resource).sum(resource => resource.container(ResourceSpace)!.cost)
    };

    return {
      build: player => new MoveAction({
        prompt: 'Build',
        promptTo: 'Which city?',
        piece: board.first(PlayerMat, {mine: true})!.first(Building),
        to: {
          chooseFrom: map.all(City, city => city.canBuildFor(player.elektro))
        },
        move: (city: City) => {
          player.elektro -= city.costToBuild();
          city.owners.push(player);
          player.score = map.all(Building, {mine: true}).length;
          board.checkStepTriggers();
          board.applyMinimumRule();
        },
      }),

      bid: player => new Action({
        prompt: 'Bid',
        condition: !player.passedThisAuction,
        selections: [{
          selectNumber: {
            default: board.lastBid ? board.lastBid + 1 : board.first(Card, {auction: true})!.purchaseCost(),
            min: board.lastBid ? board.lastBid + 1 : board.first(Card, {auction: true})!.purchaseCost(),
            max: player.elektro,
          }
        }],
        move: (bid: number) => {
          board.lastBid = bid;
          board.playerWithHighestBid = player;
        }
      }),

      passAuction: player => new Action({
        prompt: 'Pass',
        condition: board.turn > 1,
        move: () => player.havePassedAuctionPhase = true
      }),

      passBid: player => new Action({
        prompt: 'Pass',
        condition: board.lastBid !== undefined,
        move: () => player.passedThisAuction = true
      }),

      pass: () => new Action({
        prompt: 'Pass',
      }),

      arrangeResources: () => new MoveAction({
        prompt: 'Arrange resources',
        promptTo: 'to where',
        piece: {
          chooseFrom: board.first(PlayerMat, {mine: true})!.all(Resource)
        },
        to: {
          chooseFrom: (resource: Resource) => (
            resource.container(Card)!.others(Card, card => card.spaceFor(resource.type) > 0)
          )
        },
      }),

      power: player => new Action({
        prompt: 'Power this plant',
        condition: !!map.first(Building, {player}),
        selections: [{
          selectOnBoard: {
            chooseFrom: board.all(Card, {mine: true, powered: false}, c => !!c.resourcesAvailableToPower())
          }
        }, {
          selectOnBoard: {
            chooseFrom: (card: Card) => card.resourcesAvailableToPower()!,
            min: (card: Card) => card.resources!,
            max: (card: Card) => card.resources!,
          }
        }],
        move: (card: Card, resources: Resource[]) => {
          card.powered = true;
          for (const resource of resources) resource.remove();
        }
      }),

      buyResource: player => new Action({
        prompt: 'Buy resources',
        selections: [
          {
            prompt: 'Which type',
            selectFromChoices: {
              choices: resourceTypes.filter(type => (
                costOf(type, 1) <= player.elektro && !!board.first(Card, {mine: true}, card => card.spaceFor(type) > 0)
              ))
            },
          }, {
            prompt: 'Amount',
            selectNumber: {
              min: 1,
              max: (type: ResourceType) => {
                let max = 0;
                while (costOf(type, max) <= player.elektro) max++;

                const plants = board.all(Card, {mine: true}, c => c.resources !== 0);
                let totalSpace = plants.sum(card => card.spaceFor(type));
                return Math.min(max, totalSpace);
              },
            },
          }, {
            prompt: (type: ResourceType, amount: number) => `Buy ${amount} ${type} for ${costOf(type, amount)} Elektro?`,
            click: true,
          }
        ],
        move: (type: ResourceType, amount: number) => {
          player.elektro -= costOf(type, amount);
          const plants = board.all(Card, {mine: true}, c => c.resources !== 0);
          for (const resource of resources.firstN(amount, Resource, {type})) {
            resource.putInto(plants.first(Card, card => card.spaceFor(resource.type) > 0)!)
          }
        },
      }),

      auction: () => new Action({
        prompt: 'Put up for auction',
        selections: [{
          prompt: 'Choose a factory for auction',
          selectOnBoard: {
            chooseFrom: powerplants.firstN(board.step === 3 ? 8 : 4, Card)
          },
        }],
        condition: !board.first(Card, {auction: true}),
        move: (card: Card) => card.auction = true,
        message: '$player put $1 up for auction'
      })
    };
  },

  setupFlow: (game, board) => {
    const map = board.first(Space)!;
    const deck = board.first(Space, 'deck')!;
    const powerplants = board.first(Space, 'powerplants')!;

    return new Loop({name: 'round', while: () => true, do: new Sequence({
      name: 'phases', steps: [
        new Step({
          command: () => {
            game.players.sortBy('score', 'desc'); // and powerplants
            board.turn += 1;
            for (const player of game.players) player.havePassedAuctionPhase = false;
            powerplants.first(Card)!.discount = true;
          }
        }),
        new EachPlayer({
          name: 'auctionPlayer',
          startingPlayer: () => game.players[0],
          continueUntil: () => game.players.every(p => p.havePassedAuctionPhase),
          do: new IfElse({
            name: 'mayAuction',
            test: ({ auctionPlayer }) => !auctionPlayer.havePassedAuctionPhase,
            do: new PlayerAction({
              actions: {
                auction: new Sequence({ steps: [
                  new Step({ command: ({ auctionPlayer }) => {
                    for (const player of game.players) player.passedThisAuction = player.havePassedAuctionPhase;
                    board.playerWithHighestBid = auctionPlayer;
                  }}),

                  new EachPlayer({
                    name: 'biddingPlayer',
                    startingPlayer: ({ auctionPlayer }) => auctionPlayer,
                    continueUntil: () => board.lastBid !== undefined && game.players.filter(p => !p.passedThisAuction).length === 1,
                    do: new IfElse({
                      name: 'mayBid',
                      test: ({ biddingPlayer }) => !biddingPlayer.passedThisAuction,
                      do: new PlayerAction({ actions: { bid: null, passBid: null } })
                    }),
                  }),

                  new Step({ command: ({ auctionPlayer }) => {
                    const winner = board.playerWithHighestBid!;
                    game.message('$1 won the bid with $2', winner.name, board.lastBid!);
                    winner.elektro -= board.lastBid!;
                    board.lastBid = undefined;
                    powerplants.first(Card, {auction: true})!.putInto(board.first(PlayerMat, {player: winner})!);
                    deck.top(Card)?.putInto(powerplants);
                    winner.havePassedAuctionPhase = true;
                    if (winner !== auctionPlayer) repeat();
                  }})
                ]}),
                passAuction: null
              }
            })
          })
        }),
        new Step({
          command: () => {
            game.players.sortBy('score', 'asc');
            const discount = powerplants.first(Card, { discount: true });
            if (discount) {
              discount.remove();
              deck.top(Card)?.putInto(powerplants);
            }
          }
        }),
        new EachPlayer({
          name: 'purchasePlayer',
          do: new PlayerAction({
            name: 'purchaseResources',
            actions: {
              buyResource: new Step({ command: repeat }),
              pass: null
            }
          }),
        }),
        new EachPlayer({
          name: 'buildPlayer',
          do: new PlayerAction({
            name: 'build',
            actions: {
              build: new Step({ command: repeat }),
              pass: null
            }
          }),
        }),
        new EachPlayer({
          name: 'powerPlayer',
          do: new Sequence({ steps: [
            new PlayerAction({
              name: 'power',
              actions: {
                power: new Step({ command: repeat }),
                arrangeResources: new Step({ command: repeat }),
                pass: null
              }
            }),
            new Step({ name: 'income', command: ({ powerPlayer }) => {
              // unpower cities
              for (const building of map.all(Building, { mine: true, powered: true })) building.powered = false;

              // count power from plants and number of cities that can be powered
              const rev = income[
                Math.min(
                  board.all(Card, { mine: true, powered: true }).sum('power'),
                  map.all(Building, { mine: true }).length,
                  income.length - 1,
                )
              ];
              powerPlayer.elektro += rev;

              // unpower plants
              for (const card of board.all(Card, { mine: true, powered: true })) {
                card.powered = false;
              }
            }}),
          ]}),
        }),
        new Step({ name: 'refill', command: () => {
          for (const r of resourceTypes) {
            board.refillResources(r, refill[r][game.players.length - 1][board.step - 1]);
          }
          if (board.step === 3) {
            powerplants.first(Card)?.remove();
          } else {
            powerplants.last(Card)?.putInto(deck, {fromBottom: 0});
          }
          deck.top(Card)?.putInto(powerplants);
        }})
      ]
    })})
  }
});
