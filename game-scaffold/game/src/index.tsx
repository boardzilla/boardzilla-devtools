/**
 * TODO
 * playing zones
 * victory
 * - upon hitting score
 * - income instead creates the victory condition: # of cities powered, remaining elektro
 * 2-player rules add Trust...
 */
import React from 'react';

import setup, {
  Player,
  playerActions,
  ifElse,
  whileLoop,
  eachPlayer,
  repeat,
  imports,
  times
} from 'boardzilla/game';

import ElektroSVG from './elektro-svg';
import LightningSVG from './lightning-svg';
import gavel from '../../ui/src/assets/gavel.svg';
import germany from '../../ui/src/assets/germany2.svg';
import CitySVG from './city-svg';
import BuildingSVG from './building-svg';
import coal from '../../ui/src/assets/coal.svg';
import oil from '../../ui/src/assets/oil.svg';
import garbage from '../../ui/src/assets/garbage.svg';
import uranium from '../../ui/src/assets/uranium.svg';
import BuildingOutline from './building-outline-svg';
import coalOutline from '../../ui/src/assets/coal-outline.svg';
import oilOutline from '../../ui/src/assets/oil-outline.svg';
import garbageOutline from '../../ui/src/assets/garbage-outline.svg';
import uraniumOutline from '../../ui/src/assets/uranium-outline.svg';
import hybridOutline from '../../ui/src/assets/hybrid-outline.svg';
import arrow from '../../ui/src/assets/arrow.svg';
import powerplant from '../../ui/src/assets/powerplant.svg';
import PowerLabelSVG from './power-label-svg';

import { cards } from './cards';

export class PowergridPlayer extends Player {
  score: number = 0;
  elektro: number = 50;
  cities: number = 0;
  passedThisAuction: boolean = false;
  havePassedAuctionPhase: boolean = false;
};

const {
  Board,
  Space,
  Piece,
  action
} = imports<PowergridPlayer>();

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
  cost: number;
  resourceType?: ResourceType | 'hybrid' | 'clean';
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
  player: PowergridPlayer
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
const victory = [18, 17, 17, 15, 14];

