import React from 'react';
import render, { toggleSetting, choiceSetting, textSetting, numberSetting } from 'boardzilla/ui';

import setup from '../../game/src/index';

import { Card, PlayerMat, Building } from '../../game/src/index';

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
      Score: {(el.player)?.score}<br/>
      Buildings: {el.all(Building).length}<br/>
      Elektro: {(el.player)?.elektro}
      <div>{contents}</div>
    </>,
    Building: (building: Building) => <div>{building.player?.name}</div>,
    Card: (card: Card, contents) => <div>
      {card.cost && <>
      [{card.discount ? 1 : card.cost}{card.discount && <i> discount</i>}]<br/>
        {card.resources ? `${card.resources}x ${card.resourceType}` : 'wind'}-&gt;{card.power}
        {card.powered && "*"}
      </> || card.name}
      {card.auction && <div>auction</div>}
      <div>{contents}</div>
    </div>
  }
});
