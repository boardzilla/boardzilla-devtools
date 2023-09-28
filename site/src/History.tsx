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
}

export default function History({items, initialState, revertTo, view, players}: HistoryProps) {
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
    {initialState && <>
      Initial state
      <button className="history" onClick={() => view(-1)}>View</button>
      <button className="history" onClick={() => revertTo(-1)}>Revert</button>
      <JsonView value={initialState} collapsed={1} />
    </>}
    {items.map(i => (
      <div style={{backgroundColor: i.seq % 2 === 0 ? "#ccc" : "#fff"}} key={i.seq}>
        {i.seq}
        <span style={{marginLeft: '3px', padding: '1px', border: `2px ${player(i.position).color} solid`}}>{player(i.position).name}</span>
        <button className="history" onClick={() => view(i.seq)}>View</button>
        <button className="history" onClick={() => revertTo(i.seq)}>Revert</button>
        <code>{i.move.data?.action}({i.move.data?.args.join(', ')})</code>
        {Object.entries(i.messages || []).map(([key, m]) => (
          <div key={key} dangerouslySetInnerHTML={{ __html: m.body.replace(/\[\[[^|]*\|(.*?)\]\]/g, '<b>$1</b>') }}/>
        ))}
        <JsonView value={i.state?.board} collapsed={0} />
      </div>
    ))}
    <div ref={historyEndRef} />
  </div>
}