export default setup({
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
    deck.setOrder('stacking');
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
    deck.topN(removals, Card, card => !!card.resourceType && card.cost > 15).remove();

    deck.top(Card, card => card.cost <= 15)!.putInto(deck);
    deck.first(Card, 'step-3')?.putInto(deck, {fromBottom: 0});

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
    const powerplants = board.first(Space, 'powerplants')!;
    const resources = board.first(Space, 'resources')!;

    const costOf = (resource: ResourceType, amount: number) => {
      if (amount > resources.all(resource).length) return Infinity;
      return resources.firstN(amount, resource).sum(resource => resource.container(ResourceSpace)!.cost)
    };

    return {
      auction: () => action({
        prompt: 'Choose a factory for auction',
        condition: !board.first(Card, {auction: true}),
        message: '$player put $1 up for auction'
      }).chooseOnBoard({
        choices: powerplants.firstN(board.step === 3 ? 8 : 4, Card),
      }).do(
        card => card.auction = true
      ),

      bid: player => action({
        prompt: 'Bid',
        condition: !player.passedThisAuction
      }).chooseNumber({
        min: board.lastBid ? board.lastBid + 1 : board.first(Card, {auction: true})!.purchaseCost(),
        max: player.elektro,
      }).do(bid => {
        board.lastBid = bid;
        board.playerWithHighestBid = player;
      }),

      passAuction: player => action({
        prompt: 'Pass',
        condition: board.turn > 1
      }).do(
        () => player.havePassedAuctionPhase = true
      ),

      passBid: player => action({
        prompt: 'Pass',
        condition: board.lastBid !== undefined
      }).do(
        () => player.passedThisAuction = true
      ),

      scrap: player => action({
        prompt: 'You must scrap one of your powerplants',
      }).chooseOnBoard({
        choices: board.first(PlayerMat, { player })!.all(Card)
      }).do(
        card => {
          for (const resource of card.all(Resource)) {
            const other = resource.container(Card)!.first(Card, other => other !== card && other.spaceFor(resource.type) > 0);
            if (other) resource.putInto(other);
          }
          card.remove();
        }
      ),

      pass: () => action({ prompt: 'Pass' }),

      build: player => action({
        prompt: 'Select cities for building'
      }).move({
        piece: board.first(PlayerMat, {mine: true})!.first(Building),
        chooseInto: map.all(City, city => city.canBuildFor(player.elektro)),
      }).do(city => {
        player.elektro -= city.costToBuild();
        city.owners.push(player);
        player.score = map.all(Building, {mine: true}).length;
        board.checkStepTriggers();
        board.applyMinimumRule();
      }),

      arrangeResources: () => action({
        prompt: 'Arrange resources'
      }).move({
        promptInto: 'to where',
        choosePiece: board.first(PlayerMat, {mine: true})!.all(Resource),
        chooseInto: (resource: Resource) => (
          resource.container(Card)!.others(Card, card => card.spaceFor(resource.type) > 0)
        )
      }),

      power: player => action({
        prompt: 'Power your plants',
        condition: !!map.first(Building, {player})
      }).chooseOnBoard({
        prompt: 'Select plant to power',
        choices: board.all(Card, {mine: true, powered: false}, c => !!c.resourcesAvailableToPower()),
      }).chooseOnBoard({
        prompt: 'Select resources for power',
        skipIf: (card: Card) => card.resourcesAvailableToPower()!.areAllEqual('type'),
        choices: (card: Card) => card.resourcesAvailableToPower()!,
        number: (card: Card) => card.resources!,
      }).do(
        (card, resources) => {
          card.powered = true;
          if (!resources) resources = card.firstN(card.resources!, Resource);
          for (const resource of resources) resource.remove();
        }
      ),

      buyResource: player => action({
        prompt: 'Buy resources'
      }).chooseFrom({
        expand: true,
        choices: resourceTypes.filter(type => (
          costOf(type, 1) <= player.elektro && !!board.first(Card, {mine: true}, card => card.spaceFor(type) > 0)
        ))
      }).chooseNumber({
        prompt: resource => `Buy ${resource}`,
        skipIfOnlyOne: false,
        min: 1,
        max: type => {
          let max = 0;
          while (costOf(type, max) <= player.elektro) max++;

          const plants = board.all(Card, {mine: true}, c => c.resources !== 0);
          let totalSpace = plants.sum(card => card.spaceFor(type));
          return Math.min(max, totalSpace);
        },
      }).confirm(
        (type, amount) => `Buy ${amount} ${type} for ${costOf(type, amount)} Elektro?`
      ).do((type, amount) => {
        player.elektro -= costOf(type, amount);
        const plants = board.all(Card, {mine: true}, c => c.resources !== 0);
        for (const resource of resources.firstN(amount, Resource, {type})) {
          resource.putInto(plants.first(Card, card => card.spaceFor(resource.type) > 0)!)
        }
      })
    };
  },

  setupFlow: (game, board) => {
    const map = board.first(Space)!;
    const deck = board.first(Space, 'deck')!;
    const powerplants = board.first(Space, 'powerplants')!;
    return whileLoop({
      while: () => true,
      do: [
        () => {
          game.players.sortBy('score', 'desc'); // and powerplants
          board.turn += 1;
          for (const player of game.players) player.havePassedAuctionPhase = false;
          powerplants.first(Card)!.discount = true;
        },
        eachPlayer({
          name: 'auctionPlayer',
          startingPlayer: () => game.players[0],
          continueUntil: () => game.players.every(p => p.havePassedAuctionPhase),
          do: ifElse({
            name: 'mayAuction',
            if: ({ auctionPlayer }) => !auctionPlayer.havePassedAuctionPhase,
            do: playerActions({
              name: 'auction',
              actions: {
                auction: [
                  ({ auctionPlayer }) => {
                    for (const player of game.players) player.passedThisAuction = player.havePassedAuctionPhase;
                    board.playerWithHighestBid = auctionPlayer;
                  },

                  eachPlayer({
                    name: 'biddingPlayer',
                    startingPlayer: ({ auctionPlayer }) => auctionPlayer,
                    continueUntil: () => board.lastBid !== undefined && game.players.filter(p => !p.passedThisAuction).length === 1,
                    do: ifElse({
                      name: 'mayBid',
                      if: ({ biddingPlayer }) => !biddingPlayer.passedThisAuction,
                      do: playerActions({ name: 'bid', actions: { bid: null, passBid: null } })
                    }),
                  }),

                  ifElse({
                    if: () => board.first(PlayerMat, { player: board.playerWithHighestBid! })!.all(Card).length >= 3,
                    do: playerActions({
                      player: () => board.playerWithHighestBid!,
                      name: 'scrap',
                      actions: { scrap: null }
                    }),
                  }),

                  ({ auctionPlayer }) => {
                    const winner = board.playerWithHighestBid!;
                    game.message('$1 won the bid with $2', winner.name, board.lastBid!);
                    winner.elektro -= board.lastBid!;
                    board.lastBid = undefined;
                    powerplants.first(Card, {auction: true})!.putInto(board.first(PlayerMat, {player: winner})!);
                    deck.top(Card)?.putInto(powerplants);
                    winner.havePassedAuctionPhase = true;
                    if (winner !== auctionPlayer) repeat();
                  }
                ],
                passAuction: null
              }
            })
          })
        }),

        () => {
          game.players.sortBy('score', 'asc');
          const discount = powerplants.first(Card, { discount: true });
          if (discount) {
            discount.remove();
            deck.top(Card)?.putInto(powerplants);
          }
        },

        eachPlayer({
          name: 'purchasePlayer',
          do: playerActions({
            name: 'purchaseResources',
            actions: {
              buyResource: repeat,
              pass: null
            }
          }),
        }),

        eachPlayer({
          name: 'buildPlayer',
          do: playerActions({
            name: 'build',
            skipIfOnlyOne: true,
            actions: {
              build: repeat,
              pass: null
            }
          }),
        }),

        () => {
          if (game.players.max('score') >= victory[game.players.length - 2]) {
            game.message("Final power phase!");
          }
        },

        eachPlayer({
          name: 'powerPlayer',
          do: [
            playerActions({
              name: 'power',
              prompt: 'Arrange resources and power your plants',
              skipIfOnlyOne: true,
              actions: {
                power: repeat,
                arrangeResources: repeat,
                pass: null
              }
            }),
            ({ powerPlayer }) => {
              // unpower cities
              for (const building of map.all(Building, { mine: true, powered: true })) building.powered = false;

              // count power from plants and number of cities that can be powered
              powerPlayer.cities = Math.min(
                board.all(Card, { mine: true, powered: true }).sum('power'),
                map.all(Building, { mine: true }).length,
                income.length - 1,
              )

              if (game.players.max('score') < victory[game.players.length - 2]) {
                const rev = income[powerPlayer.cities];
                powerPlayer.elektro += rev;
                game.message(`${powerPlayer.name} earned ${rev} elektro for ${powerPlayer.cities} ${powerPlayer.cities === 1 ? 'city' : 'cities'}`);

                // unpower plants
                powerPlayer.cities = 0;
                for (const card of board.all(Card, { mine: true, powered: true })) {
                  card.powered = false;
                }
              }
            },
          ]
        }),
        () => {
          if (game.players.max('score') >= victory[game.players.length - 2]) {
            const winner = game.players.withHighest('cities', 'elektro');
            game.message("$1 wins with $2 cities!", winner, winner.cities);
            game.finish(winner);
          } else {
            for (const r of resourceTypes) {
              board.refillResources(r, refill[r][game.players.length - 1][board.step - 1]);
            }
            if (board.step === 3) {
              powerplants.first(Card)?.remove();
            } else {
              powerplants.last(Card)?.putInto(deck, {fromBottom: 0});
            }
            deck.top(Card)?.putInto(powerplants);
          }
        }
      ]
    });
  },

  setupLayout: (board, aspectRatio) => {
    const map = board.first(Space)!;
    const deck = board.first(Space, 'deck')!;
    const resources = board.first(Space, 'resources')!;
    const powerplants = board.first(Space, 'powerplants')!;

    const resourceSvgs = {
      coal: coalOutline,
      oil: oilOutline,
      garbage: garbageOutline,
      uranium: uraniumOutline,
      hybrid: hybridOutline,
      clean: null
    }

    board.appearance({ aspectRatio: 8 / 5 });

    board.layout(map, {
      area: { left: 3, top: -10, width: 45, height: 120 }
    });
    board.layout(board.all(PlayerMat, { mine: false }), {
      area: { left: 50, top: 0, width: 50, height: 20 },
    });
    board.layout(powerplants, {
      area: { left: 50, top: 20, width: 40, height: 20 },
    });
    board.layout(deck, {
      area: { left: 90, top: 20, width: 10, height: 20 },
    });
    board.layout(resources, {
      area: { left: 50, top: 40, width: 50, height: 40 },
    });
    board.layout(board.all(PlayerMat, { mine: true }), {
      area: { left: 50, top: 80, width: 50, height: 20 },
    });

    map.layout(City, {
      slots: [
        { top: 20, left: 28, width: 8, height: 8 },
        { top: 27, left: 31, width: 8, height: 8 },
        { top: 34, left: 43, width: 8, height: 8 },
        { top: 22, left: 41, width: 8, height: 8 },
        { top: 14.5, left: 40, width: 8, height: 8 },
        { top: 8, left: 35, width: 8, height: 8 },
        { top: 24, left: 18, width: 8, height: 8 },

        { top: 32, left: 24, width: 8, height: 8 },
        { top: 39.5, left: 22, width: 8, height: 8 },
        { top: 41, left: 11, width: 8, height: 8 },
        { top: 40, left: 4, width: 8, height: 8 },
        { top: 47, left: 6, width: 8, height: 8 },
        { top: 47, left: 24, width: 8, height: 8 },
        { top: 44.5, left: 36, width: 8, height: 8 },

        { top: 17, left: 51, width: 8, height: 8 },
        { top: 23, left: 58, width: 8, height: 8 },
        { top: 16, left: 63, width: 8, height: 8 },
        { top: 23, left: 80, width: 8, height: 8 },
        { top: 33, left: 76, width: 8, height: 8 },
        { top: 35.5, left: 60, width: 8, height: 8 },
        { top: 35, left: 87, width: 8, height: 8 },

        { top: 43, left: 63, width: 8, height: 8 },
        { top: 45, left: 70, width: 8, height: 8 },
        { top: 49, left: 85, width: 8, height: 8 },
        { top: 51.5, left: 57, width: 8, height: 8 },
        { top: 54, left: 44, width: 8, height: 8 },
        { top: 62, left: 45, width: 8, height: 8 },
        { top: 65, left: 57, width: 8, height: 8 },

        { top: 52.5, left: 13, width: 8, height: 8 },
        { top: 53.5, left: 2.5, width: 8, height: 8 },
        { top: 62, left: 6, width: 8, height: 8 },
        { top: 58, left: 22, width: 8, height: 8 },
        { top: 57, left: 28.4, width: 8, height: 8 },
        { top: 69, left: 14, width: 8, height: 8 },
        { top: 68, left: 27, width: 8, height: 8 },

        { top: 74, left: 31, width: 8, height: 8 },
        { top: 79, left: 20, width: 8, height: 8 },
        { top: 83, left: 31, width: 8, height: 8 },
        { top: 77, left: 47, width: 8, height: 8 },
        { top: 71, left: 63, width: 8, height: 8 },
        { top: 81, left: 60, width: 8, height: 8 },
        { top: 74, left: 78, width: 8, height: 8 },
      ]
    });
    board.all(City).layout(Building, {
      slots: [
        { top: 5, left: 30, width: 40, height: 40 },
        { top: 50, left: 5, width: 40, height: 40 },
        { top: 50, left: 55, width: 40, height: 40 },
      ]
    });

    powerplants.layout(Card, {
      direction: 'ltr',
      rows: 2,
      columns: 4,
      gap: 0.5,
      margin: { left: 18, right: 1, top: 1, bottom: 1 },
      alignment: 'left',
    });

    resources.layout(ResourceSpace, {
      gap: 0.5,
      margin: { left: 18, right: 1, top: 1, bottom: 1 },
      alignment: 'left',
      rows: 10,
      direction: 'ttb'
    });

    board.all(PlayerMat, {mine: false}).layout(Card, {
      area: { top: 10, left: 22, width: 85, height: 64 },
      gap: 0.5,
      columns: 4,
      direction: 'ltr'
    });

    board.all(PlayerMat, {mine: true}).layout(Card, {
      area: { top: 22, left: 22, width: 85, height: 64 },
      gap: 0.5,
      columns: 4,
      direction: 'ltr'
    });

    deck.layout(Card, {
      direction: 'ltr',
      offsetColumn: { x: 10, y: 10 },
      alignment: 'bottom',
      margin: 1,
      rows: 1,
      limit: 3
    });

    board.all(Card).layout(Resource, {
      area: { left: 10, top: 25, width: 80, height: 50 },
      gap: 0.5,
    });

    board.all(PlayerMat).appearance({
      render: mat => (
        <>
          <ElektroSVG amount={mat.player.elektro}/>
          <LightningSVG amount={mat.player.score}/>
          <div className="name" style={{background: mat.player.color}}>
            {mat.player.name}<br/>
          </div>
          {mat.mine || <div className="divider" style={{background: mat.player.color}}/>}
        </>
      )
    });

    map.appearance({
      render: () => <img id="germany" src={germany}/>,
      connections: {
        thickness: .2,
        color: 'black',
        style: 'double',
        fill: 'white',
        label: PowerLabelSVG,
        labelScale: 0.045,
      }
    });

    board.all(ResourceSpace).appearance({
      render: s => <div className={'cost' + (s.isEmpty() ? ' empty' : '')}>{s.cost}</div>
    });

    board.all(Resource).appearance({ aspectRatio: 1 });
    board.all(Resource, {type: 'coal'}).appearance({ render: () => <img src={coal}/> });
    board.all(Resource, {type: 'oil'}).appearance({ render: () => <img src={oil}/> });
    board.all(Resource, {type: 'garbage'}).appearance({ render: () => <img src={garbage}/> });
    board.all(Resource, {type: 'uranium'}).appearance({ render: () => <img src={uranium}/> });

    board.all(City).appearance({ aspectRatio: 1, zoomable: true, render: CitySVG });

    board.all(Building).appearance({ aspectRatio: 1, render: BuildingSVG });
    board.all(PlayerMat).all(Building).appearance({ render: false });

    deck.appearance({
      render: deck => <div className="count">{deck.all(Card).length}</div>
    })

    board.all(Card).appearance({
      aspectRatio: 1,
      zoomable: card => card.isVisible(),
      render: card => (
        <div className="outer">
          {card.isVisible() && (
            <>
              <img className="background" src={powerplant}/>
              <div className="inner">
                {card.name === 'step-3' && <div className="step-3">PHASE 3</div>}
                {card.cost && card.name !== 'step-3' && (
                  <>
                    <div className="cost">
                      {card.discount ? 
                        <span>
                          <span className="old-cost">{String(card.cost + 100).slice(-2)}</span>
                          <span className="new-cost"> 01</span>
                        </span>
                        :
                        String(card.cost + 100).slice(-2)
                      }
                    </div>
                    <div className={"production " + card.resourceType}>
                      {card.resourceType === 'hybrid' && <div className='hybrid2'/>}
                      {times(card.resources!, i => <img key={i} src={resourceSvgs[card.resourceType!]}/>)}
                      <img src={arrow}/>
                      <BuildingOutline number={card.resources!}/>
                    </div>
                  </>
                )}
                {card.auction && <img src={gavel}/>}
              </div>
            </>
          )}
        </div>
      )
    });

    board.layoutStep('auction', {
      element: powerplants,
      right: 60,
      top: 10,
      width: 35
    });

    board.layoutStep('bid', {
      element: powerplants,
      right: 60,
      top: 10,
      width: 35
    });

    board.layoutStep('purchaseResources', {
      element: resources,
      right: 66.6,
      top: 6,
      width: 30
    });

    board.layoutStep('build', {
      element: board,
      top: 2,
      left: 1.25,
    });

    board.layoutStep('power', {
      element: board.first(PlayerMat, { mine: true })!,
      bottom: 100,
      left: 2,
      width: 32,
    });

    board.layoutStep('scrap', {
      element: board.first(PlayerMat, { mine: true })!,
      bottom: 100,
      left: 2,
      width: 32,
    });

    board.layoutStep('out-of-turn', {
      element: board,
      top: 2,
      left: 1.25,
    });
  }
});
