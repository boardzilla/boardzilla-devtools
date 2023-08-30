import React, { useCallback, useEffect, useState } from 'react';
import History from './History';
import { HistoryItem, Player, GameUpdate } from './types';
import './App.css';

const possiblePlayers = [
  {position: 0, name: "Evelyn", color: "#ff0000"},
  {position: 1, name: "Logan", color: "#00ff00"},
  {position: 2, name: "Avery", color: "#0000ff"},
  {position: 3, name: "Jayden", color: "#666600"}
]

function App() {
  const [gameLoaded, setGameLoaded] = useState<boolean>(false);
  const [numberOfPlayers, setNumberOfPlayers] = useState<number>(2);
  const [players, setPlayers] = useState<Player[]>(possiblePlayers.slice(0, numberOfPlayers));
  const [currentPlayer, setCurrentPlayer] = useState(players[0].position);
  const [initialState, setInitialState] = useState<GameUpdate | undefined>();
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const updateNumberOfPlayers = useCallback((n:number) => {
    setNumberOfPlayers(n);
    setPlayers(possiblePlayers.slice(0, n))
    setInitialState(undefined);
    setHistory([]);
  }, [])

  const sendToGame = useCallback((data: any) => {
    (document.getElementById("game") as HTMLIFrameElement).contentWindow!.postMessage(data)
  }, [])

  const sendToUI = useCallback((data: any) => {
    (document.getElementById("ui") as HTMLIFrameElement).contentWindow!.postMessage(data)
  }, [])

  const sendCurrentPlayerState = useCallback(() => {
    const historyItem = history.slice().reverse().find(h => h.data)
    if (!initialState && !historyItem) return
    const playerStates = historyItem ? historyItem.data! : initialState!;
    const state = playerStates.players.find(p => p.position === currentPlayer);
    sendToUI({type: "setState", data: state})
  }, [history, initialState, currentPlayer, sendToUI]);

  useEffect(() => {
    sendCurrentPlayerState()
  }, [initialState, history, currentPlayer, sendCurrentPlayerState])

  const messageCb = useCallback((e: MessageEvent) => {
    const path = (e.source! as WindowProxy).location.pathname
    switch (path) {
      case '/game.html':
        switch(e.data.type) {
          case 'initialState':
            console.log("setting initial state!")
            setInitialState(e.data.data)
            break
          case 'processMove':
            let lastHistory = history[history.length - 1]
            setHistory([...history.slice(0, history.length - 1), {
              ...lastHistory,
              data: e.data.data
            }])
            break
          case 'processMoveError':
            setHistory([...history.slice(0, history.length - 1)]);
            sendToUI({type: "moveError", move: e.data.move, error: e.data.error})
            break
          }
          console.log(e)
        break
      case '/ui.html':
        setHistory([...history, {
          seq: history.length,
          data: undefined,
          move: e.data
        }]);
        const previousState = history.length === 0 ? initialState! : history[history.length - 1].data!;
        sendToGame({type: "processMove", position: currentPlayer, previousState: previousState.game, move: e.data})
        break
    }
  }, [history, initialState, currentPlayer, sendToGame, sendToUI])

  useEffect(() => {
    const evtSource = new EventSource("/events");
    evtSource!.onmessage = (m => {
      const e = JSON.parse(m.data)
      switch (e.type) {
        case "reload":
          switch(e.target) {
            case "ui":
              console.log("RELOADING UI");
              (document.getElementById("ui") as HTMLIFrameElement).contentWindow?.location.reload();
              break
            case "game":
              console.log("RELOADING GAME");
              setGameLoaded(false);
              (document.getElementById("game") as HTMLIFrameElement).contentWindow?.location.reload();
              break
          }
          break
      }

    })
    return () => evtSource.close()
  }, [])

  useEffect(() => {
    if (initialState || !gameLoaded) return
    (document.getElementById("game") as HTMLIFrameElement).contentWindow!.postMessage({type: "initialState", players, setup: {}})
  }, [initialState, gameLoaded, players]);

  useEffect(() => {
    window.addEventListener('message', messageCb);
    return () => window.removeEventListener('message', messageCb)
  }, [messageCb])

  return (
    <>
    <div style={{display:'flex', flexDirection:'row'}}>
      <div style={{display: 'flex', flexDirection:'column', flexGrow: 1}}>
        <div style={{display: 'flex', flexDirection:'row'}}>
          <input type="number" value={numberOfPlayers} min="1" max="4" onChange={v => updateNumberOfPlayers(parseInt(v.currentTarget.value))}/>
          {players.map(p => <button onClick={() => setCurrentPlayer(p.position)} key={p.position} style={{backgroundColor: p.color, border: p.position === currentPlayer ? "5px black dotted" : ""}}>{p.name}</button>)}
        </div>
        <iframe seamless={true} onLoad={() => sendCurrentPlayerState()} sandbox="allow-scripts allow-same-origin" style={{border: 0, flexGrow: 4}} id="ui" title="ui" src="/ui.html"></iframe>
      </div>
      <div style={{width: '30vw', display: 'flex', flexDirection:'column'}}>
        <h2>History</h2>
        <div style={{flexGrow: 1}}><History initialState={initialState} items={history}/></div>
      </div>

    </div>
    <iframe onLoad={() => setGameLoaded(true)} style={{height: '0', width: '0'}} id="game" title="game" src="/game.html"></iframe>
    </>
      );
}

export default App;
