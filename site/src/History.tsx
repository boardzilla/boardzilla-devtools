import { useCallback, useRef, useEffect } from 'react';
import { HistoryItem } from './types';
import * as Game from './types/game'
import JsonView from '@uiw/react-json-view';
import './History.css'

type HistoryProps = {
  items: HistoryItem[]
  initialState: any
  revertTo: (n: number) => void
  view: (n: number) => void
  players: Game.Player[]
  collapsed: boolean
}

export default function History({items, initialState, revertTo, view, players, collapsed}: HistoryProps) {
  const historyEndRef = useRef<HTMLDivElement>(null)

  const player = useCallback((pos: number): Game.Player => {
    const p = players.find(p => p.position === pos)
    if (!p) {
      throw new Error("cannot find player")
    }
    return p
  }, [players])

  useEffect(() => {
    if (!collapsed) historyEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [items, collapsed]);

  return <div style={{overflowY: "scroll"}}>
    {initialState && !collapsed && <>
      Initial state
      <button onClick={() => view(-1)}>View</button>
      <button onClick={() => revertTo(-1)}>Revert</button>
      <JsonView value={initialState} collapsed={1} />
    </>}
    {initialState && collapsed &&
      <button key="-1" onClick={() => view(-1)} style={{background: '#999'}}>-</button>
    }
    {items.map(i => collapsed ? (
      <button key={i.seq} onClick={() => view(i.seq)} style={{background: player(i.position).color}}>{player(i.position).name.slice(0,1)}</button>
    ) : (
      <div style={{backgroundColor: i.seq % 2 === 0 ? "#ccc" : "#fff"}} key={i.seq}>
        <>
          {i.seq}
          <span style={{marginLeft: '3px', padding: '1px', border: `2px ${player(i.position).color} solid`}}>{player(i.position).name}</span>
          <button onClick={() => view(i.seq)}>View</button>
          <button onClick={() => revertTo(i.seq)}>Revert</button>
          <div><code>{i.move.data?.action}({i.move.data?.args && i.move.data?.args.join(', ')})</code></div>
          {Object.entries(i.messages || []).map(([key, m]) => (
            <div key={key} dangerouslySetInnerHTML={{ __html: m.body.replace(/\[\[[^|]*\|(.*?)\]\]/g, '<b>$1</b>') }}/>
          ))}
          {i.state?.board && <JsonView value={i.state?.board} collapsed={0} />}
        </>
      </div>
    ))}
    <div ref={historyEndRef} />
  </div>
}
