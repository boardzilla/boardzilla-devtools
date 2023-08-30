import { HistoryItem } from './types';
import JsonView from '@uiw/react-json-view';

type HistoryProps = {
  items: HistoryItem[]
  initialState: any
  revertTo: (n: number) => void
}

export default function History({items, initialState, revertTo}: HistoryProps) {
  return <div style={{overflowY: "scroll"}}>
    <button onClick={() => revertTo(-1)}>Initial state</button> {<JsonView value={initialState} collapsed={1} />}
    {items.map(i => <div style={{backgroundColor: i.seq % 2 === 0 ? "#ccc" : "#fff"}} key={i.seq}><button onClick={() => revertTo(i.seq)}>{i.seq}</button> <JsonView value={{move: i.move, data: i.data}} collapsed={1} /></div>)}
  </div>
  }
