import { HistoryItem } from './types';
import JsonView from '@uiw/react-json-view';

type HistoryProps = {
  items: HistoryItem[]
  initialState: any
}

export default function History({items, initialState}: HistoryProps) {
  return <div style={{overflowY: "scroll", height:'100vh'}}>
    Initial state {<JsonView value={initialState} collapsed={1} />}
    {items.map(i => <div style={{backgroundColor: i.seq % 2 === 0 ? "#ccc" : "#fff"}} key={i.seq}>{i.seq}: <JsonView value={{move: i.move, data: i.data}} collapsed={1} /></div>)}
  </div>
}
