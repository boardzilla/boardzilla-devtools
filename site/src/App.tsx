import ReconnectingEventSource from "reconnecting-eventsource";
import React, { useCallback, useEffect, useState } from 'react';
import History from './History';
import { HistoryItem, Player, GameUpdate } from './types';
import { Modal } from 'react-responsive-modal';

import 'react-responsive-modal/styles.css';
import './App.css';

type UISetupUpdated = {
  type: "setupUpdated"
  data: any
}

// used to send a move
type UIMoveMessage = {
  id: string
  type: 'move'
  data: any
  position: number | undefined
}

// used to actually start the game
type UIStartMessage = {
  id: string
  type: 'start'
  setup: any
  players: Player[]
}

// used to tell the top that you're ready to recv events
type UIReadyMessage = {
  type: 'ready'
}

type GameInitialStateMessage = {
  type: "initialState"
  data: GameUpdate
}

type GameMoveProcessedMessage = {
  type: "moveProcessed"
  id: string
  error: string | undefined
  data: GameUpdate | undefined
}

type UISwitchPlayerMessage = {
  type: "switchPlayer"
  index: number
}

const body = document.getElementsByTagName("body")[0];
const maxPlayers = parseInt(body.getAttribute("maxPlayers")!);
const possiblePlayers = [
  {id: "0", position: 0, name: "Evelyn", color: "#ff0000"},
  {id: "1", position: 1, name: "Logan", color: "#00ff00"},
  {id: "2", position: 2, name: "Avery", color: "#0000ff"},
  {id: "3", position: 3, name: "Jayden", color: "#666600"},
  {id: "4", position: 4, name: "Aischa", color: "#006666"},
  {id: "5", position: 5, name: "Shyamapada", color: "#660066"},
  {id: "6", position: 6, name: "Iovica", color: "#333333"},
  {id: "7", position: 7, name: "Liubika", color: "#ff6633"},
  {id: "8", position: 8, name: "Zvezdelina", color: "#3366ff"},
  {id: "9", position: 9, name: "Guadalupe", color: "#f01a44"},
]

type pendingPromise = {
  resolve: (d: any) => void
  reject: (e: Error) => void
}
let initalStatePromise: pendingPromise | undefined;
const pendingPromises = new Map<string, pendingPromise>()

function App() {
  const [phase, setPhase] = useState<"new" | "started">("new");
  const [setupState, setSetupState] = useState<any>({});
  const [gameLoaded, setGameLoaded] = useState<boolean>(false);
  const [players, setPlayers] = useState<Player[]>([]);
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

  const resetGame = useCallback(() => {
    setPhase("new")
    setInitialState(undefined)
    setHistory([])
  }, [])

  const reprocessHistory = useCallback(async () => {
    if (phase !== "started") return
    if (!gameLoaded) return
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
  }, [gameLoaded, history, phase, players, sendToGame]);

  useEffect(() => {
    if (phase === 'new') {
      return sendToUI({type: "update", phase, state: setupState});
    }
    const currentState = history.length === 0 ? initialState : history[history.length - 1].data;
    sendToUI({type: "update", phase, state: currentState?.players.find(p => p.position === currentPlayer)});
  }, [initialState, history, currentPlayer, phase, sendToUI, setupState]);

  const messageCb = useCallback((e: MessageEvent<UISetupUpdated | UIMoveMessage | UIStartMessage | UIReadyMessage | GameInitialStateMessage | GameMoveProcessedMessage | UISwitchPlayerMessage>) => {
    const path = (e.source! as WindowProxy).location.pathname
    let currentState
    switch (path) {
      case '/game.html':
        switch(e.data.type) {
          case 'initialState':
            if (initalStatePromise) {
              initalStatePromise.resolve(e.data.data)
              initalStatePromise = undefined;
              return;
            }
            setInitialState(e.data.data);
            setPhase("started");
            setCurrentPlayer(players[0].position);
            sendToUI({type: "update", phase: "started", state: e.data.data.players.find(p => p.position === currentPlayer)});
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
            console.log("E.data", e.data)
            sendToUI({type: "messageProcessed", id: e.data.id, error: e.data.error})
            if (e.data.data) {
              sendToUI({type: "update", phase: "started", state: e.data.data.players.find(p => p.position === currentPlayer)});
            }
            break
          }
        break
      case '/ui.html':
        switch(e.data.type) {
          case 'setupUpdated':
            setSetupState(e.data.data)
            break
          case 'move':
            setHistory([...history, {
              position: currentPlayer,
              seq: history.length,
              data: undefined,
              move: e.data
            }]);
            e.data.position = currentPlayer;
            const previousState = history.length === 0 ? initialState! : history[history.length - 1].data!;
            sendToGame({type: "processMove", previousState: previousState.game, move: e.data});
            break
          case 'start':
            console.log("starting!", e.data)
            sendToGame({type: "initialState", players: e.data.players, setup: e.data.setup})
            setPlayers(e.data.players);
            sendToUI({type: "messageProcessed", id: e.data.id});
            break
          case 'ready':
            currentState = history.length === 0 ? initialState! : history[history.length - 1].data!;
            sendToUI({type: "update", phase, state: phase === 'new' ? setupState : currentState.players.find(p => p.position === currentPlayer)});
            if (phase === 'new') {
              for (let player of possiblePlayers.slice(0, maxPlayers)) {
                console.log("adding!", maxPlayers)
                sendToUI({type: "player", player, added: true});
              }
            }
            break
          // special event for player switching
          case 'switchPlayer':
            if (e.data.index >= players.length) break
            setCurrentPlayer(e.data.index)
            break
        }
        break
    }
  }, [history, initialState, currentPlayer, players, sendToGame, sendToUI, phase, setupState])

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
          <span style={{flexGrow: 1}}>{players.map(p =>
            <button onClick={() => setCurrentPlayer(p.position)} key={p.position} style={{backgroundColor: p.color, border: p.position === currentPlayer ? "5px black dotted" : ""}}>{p.name}</button>
          )}
          </span>
          <button  style={{fontSize: '20pt'}} className="button-link" onClick={onOpenModal}>ⓘ</button>
        </div>
        <iframe seamless={true} sandbox="allow-scripts allow-same-origin" style={{border: 1, flexGrow: 4}} id="ui" title="ui" src="/ui.html"></iframe>
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
