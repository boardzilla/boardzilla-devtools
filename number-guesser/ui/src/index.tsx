import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';

const numbers = [1,2,3,4,5,6,7,8,9,10]

type SetStateData = {
  type: "setState",
  data: any
}

type MoveProcessedData = {
  type: "moveProcessed"
  error: string | undefined
  id: string
}

const Game = () => {
  const [state, setState] = useState<any>();
  const [error, setError] = useState<string>("");
  const listener = useCallback((event: MessageEvent<SetStateData | MoveProcessedData>) => {
    switch(event.data.type) {
      case 'setState':
        setState((event.data as SetStateData).data);
        break;
      case 'moveProcessed':
        let e = event.data as MoveProcessedData
        setError(e.error ? e.error : "");
        break;
    }
  }, [])

  const makeMove = useCallback((n: number) => {
    window.top!.postMessage({id: crypto.randomUUID(), data: {number: n}}, "*")
  }, [])

  useEffect(() => {
    window.addEventListener('message', listener, false)
    return () => window.removeEventListener('message', listener)
  })

  useEffect(() => {
    if (error === "") return
    setTimeout(() => setError(""), 5000)
  }, [error])

  return <div>
    {error !== "" && <div style={{backgroundColor: "#faa", margin: '4px'}}>{error}</div>}
    {state && (state.winner !== undefined ? <span>Game is done! {state.winner === state.position ? "YOU WIN": "YOU LOSE"}</span> : numbers.map(n => <button onClick={() => makeMove(n)} key={n}>{n}</button>))}
    <pre>{JSON.stringify(state, null, 2)}</pre>
  </div>
}

const rootElement = document.getElementById('root')!
const root = ReactDOM.createRoot(rootElement);
root.render(<Game />);
