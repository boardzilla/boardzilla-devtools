import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';

const numbers = [1,2,3,4,5,6,7,8,9,10]

type Player = {
  position: number
  name: string
  color: string
}

type GameStateData = {
  type: "gameState"
  data: any
}

type MoveProcessedData = {
  type: "moveProcessed"
  id: string
  error: string | undefined
}

const Game = () => {
  const [state, setState] = useState<any>();
  const [error, setError] = useState<string>("");
  const listener = useCallback((event: MessageEvent<GameStateData | MoveProcessedData>) => {
    switch(event.data.type) {
      case 'gameState':
        setState(event.data.data);
        break;
      case 'moveProcessed':
        setError(event.data.error || "");
        break;
    }
  }, [])

  const makeMove = useCallback((n: number) => {
    window.top!.postMessage({type: "gameMove", id: crypto.randomUUID(), data: {number: n}}, "*")
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
