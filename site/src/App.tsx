import ReconnectingEventSource from "reconnecting-eventsource";
import React, { useCallback, useEffect, useState } from 'react';
import History from './History';
import { HistoryItem } from './types';
import { Modal } from 'react-responsive-modal';

import 'react-responsive-modal/styles.css';
import './App.css';

import * as UI from './types/ui'
import * as Game from './types/game'

const body = document.getElementsByTagName("body")[0];
const maxPlayers = parseInt(body.getAttribute("maxPlayers")!);
const minPlayers = parseInt(body.getAttribute("minPlayers")!);
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
  resolve: (d: Game.GameUpdate) => void
  reject: (e: Error) => void
}
let pending: pendingPromise | undefined;

function App() {

  const initialHistory = JSON.parse(localStorage.getItem('history') || '[]');
  const initialPlayers = JSON.parse(localStorage.getItem('players') || '[]');
  let initialPhase: "new" | "started" = 'new'
  if (initialHistory[0]) initialPhase = 'started';

  const [numberOfUsers, setNumberOfUsers] = useState(initialPlayers.length || 1);
  const [phase, setPhase] = useState<"new" | "started">(initialPhase);
  const [currentPlayer, setCurrentPlayer] = useState(1);
  const [gameLoaded, setGameLoaded] = useState<boolean>(false);
  const [players, setPlayers] = useState<UI.UserPlayer[]>(initialPlayers);
  const [settings, setSettings] = useState<Game.GameSettings>();
  const [initialState, setInitialState] = useState<Game.GameUpdate | undefined>();
  const [history, setHistory] = useState<HistoryItem[]>(initialHistory);
  const [open, setOpen] = useState(false);

  const onOpenModal = () => setOpen(true);
  const onCloseModal = () => setOpen(false);

  const bootstrap = useCallback((): string => {
    return JSON.stringify({ userID: possiblePlayers.find(p => p.position === currentPlayer)!.id })
  }, [currentPlayer])

  const sendToGame = useCallback(async (data: Game.InitialStateEvent | Game.ProcessMoveEvent): Promise<Game.GameUpdate> => {
    return await new Promise((resolve, reject) => {
      pending = {resolve, reject};
      (document.getElementById("game") as HTMLIFrameElement).contentWindow!.postMessage(data)
    })
  }, [])

  const sendToUI = useCallback((data: UI.UserEvent | UI.PlayersEvent | UI.GameUpdateEvent | UI.SettingsUpdateEvent | UI.MessageProcessedEvent) => {
    (document.getElementById("ui") as HTMLIFrameElement).contentWindow!.postMessage(data)
  }, [])

  const resetGame = useCallback(() => {
    setPhase("new")
    setSettings(undefined)
    setInitialState(undefined)
    setHistory([])
    localStorage.removeItem('history');
  }, [])

  const reprocessHistory = useCallback(async () => {
    if (phase !== "started") return
    if (!gameLoaded) return
    try {
      let newInitialState = await sendToGame({type: "initialState", setup: {players, settings: settings!}})
      setInitialState(newInitialState)
      let previousState = newInitialState
      let i = 0;
      const newHistory: HistoryItem[] = []
      while(i < history.length) {
        let move = history[i].move
        let position = history[i].position
        try {
          const out = await sendToGame({type: "processMove", previousState: previousState.game, move: {...move, position}})
          newHistory.push({position, move, seq: i, data: out})
        } catch(e) {
          console.error("error while reprocessing history", e)
          break
        }
        i++;
      }
      setHistory(newHistory);
    } catch(e) {
      console.error("reprocess initial state", e)
    }
    setGameLoaded(true);
  }, [gameLoaded, history, phase, players, sendToGame, settings]);

  // useEffect(() => {
  //   console.log("sending update")
  //   if (phase === 'new') {
  //     return sendToUI({type: "setupUpdate", state: {players: players.map(p => {return {...p, settings: {}}}), settings: setupState}});
  //   }
  //   const currentState = history.length === 0 ? initialState : history[history.length - 1].data;
  //   sendToUI({type: "gameUpdate", state: currentState?.players.find(p => p.position === currentPlayer)?.state});
  // }, [initialState, history, currentPlayer, phase, sendToUI, setupState, players]);

  useEffect(() => {
    console.log("events!")
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
    console.log("listener!", Math.random())
    const listener = async (e: MessageEvent<
      Game.InitialStateResultMessage |
      Game.ProcessMoveResultMessage |
      UI.UpdateSettingsMessage |
      UI.UpdatePlayersMessage |
      UI.StartMessage |
      UI.UpdateSelfPlayerMessage |
      UI.ReadyMessage |
      UI.MoveMessage |
      UI.SwitchPlayerMessage
    >) => {
      console.log("got one!")
      const path = (e.source! as WindowProxy).location.pathname
      let currentState
      switch(e.data.type) {
        case 'initialStateResult':
          if (path !== '/game.html') return console.error("expected event from game.html!")
          if (e.data.error) {
            pending!.reject(new Error(e.data.error))
          } else {
            pending!.resolve(e.data.state)
          }
          pending = undefined
          break
        case 'processMoveResult':
          if (path !== '/game.html') return console.error("expected event from game.html!")
          if (e.data.error) {
            pending!.reject(new Error(e.data.error))
          } else {
            pending!.resolve(e.data.state)
          }
          break
        case 'updateSettings':
          if (path !== '/ui.html') return console.error("expected event from ui.html!")
          setSettings(e.data.settings);
          sendToUI({type: "messageProcessed", id: e.data.id, error: undefined})
          break
        case 'move':
          if (path !== '/ui.html') return console.error("expected event from ui.html!")
          const previousState = history.length === 0 ? initialState! : history[history.length - 1].data!;
          console.log("move!", e.data)
          try {
            const out = await sendToGame({type: "processMove", previousState: previousState.game, move: {position: currentPlayer, data: e.data.data}});
            const newHistory = [...history, {
              position: currentPlayer,
              seq: history.length,
              data: out,
              move: e.data
            }];
            setHistory(newHistory);
            localStorage.setItem('history', JSON.stringify(newHistory));
            if (out.game.currentPlayerPosition) setCurrentPlayer(out.game.currentPlayerPosition);
            sendToUI({type: "messageProcessed", id: e.data.id, error: undefined})
            sendToUI({type: "gameUpdate", state: out.players.find(p => p.position === currentPlayer)!})
          } catch(err) {
            sendToUI({type: "messageProcessed", id: e.data.id, error: String(err)})
          }
          break
        case 'start':
          if (path !== '/ui.html') return console.error("expected event from ui.html!")
          try {
            const out = await sendToGame({type: "initialState", setup: {
              players,
              settings: settings!,
            }})
            setInitialState(out);
            setPhase("started");
            sendToUI({type: "messageProcessed", id: e.data.id, error: undefined})
            sendToUI({type: "gameUpdate", state: out.players.find(p => p.position === currentPlayer)!})
          } catch(err) {
            sendToUI({type: "messageProcessed", id: e.data.id, error: String(err)})
          }
          // this is a bit of a lie, it doesn't actually know how it was processed by game
          break
        case 'ready':
          if (path !== '/ui.html') return console.error("expected event from ui.html!")
          currentState = history.length === 0 ? initialState! : history[history.length - 1].data!;
          if (phase === 'new') {
            if (settings) {
              sendToUI({type: "settingsUpdate", settings});
            }
            sendToUI({type: "players", players: players});
            for (let player of possiblePlayers.slice(0, numberOfUsers)) {
              sendToUI({type: "user", userName: player.name, userID: player.id, added: true});
            }
          } else {
            sendToUI({type: "gameUpdate", state: currentState.players.find(p => p.position === currentPlayer)!});
          }
          break
        case 'updatePlayers':
          console.log("UPDATING PLAYERRRRS!")
          let newPlayers = players.slice()
          let p: Game.Player | undefined
          for (let op of e.data.operations) {
            switch (op.type) {
              case 'reserve':
                break
              case 'seat':
                console.log("===>", {
                  color: op.color,
                  name: op.name,
                  position: op.position,
                  userID: op.userID,
                })
                newPlayers.push({
                  color: op.color,
                  name: op.name,
                  position: op.position,
                  userID: op.userID,
                })
                break
              case 'unseat':
                newPlayers = newPlayers.filter(p => p.position !== op.position)
                break
              case 'update':
                p = newPlayers.find(p => p.position === op.position)
                if (!p) continue
                if (op.color) {
                  p.color = op.color
                }
                if (op.name) {
                  p.name = op.name
                }
                if (op.settings) {
                  p.settings = op.settings
                }
                break
            }
            localStorage.setItem('players', JSON.stringify(newPlayers));
            setPlayers(newPlayers)
          }
          sendToUI({type: "messageProcessed", id: e.data.id, error: undefined})
          break
        case 'updateSelfPlayer':
          break
        // special event for player switching
        case 'switchPlayer':
          if (path !== '/ui.html') return console.error("expected event from ui.html!")
          if (e.data.index >= players.length) break
          setCurrentPlayer(e.data.index)
          break
      }
    }

    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [currentPlayer, history, initialState, numberOfUsers, phase, players, sendToGame, sendToUI, settings]);

  useEffect(() => {
    console.log("keys!")
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

  useEffect(() => {
    sendToUI({type: "players", players})
  }, [players, sendToUI])

  const updateNumberOfUsers = useCallback((n:string) => {
    const num = parseInt(n)
    if (Number.isNaN(num)) return
    setNumberOfUsers((previousNumber) => {
      const playerDifference = num - previousNumber
      if (playerDifference > 0) {
        for (let player of possiblePlayers.slice(previousNumber, num)) {
          sendToUI({type: "user", userID: player.id, userName: player.name, added: true});
        }
      } else if (playerDifference < 0) {
        for (let player of possiblePlayers.slice(num, previousNumber)) {
          sendToUI({type: "user", userID: player.id, userName: player.name, added: false});
        }
      }
      return num;
    });
  }, [sendToUI])

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
          <input style={{width: '3em'}} disabled={phase === 'started'} type="number" value={numberOfUsers} min={minPlayers} max={maxPlayers} onChange={v => updateNumberOfUsers(v.currentTarget.value)}/>
          <span style={{flexGrow: 1}}>{players.map(p =>
            <button onClick={() => setCurrentPlayer(p.position)} key={p.position} style={{backgroundColor: p.color, border: p.position === currentPlayer ? "5px black dotted" : ""}}>{p.name}</button>
          )}
          </span>
          <button  style={{fontSize: '20pt'}} className="button-link" onClick={onOpenModal}>ⓘ</button>
        </div>
        <iframe seamless={true} sandbox="allow-scripts allow-same-origin allow-forms allow-modals" style={{border: 1, flexGrow: 4}} id="ui" title="ui" src={`/ui.html?bootstrap=${encodeURIComponent(bootstrap())}`}></iframe>
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
