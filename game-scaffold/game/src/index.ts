import setup, {
  Game,
  Action,
  MoveAction,
  Board,
  Space,
  Piece,
  Sequence,
  PlayerAction,
  Player,
  Step,
  EachPlayer,
  IfElse,
  repeat,
} from 'boardzilla/game';

import { cards } from './cards';

const resourceTypes = ['coal', 'oil', 'garbage', 'uranium'];
type ResourceType = (typeof resourceTypes)[number];

export class Card extends Piece {
  image: string;
  cost?: number;
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
    const closestCity = this.closest(City);
    console.log(closestCity);
    return [10, 15, 20][this.owners.length] + (closestCity ? this.distanceTo(closestCity)! : 0);
  }
  canBuild() {
    return this.owners.length < (this.board as PowergridBoard).step;
  }
  canBuildFor(elektro: number) {
    console.log(elektro, this.costToBuild(), this.canBuild());
    return this.canBuild() && elektro >= this.costToBuild();
  }
}

export class PlayerMat extends Space {
}

export class Building extends Piece {
  color: string;
  powered?: boolean;
}

class PowergridBoard extends Board {
  step: number = 1;
  turn: number = 1;
  lastBid?: number;
  playerWithHighestBid?: PowergridPlayer;
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

// convenience methods
const applyMinimumRule = (game: Game<PowergridPlayer, PowergridBoard>, powerplants: Space) => {
  for (const card of powerplants.all(Card)) {
    if (card.cost !== undefined && card.cost <= game.players.max('score')) {
      card.remove();
      game.board.first('deck')!.top(Card)?.putInto(powerplants);
    }
  }
};

const sortPowerplants = (game: Game<PowergridPlayer, PowergridBoard>, powerplants: Space) => {
  powerplants.sortBy('cost');
  applyMinimumRule(game, powerplants);
};


export default setup<PowergridPlayer, PowergridBoard>({
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
      resources.create(ResourceSpace, `coal-${cost}`, { cost, resource: 'coal' });
      resources.create(ResourceSpace, `coal-${cost}`, { cost, resource: 'coal' });
      resources.create(ResourceSpace, `coal-${cost}`, { cost, resource: 'coal' });
      resources.create(ResourceSpace, `uranium-${cost}`, { cost, resource: 'uranium' });
      resources.create(ResourceSpace, `oil-${cost}`, { cost, resource: 'oil' });
      resources.create(ResourceSpace, `oil-${cost}`, { cost, resource: 'oil' });
      resources.create(ResourceSpace, `oil-${cost}`, { cost, resource: 'oil' });
      resources.create(ResourceSpace, `garbage-${cost}`, { cost, resource: 'garbage' });
      resources.create(ResourceSpace, `garbage-${cost}`, { cost, resource: 'garbage' });
      resources.create(ResourceSpace, `garbage-${cost}`, { cost, resource: 'garbage' });
    };
    resources.create(ResourceSpace, 'uranium-10', { cost: 10, resource: 'uranium' });
    resources.create(ResourceSpace, 'uranium-12', { cost: 12, resource: 'uranium' });
    resources.create(ResourceSpace, 'uranium-14', { cost: 14, resource: 'uranium' });
    resources.create(ResourceSpace, 'uranium-16', { cost: 16, resource: 'uranium' });

    const powerplants = board.create(Space, 'powerplants');
    powerplants.onEnter(Card, c => c.showToAll());
    powerplants.onEnter(Card, () => sortPowerplants(game, powerplants))

    const deck = board.create(Space, 'deck');
    deck.onEnter(Card, c => c.hideFromAll());

    for (const [name, attrs] of Object.entries(cards)) deck.create(Card, name, attrs);
    board.pile.createMany(24, Resource, 'coal', { type: 'coal' });
    board.pile.createMany(24, Resource, 'oil', { type: 'oil' });
    board.pile.createMany(24, Resource, 'garbage', { type: 'garbage' });
    board.pile.createMany(24, Resource, 'uranium', { type: 'uranium' });

    for (const player of game.players) {
      const mat = board.create(PlayerMat, 'player-mat', { player });
      mat.createMany(22, Building, 'building', { color: player.color });
      mat.onEnter(Card, c => c.auction = false);
    };

    // setup board
    deck.shuffle();
    deck.firstN(8, Card, card => card.cost! <= 15).putInto(powerplants);

    let removals = 0;
    if (game.players.length === 4) removals = 1;
    if (game.players.length === 3) removals = 2;
    if (game.players.length === 2) removals = 1;
    deck.firstN(removals, Card, card => card.cost! <= 15).remove();

    removals = 0;
    if (game.players.length === 4) removals = 3;
    if (game.players.length === 3) removals = 6;
    if (game.players.length === 2) removals = 5;
    deck.firstN(removals, Card, card => card.cost! > 15).remove();

    deck.first(Card, card => card.cost! <= 15)!.putInto(deck);
    deck.first(Card, 'step-3')!.putInto(deck, {fromBottom: 0});

    // initial resources
    for (const space of board.all(ResourceSpace, {resource: 'coal'})) {
      board.pile.first(Resource, 'coal')!.putInto(space)
    };
    for (const space of board.all(ResourceSpace, s => s.resource === 'oil' && s.cost > 2)) {
      board.pile.first(Resource, 'oil')!.putInto(space)
    };
    for (const space of board.all(ResourceSpace, s => s.resource === 'garbage' && s.cost > 6)) {
      board.pile.first(Resource, 'garbage')!.putInto(space)
    };
    for (const space of board.all(ResourceSpace, s => s.resource === 'uranium' && s.cost >= 14)) {
      board.pile.first(Resource, 'uranium')!.putInto(space)
    };

    game.players.shuffle();
    game.players.next();
  },

