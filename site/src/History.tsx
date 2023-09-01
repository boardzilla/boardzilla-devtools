import { useCallback, useRef, useEffect } from 'react';
import { HistoryItem, Player } from './types';
import JsonView from '@uiw/react-json-view';

type HistoryProps = {
  items: HistoryItem[]
  initialState: any
  revertTo: (n: number) => void
  players: Player[]
}

export default function History({items, initialState, revertTo, players}: HistoryProps) {
  const historyEndRef = useRef<HTMLDivElement>(null)

  const player = useCallback((pos: number): Player => {
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
    <button onClick={() => revertTo(-1)}>Initial state</button> {<JsonView value={initialState} collapsed={1} />}
    {items.map(i => <div style={{backgroundColor: i.seq % 2 === 0 ? "#ccc" : "#fff"}} key={i.seq}>
      <button onClick={() => revertTo(i.seq)}>{i.seq}</button><span style={{marginLeft: '3px', padding: '1px', border: `2px ${player(i.position).color} solid`}}>{player(i.position).name}</span>
      <JsonView value={{move: i.move, game: i.data && i.data.game}} collapsed={1} />
      <JsonView value={{players: i.data && i.data.players}} collapsed={0} />
    </div>)}
    <div ref={historyEndRef} />
  </div>
  }
