/**
 * TODO
 * resource resupply
 * after, in step 1+2, replace the highest plant and put it bottom of DECK
 * discount token
 * - add each auction
 * - redraw if new powerplant lower than discount and discard discount
 * - discard when purchased
 * - discard and replace plant if unpurchased
 * rest of map
 * - playing zones
 * germany nuclear plant, no uranium resupply if nuclear-39 purchased
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

const { Board, Space, Piece } = boardClasses<PowergridPlayer>();

import { cards } from './cards';

const resourceTypes = ['coal', 'oil', 'garbage', 'uranium'];
type ResourceType = (typeof resourceTypes)[number];

class PowergridBoard extends Board {
  step: number = 1;
  turn: number = 0;
  lastBid?: number;
  playerWithHighestBid?: PowergridPlayer;

  applyMinimumRule() {
    const powerplants = this.first('powerplants')!;
    for (const card of powerplants.all(Card)) {
      if (card.cost <= this.game.players.max('score')) {
        card.remove();
        this.first('deck')!.top(Card)?.putInto(powerplants);
      }
    }
  };

  sortPowerplants() {
    this.first('powerplants')!.sortBy('cost');
    this.applyMinimumRule();
  };

  refillResources(resource: ResourceType, amount: number) {
    for (const space of this.lastN(amount, ResourceSpace, {resource})) {
      this.pile.first(Resource, 'coal')!.putInto(space)
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
  powered?: boolean = false;

  spaceFor(resource: ResourceType) {
    if (this.resourceType === resource || (this.resourceType === 'hybrid' && ['oil', 'coal'].includes(resource))) {
      return this.resources! * 2 - this.all(Resource).length;
    }
    return 0;
  }

  resourcesAvailableToPower() {
    let availableResources;
    if (this.resourceType === 'hybrid') {
      availableResources = this.all(Resource);
    } else {      
      availableResources = this.firstN(this.resources!, Resource, { type: this.resourceType });
    }
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

export class PowergridPlayer extends Player {
  score: number = 0;
  elektro: number = 50;
  passedThisAuction: boolean = false;
  havePassedAuctionPhase: boolean = false;
};

const refill: Record<string, number[][]> = {
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
    const map = board.create(Space, 'map');
    const cuxhaven = map.create(City, 'Cuxhaven');
    const bremen = map.create(City, 'Bremen')
      .connectTo(cuxhaven, 8)
    const hannover = map.create(City, 'Hannover')
      .connectTo(bremen, 10)
    const hamburg = map.create(City, 'Hamburg')
      .connectTo(cuxhaven, 11)
      .connectTo(bremen, 11)
      .connectTo(hannover, 17);;
    const kiel = map.create(City, 'Kiel')
      .connectTo(hamburg, 8);;
    map.create(City, 'Flensburg')
      .connectTo(kiel, 4);;
    map.create(City, 'Wilhelmshaven')
      .connectTo(bremen, 11);;
    
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
    powerplants.onEnter(Card, c => c.showToAll());
    powerplants.onEnter(Card, () => board.sortPowerplants())

    const deck = board.create(Space, 'deck');
    deck.onEnter(Card, c => c.hideFromAll());

    for (const [name, attrs] of Object.entries(cards)) deck.create(Card, name, attrs);
    board.pile.createMany(24, Resource, 'coal', { type: 'coal' });
    board.pile.createMany(24, Resource, 'oil', { type: 'oil' });
    board.pile.createMany(24, Resource, 'garbage', { type: 'garbage' });
    board.pile.createMany(24, Resource, 'uranium', { type: 'uranium' });

    for (const player of game.players) {
      const mat = board.create(PlayerMat, 'player-mat', { player });
      mat.createMany(22, Building, 'building', { player });
      mat.onEnter(Card, c => c.auction = false);
    };

    // setup board
    deck.shuffle();
    deck.firstN(8, Card, card => card.cost <= 15).putInto(powerplants);

    let removals = 0;
    if (game.players.length === 4) removals = 1;
    if (game.players.length === 3) removals = 2;
    if (game.players.length === 2) removals = 1;
    deck.firstN(removals, Card, card => card.cost <= 15).remove();

    removals = 0;
    if (game.players.length === 4) removals = 3;
    if (game.players.length === 3) removals = 6;
    if (game.players.length === 2) removals = 5;
    deck.firstN(removals, Card, card => card.cost > 15).remove();

    deck.first(Card, card => card.cost <= 15)!.putInto(deck);
    deck.first(Card, 'step-3')!.putInto(deck, {fromBottom: 0});

    // initial resources
    board.refillResources('coal', 24);
    board.refillResources('oil', 18);
    board.refillResources('garbage', 9);
    board.refillResources('uranium', 2);

    game.players.shuffle();
    game.players.next();
  },

  actions: (game, board) => {
    const map = board.first('map')!;
    const deck = board.first('deck')!;
    const powerplants = board.first('powerplants')!;
    const resources = board.first('resources')!;

    const costOf = (resource: ResourceType, amount: number) => {
      return resources.firstN(amount, resource).sum(resource => resource.container(ResourceSpace)!.cost)
    };

    return {
      play: player => new MoveAction({
        prompt: 'Play factory',
        piece: {
          chooseFrom: deck.all(Card),
        },
        to: powerplants
      }),

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
          board.applyMinimumRule();
        },
      }),

      bid: player => new Action({
        prompt: 'Bid',
        condition: !player.passedThisAuction,
        selections: [{
          selectNumber: {
            default: board.lastBid ? board.lastBid + 1 : board.first(Card, {auction: true})!.cost,
            min: board.lastBid ? board.lastBid + 1 : board.first(Card, {auction: true})!.cost,
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

      power: () => new Action({
        prompt: 'Power this plant',
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

      remove: player => new Action({
        prompt: 'Remove',
        selections: [{
          selectOnBoard: {
            chooseFrom: powerplants.all(Card),
          }
        }],
        move: (card: Card) => card.remove(),
      }),

      bottom: player => new MoveAction({
        prompt: 'Bottom of deck',
        piece: {
          chooseFrom: powerplants.all(Card),
        },
        to: deck,
        move: (card: Card) => card.putInto(deck, {fromBottom: 0}),
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

                const factories = board.all(Card, {mine: true}, c => c.resources !== 0);
                let totalSpace = factories.sum(card => card.spaceFor(type));
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
          const factories = board.all(Card, {mine: true}, c => c.resources !== 0);
          for (const resource of resources.firstN(amount, Resource, {type})) {
            resource.putInto(factories.first(Card, card => card.spaceFor(resource.type) > 0)!)
          }
        },
      }),

      // adjustElektro: {
      //   prompt: 'Elektro +/-',
      //   key: 'e',
      //   select: '.mine Counter',
      //   log: (_elektro, amount: number) => `$0 ${amount >= 0 ? 'gained' : 'spent'} ${Math.abs(amount)} Elektro`,
      //   next: {
      //     prompt: 'Add or subtract how much Elektro?',
      //     min: -150,
      //     max: 150,
      //     action: (elektro: Counter, amount: number) => elektro.value += amount,
      //   },
      // },

      auction: player => new Action({
        prompt: 'Put up for auction',
        selections: [{
          prompt: 'Choose a factory for auction',
          selectOnBoard: {
            chooseFrom: powerplants.firstN(board.step === 3 ? 8 : 4, Card)
          },
        }],
        condition: !board.first(Card, {auction: true}),
        move: (card: Card) => card.auction = true,
      })
    };
  },

  setupFlow: (game, board) => {
    const deck = board.first(Space, 'deck')!;
    const powerplants = board.first(Space, 'powerplants')!;
    const map = board.first(Space, 'map')!;

    return new Loop({name: 'round', while: () => true, do: new Sequence({name: 'phases', steps: [
      new Step({
        command: () => {
          game.players.sortBy('score', 'desc'); // and powerplants
          board.turn += 1;
          for (const player of game.players) player.havePassedAuctionPhase = false;
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
                  console.log('bid won', winner.name, board.lastBid);
                  winner.elektro -= board.lastBid!;
                  board.lastBid = undefined;
                  powerplants.first(Card, {auction: true})!.putInto(board.first(PlayerMat, {player: winner})!);
                  deck.top(Card)!.putInto(powerplants);
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
        command: () => game.players.sortBy('score', 'asc')
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

            // count power from factories and number of cities that can be powered
            const rev = income[
              Math.min(
                board.all(Card, { mine: true, powered: true }).sum('power'),
                map.all(Building, { mine: true }).length,
                income.length - 1,
              )
            ];
            powerPlayer.elektro += rev;

            // unpower factories
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
      }})
    ]})})
  }
});