  actions: (game, board) => {
    const map = board.first(Space, 'map')!;
    const deck = board.first(Space, 'deck')!;
    const powerplants = board.first(Space, 'powerplants')!;
    const resources = board.first(Space, 'resources')!;

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
        piece: board.first(PlayerMat, {mine: true})!.first(Building),
        to: {
          chooseFrom: map.all(City, city => city.canBuildFor(player.elektro))
        },
        move: (city: City) => {
          player.elektro -= city.costToBuild();
          city.owners.push(player);
          player.score = map.all(Building, {mine: true}).length;
          applyMinimumRule(game, powerplants);
        },
      }),

      bid: player => new Action({
        prompt: 'Bid',
        condition: !player.passedThisAuction,
        selections: [{
          selectNumber: {
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

      //   log: '$0 powered $1',
      //   key: 'p',
      //   action: (card: Card, oilChoice: number) => {
      //     const resources = card.resources!;
      //     const resourceType = card.resourceType;
      //     if (resourceType === 'hybrid') {
      //       let oil = Math.min(resources, card.count('oil'));
      //       let coal = Math.min(resources, card.count('coal'));
      //       const overage = oil + coal - resources;
      //       if (overage < 0) throw new InvalidChoiceError('Not enough oil/coal to power this plant');
      //       if (overage > 0 && oilChoice === undefined) {
      //         const choices: Record<string, string> = {};
      //         for (let o = oil; o + overage >= oil; o--) choices[o] = `${o} oil + ${resources - o} coal`;
      //         throw new IncompleteActionError({ prompt: 'Power with?', choices });
      //       }
      //       if (oilChoice !== undefined) {
      //         oil = oilChoice;
      //         coal = resources - oilChoice;
      //       }
      //       if (oil) card.clearIntoBoard.Pile('oil', oil);
      //       if (coal) card.clearIntoBoard.Pile('coal', coal);
      //     } else {
      //       if (card.count(`${resourceType}`) < resources) throw new InvalidChoiceError(`Not enough ${resourceType} to power this plant`);
      //       if (resourceType) card.clearIntoBoard.Pile(`${resourceType}`, resources);
      //     }
      //     times(card.power!, () => Building.find('map building.mine:not([powered])').powered = true);
      //     card.powered = true;
      //   },
      // },

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

      refill: player => new Action({
        prompt: 'Refill resources',
        selections: [{
          selectFromChoices: {
            choices: {'1': 'Step 1', '2': 'Step 2', '3': 'Step 3' },
          }
        }],
        move: (step: number) => {
          for (const resource in resourceTypes) {
            resources.all(ResourceSpace, {resource});
            refill[resource][game.players.length - 1][step - 1];
            //.forEach(r => r.addFromBoard.Pile(`${resource}`, 1)));
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

    return new Sequence({name: 'main', steps: [
      new Step({
        command: () => game.players.sortBy('score', 'desc')
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
    ]})
  }
});
