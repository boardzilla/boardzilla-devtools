import ReconnectingEventSource from "reconnecting-eventsource";
import React, { useCallback, useEffect, useState } from 'react';
import History from './History';
import { HistoryItem, Player, GameUpdate } from './types';
import { Modal } from 'react-responsive-modal';

import 'react-responsive-modal/styles.css';
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

type pendingPromise = {
  resolve: (d: any) => void
  reject: (e: Error) => void
}
let initalStatePromise: pendingPromise | undefined;
const pendingPromises = new Map<string, pendingPromise>()

function App() {
  const [gameLoaded, setGameLoaded] = useState<boolean>(false);
  const [numberOfPlayers, setNumberOfPlayers] = useState<number>(minPlayers);
  const [players, setPlayers] = useState<Player[]>(possiblePlayers.slice(0, minPlayers));
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [initialState, setInitialState] = useState<GameUpdate | undefined>();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [open, setOpen] = useState(false);

  const onOpenModal = () => setOpen(true);
  const onCloseModal = () => setOpen(false);

  const sendToGame = useCallback((data: any) => {
    (document.getElementById("game") as HTMLIFrameElement).contentWindow!.postMessage(data)
  }, [])

  const sendToUI = useCallback((data: any) => {
    (document.getElementById("ui") as HTMLIFrameElement).contentWindow!.postMessage(data)
  }, [])

  const bootstrap = useCallback(() => {
    return JSON.stringify({
      players, currentPlayer
    })
  }, [currentPlayer, players])

  const updateNumberOfPlayers = useCallback((n:string) => {
    const num = parseInt(n)
    if (Number.isNaN(num)) return
    setNumberOfPlayers(num);
    const players = possiblePlayers.slice(0, num);
    setPlayers(players);
    setInitialState(undefined);
    setHistory([]);
  }, [])

  const resetGame = useCallback(() => {
    setInitialState(undefined)
    setHistory([])
  }, [])

  const reprocessHistory = useCallback(async () => {
    const newInitialState = await new Promise<GameUpdate>((resolve, reject) => {
      initalStatePromise = {resolve, reject}
      sendToGame({type: "initialState", players, setup: {}})
    })
    let i = 0;
    let previousState = newInitialState
    const newHistory: HistoryItem[] = []
    while(i < history.length) {
      let move = history[i].move
      let position = history[i].position
      try {
        let p = new Promise<GameUpdate>((resolve, reject) => {
          const id = crypto.randomUUID()
          pendingPromises.set(id, {resolve, reject});
          sendToGame({type: "processMove", previousState: previousState.game, move: {...move, position, id}})
        })
        const res = await p
        newHistory.push({position, move, seq: i, data: res})
      } catch(e) {
        console.error("error while reprocessing history", e)
        break
      }
      i++;
    }
    setInitialState(newInitialState);
    setHistory(newHistory);
    setGameLoaded(true);
  }, [history, players, sendToGame]);

  const sendCurrentPlayerState = useCallback(() => {
    const historyItem = history.slice().reverse().find(h => h.data)
    if (!initialState && !historyItem) return
    const playerStates = historyItem ? historyItem.data! : initialState!;
    const state = playerStates.players.find(p => p.position === currentPlayer);
    sendToUI({type: "gameState", data: state})
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
            if (initalStatePromise) {
              initalStatePromise.resolve(e.data.data)
              initalStatePromise = undefined;
              return;
            }
            setInitialState(e.data.data)
            break
          case 'moveProcessed':
            let p = pendingPromises.get(e.data.id)
            if (p) {
              if (e.data.error) {
                p.reject(new Error(e.data.error))
              } else {
                p.resolve(e.data.data)
              }
              pendingPromises.delete(e.data.id)
              return
            }
            if (e.data.error) {
              setHistory([...history.slice(0, history.length - 1)]);
            } else {
              let lastHistory = history[history.length - 1]
              setHistory([...history.slice(0, history.length - 1), {
                ...lastHistory,
                data: e.data.data
              }])
            }
            sendToUI({type: "moveProcessed", id: e.data.id, error: e.data.error})
            break
          }
        break
      case '/ui.html':
        switch(e.data.type) {
          case 'gameMove':
            setHistory([...history, {
              position: currentPlayer,
              seq: history.length,
              data: undefined,
              move: e.data
            }]);
            e.data.position = currentPlayer;
            const previousState = history.length === 0 ? initialState! : history[history.length - 1].data!;
            sendToGame({type: "processMove", previousState: previousState.game, move: e.data})
            break
          case 'switchPlayer':
            if (e.data.index >= players.length) break
            setCurrentPlayer(e.data.index)
            break
        }
        break
    }
  }, [history, initialState, currentPlayer, players, sendToGame, sendToUI])

  useEffect(() => {
    const evtSource = new ReconnectingEventSource("/events");
    evtSource!.onmessage = (m => {
      const e = JSON.parse(m.data)
      switch (e.type) {
        case "reload":
          switch(e.target) {
            case "ui":
              console.debug("UI reloading due to changes");
              (document.getElementById("ui") as HTMLIFrameElement).contentWindow?.location.reload();
              break
            case "game":
              console.debug("Game reloading due to changes");
              setGameLoaded(false);
              (document.getElementById("game") as HTMLIFrameElement).contentWindow?.location.reload();
              break
          }
          break
        case "ping":
          console.debug("ping received");
          break
      }
    })
    evtSource!.onerror = e => {
      console.log("eventsource error", e)
    }

    return () => evtSource.close()
  }, [])

  useEffect(() => {
    if (initialState || !gameLoaded) return
    sendToGame({type: "initialState", players, setup: {}})
  }, [initialState, gameLoaded, players, sendToGame]);

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
      <Modal open={open} onClose={onCloseModal} center>
        <h2>Help</h2>
        <p>
          To switch between players use shift-1, shift-2 etc
        </p>
      </Modal>
      <div style={{display: 'flex', flexDirection:'column', flexGrow: 1}}>
        <div style={{display: 'flex', flexDirection:'row', alignItems: "center"}}>
          <input style={{width: '3em'}} type="number" value={numberOfPlayers} min={minPlayers} max={maxPlayers} onChange={v => updateNumberOfPlayers(v.currentTarget.value)}/>
          <span style={{flexGrow: 1}}>{players.map(p =>
            <button onClick={() => setCurrentPlayer(p.position)} key={p.position} style={{backgroundColor: p.color, border: p.position === currentPlayer ? "5px black dotted" : ""}}>{p.name}</button>
          )}
          </span>
          <button  style={{fontSize: '20pt'}} className="button-link" onClick={onOpenModal}>ⓘ</button>
        </div>
        <iframe seamless={true} onLoad={() => sendCurrentPlayerState()} sandbox="allow-scripts allow-same-origin" style={{border: 1, flexGrow: 4}} id="ui" title="ui" src={`/ui.html?bootstrap=${encodeURIComponent(bootstrap())}`}></iframe>
        <iframe onLoad={() => reprocessHistory()} style={{height: '0', width: '0'}} id="game" title="game" src="/game.html"></iframe>
      </div>
      <div style={{width: '30vw', paddingLeft: '1em', height:'100vh', display: 'flex', flexDirection:'column'}}>
        <h2>History <button onClick={() => resetGame()}>Reset game</button></h2>
        <History players={players} revertTo={(n) => setHistory(history.slice(0, n+1))} initialState={initialState} items={history}/>
      </div>
    </div>
      );
}

export default App;
