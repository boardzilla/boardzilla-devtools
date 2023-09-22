import { useCallback, useRef, useEffect } from 'react';
import { HistoryItem } from './types';
import * as Game from './types/game'

import JsonView from '@uiw/react-json-view';
import './History.css'
type HistoryProps = {
  items: HistoryItem[]
  initialState: any
  revertTo: (n: number) => void
  players: Game.Player[]
}

export default function History({items, initialState, revertTo, players}: HistoryProps) {
  console.log("players", players)
  const historyEndRef = useRef<HTMLDivElement>(null)

  const player = useCallback((pos: number): Game.Player => {
    const p = players.find(p => p.position === pos)
    if (!p) {
      throw new Error("cannot find player")
    }
    return p
  }, [players])

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [items]);

  return <div style={{overflowY: "scroll"}}>
    Initial state<button className="history" onClick={() => revertTo(-1)}>Revert</button> {initialState && <JsonView value={initialState} collapsed={1} />}
    {items.map(i => <div style={{backgroundColor: i.seq % 2 === 0 ? "#ccc" : "#fff"}} key={i.seq}>
      {i.seq}<span style={{marginLeft: '3px', padding: '1px', border: `2px ${player(i.position).color} solid`}}>{player(i.position).name}</span><button className="history" onClick={() => revertTo(i.seq)}>Revert</button>
      <JsonView value={{move: i.move, game: i.data && i.data.game}} collapsed={1} />
      <JsonView value={{players: i.data && i.data.players}} collapsed={0} />
    </div>)}
    <div ref={historyEndRef} />
  </div>
}
