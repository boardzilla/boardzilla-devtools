import React from 'react';
import render, { toggleSetting, choiceSetting, textSetting, numberSetting } from 'boardzilla/ui';

import setup from '../../game/src/index';

import { Card, PlayerMat, Building, PowergridPlayer } from '../../game/src/index';

import './style.scss';

render(setup, {
  settings: {
    a: textSetting('a value'),
    d: choiceSetting('pick one', {a: 'type a', b: 'type b'}),
    b: numberSetting('a number', 1, 5),
    c: toggleSetting('a toggle'),
  },
  appearance: {
    PlayerMat: (el: PlayerMat, contents) => <>
      {el.player?.name}<br/>
      Buildings: {el.all(Building).length}<br/>
      Elektro: {(el.player as PowergridPlayer)?.elektro}
      <div>{contents}</div>
    </>,
    Card: (card: Card, contents) => <div>
      {card.cost && <>
        ({card.cost})<br/>
        {card.resources ? `${card.resources}x ${card.resourceType}` : 'wind'}-&gt;{card.power}
        {card.powered && "*"}
      </> || card.name}
      {card.auction && <div>auction</div>}
      <div>{contents}</div>
    </div>
  }
});
