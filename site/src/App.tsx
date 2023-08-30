import React, { useCallback, useEffect, useState } from 'react';
import History from './History';
import { HistoryItem, Player, GameUpdate } from './types';
import './App.css';

const body = document.getElementsByTagName("body")[0];
const minPlayers = parseInt(body.getAttribute("minPlayers")!);
const maxPlayers = parseInt(body.getAttribute("maxPlayers")!);
const possiblePlayers = [
  {position: 0, name: "Evelyn", color: "#ff0000"},
  {position: 1, name: "Logan", color: "#00ff00"},
  {position: 2, name: "Avery", color: "#0000ff"},
  {position: 3, name: "Jayden", color: "#666600"},
  {position: 4, name: "Aischa", color: "#006666"},
  {position: 5, name: "Shyamapada", color: "#660066"},
  {position: 6, name: "Iovica", color: "#333333"},
  {position: 7, name: "Liubika", color: "#ff6633"},
  {position: 8, name: "Zvezdelina", color: "#3366ff"},
  {position: 9, name: "Guadalupe", color: "#f01a44"},
]

function App() {
  const [gameLoaded, setGameLoaded] = useState<boolean>(false);
  const [numberOfPlayers, setNumberOfPlayers] = useState<number>(minPlayers);
  const [players, setPlayers] = useState<Player[]>(possiblePlayers.slice(0, numberOfPlayers));
  const [currentPlayer, setCurrentPlayer] = useState(players[0].position);
  const [initialState, setInitialState] = useState<GameUpdate | undefined>();
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const updateNumberOfPlayers = useCallback((n:string) => {
    const num = parseInt(n)
    if (Number.isNaN(num)) return
    setNumberOfPlayers(num);
    setPlayers(possiblePlayers.slice(0, num))
    setInitialState(undefined);
    setHistory([]);
  }, [])

  const resetGame = useCallback(() => {
    setInitialState(undefined)
    setHistory([])
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

  useEffect(() => {
    const keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']
    const validKeys = keys.slice(0, players.length)
    const l = (e: globalThis.KeyboardEvent):any => {
      const idx = validKeys.indexOf(e.code)
      if (!e.shiftKey || idx === -1) return
      setCurrentPlayer(players[idx].position);
      e.stopPropagation();
    }
    window.addEventListener('keydown', l);
    return () => window.removeEventListener('keydown', l);
  }, [players])

  return (
    <div style={{display:'flex', flexDirection:'row'}}>
      <div style={{display: 'flex', flexDirection:'column', flexGrow: 1}}>
        <div style={{display: 'flex', flexDirection:'row'}}>
          <input type="number" value={numberOfPlayers} min={minPlayers} max={maxPlayers} onChange={v => updateNumberOfPlayers(v.currentTarget.value)}/>
          {players.map(p =>
            <button onClick={() => setCurrentPlayer(p.position)} key={p.position} style={{backgroundColor: p.color, border: p.position === currentPlayer ? "5px black dotted" : ""}}>{p.name}</button>
          )}
        </div>
        <iframe seamless={true} onLoad={() => sendCurrentPlayerState()} sandbox="allow-scripts allow-same-origin" style={{border: 1, flexGrow: 4}} id="ui" title="ui" src="/ui.html"></iframe>
        <iframe onLoad={() => setGameLoaded(true)} style={{height: '0', width: '0'}} id="game" title="game" src="/game.html"></iframe>
      </div>
      <div style={{width: '30vw', height:'100vh', display: 'flex', flexDirection:'column'}}>
        <h2>History <button onClick={() => resetGame()}>Reset game</button></h2>
        <History revertTo={(n) => setHistory(history.slice(0, n+1))} initialState={initialState} items={history}/>
      </div>
    </div>
      );
}

export default App;
