import React from 'react';
import render, { toggleSetting, choiceSetting, textSetting, numberSetting } from 'boardzilla/ui';

import setup from '../../game/src/index';

import './style.scss';

render(setup, {
  settings: {
    a: textSetting('a value'),
    d: choiceSetting('pick one', {a: 'type a', b: 'type b'}),
    b: numberSetting('a number', 1, 5),
    c: toggleSetting('a toggle'),
  },
});
