import ReconnectingEventSource from "reconnecting-eventsource";
import React, { useCallback, useEffect, useState } from 'react';
import History from './History';
import { HistoryItem, Player, GameUpdate } from './types';
import { Modal } from 'react-responsive-modal';

import 'react-responsive-modal/styles.css';
import './App.css';

namespace Game {
  export type Player = {
    color: string
    name: string
    position: number
    settings?: any
  }

  export type Message = {
    position: number
    body: string
  }

  export type PlayerState = {
    position: number
    state: any
  }

  export type GameSettings = Record<string, any>
  type GameState = any

  type SetupState = {
    players: Player[]
    settings: GameSettings
  }

  type GameUpdate = {
    game: GameState
    players: PlayerState[]
    messages: Message[]
  }

  type Move = {
    position: number
    data: any
  }

  export type InitialStateEvent = {
    type: "initialState"
    setup: SetupState
  }

  export type ProcessMoveEvent = {
    type: "processMove"
    previousState: GameState
    move: Move
  }

  export type InitialStateResultMessage = {
    type: "initialStateResult"
    state: GameUpdate
  }

  export type ProcessMoveResultMessage = {
    type: "processMoveResult"
    id: string
    error: string | undefined
    state: GameUpdate
  }
}

namespace UI {
  export type UserEvent = {
    type: "user"
    userID: string
    userName: string
    added: boolean
  }

  export type PlayersEvent = {
    type: "players"
    players: Game.Player[]
  }

  // an update to the setup state
  export type SettingsUpdateEvent = {
    type: "settingsUpdate"
    settings: Game.GameSettings
  }

  export type GameUpdateEvent = {
    type: "gameUpdate"
    state: Game.PlayerState
  }

  // indicates the disposition of a message that was processed
  export type MessageProcessedEvent = {
    type: "messageProcessed"
    id: string
    error?: string
  }

  export type UserPlayer = Player & {
    userID?: string
  }

  // host only
  export type UpdateSettingsMessage = {
    type: "updateSettings"
    id: string
    settings: Game.GameSettings
  }

  // host only
  type SeatOperation = {
    type: 'seat'
    position: number,
    userID: string
    color: string
    name: string
    settings?: any
  }

  type UnseatOperation = {
    type: 'unseat'
    position: number,
  }

  type UpdateOperation = {
    type: 'update'
    position: number,
    color?: string
    name?: string
    settings?: any
  }

  type ReserveOperation = {
    type: 'reserve'
    position: number,
    color: string
    name: string
    settings?: any
  }

  type PlayerOperation = SeatOperation | UnseatOperation | UpdateOperation |ReserveOperation

  // host only
  export type UpdatePlayersMessage = {
    type: "updatePlayers"
    id: string
    operations: PlayerOperation[]
  }

  // host only
  export type StartMessage = {
    type: "start"
    id: string
  }

  export type UpdateSelfPlayerMessage = {
    type: "updateSelfPlayer"
    id: string
    name: string
    color: string
  }

  export type ReadyMessage = {
    type: "ready"
  }

  // used to send a move
  export type MoveMessage = {
    type: 'move'
    id: string
    data: any
  }

  export type SwitchPlayerMessage = {
    type: "switchPlayer"
    index: number
  }
}


const body = document.getElementsByTagName("body")[0];
const maxPlayers = parseInt(body.getAttribute("maxPlayers")!);
const minPlayers = parseInt(body.getAttribute("minPlayers")!);
const possiblePlayers = [
  {id: "0", position: 1, name: "Evelyn", color: "#ff0000"},
  {id: "1", position: 2, name: "Logan", color: "#00ff00"},
  {id: "2", position: 3, name: "Avery", color: "#0000ff"},
  {id: "3", position: 4, name: "Jayden", color: "#666600"},
  {id: "4", position: 5, name: "Aischa", color: "#006666"},
  {id: "5", position: 6, name: "Shyamapada", color: "#660066"},
  {id: "6", position: 7, name: "Iovica", color: "#333333"},
  {id: "7", position: 8, name: "Liubika", color: "#ff6633"},
  {id: "8", position: 9, name: "Zvezdelina", color: "#3366ff"},
  {id: "9", position: 10, name: "Guadalupe", color: "#f01a44"},
]

type pendingPromise = {
  resolve: (d: any) => void
  reject: (e: Error) => void
}
let initalStatePromise: pendingPromise | undefined;
const pendingPromises = new Map<string, pendingPromise>()

function App() {
  const [numberOfPlayers, setNumberOfPlayers] = useState(minPlayers);
  const [phase, setPhase] = useState<"new" | "started">("new");
  const [setupState, setSetupState] = useState<any>({});
  const [gameLoaded, setGameLoaded] = useState<boolean>(false);
  const [players, setPlayers] = useState<Game.Player[]>([]);
  const [settings, setSettings] = useState<Game.GameSettings>();
  const [currentPlayer, setCurrentPlayer] = useState(1);
  const [initialState, setInitialState] = useState<GameUpdate | undefined>();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [open, setOpen] = useState(false);

  const onOpenModal = () => setOpen(true);
  const onCloseModal = () => setOpen(false);

  const bootstrap = useCallback((): string => {
    return JSON.stringify({host: currentPlayer === 1, userID: possiblePlayers.find(p => p.position === currentPlayer)!.id})
  }, [currentPlayer])

  const sendToGame = useCallback((data: Game.InitialStateEvent | Game.ProcessMoveEvent) => {
    (document.getElementById("game") as HTMLIFrameElement).contentWindow!.postMessage(data)
  }, [])

  const sendToUI = useCallback((data: UI.UserEvent | UI.PlayersEvent | UI.GameUpdateEvent | UI.SettingsUpdateEvent | UI.MessageProcessedEvent) => {
    (document.getElementById("ui") as HTMLIFrameElement).contentWindow!.postMessage(JSON.stringify(data))
  }, [])

  const resetGame = useCallback(() => {
    setPhase("new")
    setInitialState(undefined)
    setHistory([])
  }, [])

  // const reprocessHistory = useCallback(async () => {
  //   console.log("pre")
  //   if (phase !== "started") return
  //   if (!gameLoaded) return
  //   const newInitialState = await new Promise<GameUpdate>((resolve, reject) => {
  //     initalStatePromise = {resolve, reject}
  //     sendToGame({type: "initialState", setup: {players, settings: settings!}})
  //   })
  //   let i = 0;
  //   let previousState = newInitialState
  //   const newHistory: HistoryItem[] = []
  //   while(i < history.length) {
  //     let move = history[i].move
  //     let position = history[i].position
  //     try {
  //       let p = new Promise<GameUpdate>((resolve, reject) => {
  //         const id = crypto.randomUUID()
  //         pendingPromises.set(id, {resolve, reject});
  //         sendToGame({type: "processMove", previousState: previousState.game, move: {...move, position, id}})
  //       })
  //       const res = await p
  //       newHistory.push({position, move, seq: i, data: res})
  //     } catch(e) {
  //       console.error("error while reprocessing history", e)
  //       break
  //     }
  //     i++;
  //   }
  //   setInitialState(newInitialState);
  //   setHistory(newHistory);
  //   setGameLoaded(true);
  // }, [gameLoaded, history, phase, players, sendToGame, settings]);

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
    const listener = (e: MessageEvent<
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
          if (initalStatePromise) {
            initalStatePromise.resolve(e.data.state)
            initalStatePromise = undefined;
            return;
          }
          setInitialState(e.data.state);
          setPhase("started");
          sendToUI({type: "gameUpdate", state: e.data.state.players.find(p => p.position === currentPlayer)!});
          break
        case 'processMoveResult':
          if (path !== '/game.html') return console.error("expected event from game.html!")
          let pending = pendingPromises.get(e.data.id)
          if (pending) {
            if (e.data.error) {
              pending.reject(new Error(e.data.error))
            } else {
              pending.resolve(e.data.state)
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
              data: e.data.state
            }])
          }
          sendToUI({type: "messageProcessed", id: e.data.id, error: e.data.error})
          if (e.data.state) {
            sendToUI({type: "gameUpdate", state: e.data.state.players.find(p => p.position === currentPlayer)!});
          }
          break
        case 'updateSettings':
          if (path !== '/ui.html') return console.error("expected event from ui.html!")
          setSetupState(e.data.settings);
          sendToUI({type: "messageProcessed", id: e.data.id, error: undefined})
          break
        case 'move':
          if (path !== '/ui.html') return console.error("expected event from ui.html!")
          setHistory([...history, {
            position: currentPlayer,
            seq: history.length,
            data: undefined,
            move: e.data
          }]);
          const previousState = history.length === 0 ? initialState! : history[history.length - 1].data!;
          sendToGame({type: "processMove", previousState: previousState.game, move: {position: currentPlayer, data: e.data.data}});
          break
        case 'start':
          if (path !== '/ui.html') return console.error("expected event from ui.html!")
          sendToGame({type: "initialState", setup: {
            players,
            settings: settings!,
          }})
          // this is a bit of a lie, it doesn't actually know how it was processed by game
          sendToUI({type: "messageProcessed", id: e.data.id, error: undefined});
          break
        case 'ready':
          if (path !== '/ui.html') return console.error("expected event from ui.html!")
          currentState = history.length === 0 ? initialState! : history[history.length - 1].data!;
          if (phase === 'new') {
            sendToUI({type: "settingsUpdate", settings: settings!});
            sendToUI({type: "players", players: players});
            for (let player of possiblePlayers.slice(0, numberOfPlayers)) {
              sendToUI({type: "user", userName: player.name, userID: player.id, added: true});
            }
          } else {
            sendToUI({type: "gameUpdate", state: currentState.players.find(p => p.position === currentPlayer)!});
          }
          break
        case 'updatePlayers':
          let newPlayers = players.slice()
          let p: Game.Player | undefined
          for (let op of e.data.operations) {
            switch (op.type) {
              case 'reserve':
                break
              case 'seat':
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
            setPlayers(newPlayers)
          }
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
  }, [currentPlayer, history, initialState, numberOfPlayers, phase, players, sendToGame, sendToUI, settings, setupState]);

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

  const updateNumberOfPlayers = useCallback((n:string) => {
    const num = parseInt(n)
    if (Number.isNaN(num)) return
    setNumberOfPlayers((previousNumber) => {
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
          <input style={{width: '3em'}} disabled={phase === 'started'} type="number" value={numberOfPlayers} min={minPlayers} max={maxPlayers} onChange={v => updateNumberOfPlayers(v.currentTarget.value)}/>
          <span style={{flexGrow: 1}}>{players.map(p =>
            <button onClick={() => setCurrentPlayer(p.position)} key={p.position} style={{backgroundColor: p.color, border: p.position === currentPlayer ? "5px black dotted" : ""}}>{p.name}</button>
          )}
          </span>
          <button  style={{fontSize: '20pt'}} className="button-link" onClick={onOpenModal}>ⓘ</button>
        </div>
        <iframe seamless={true} sandbox="allow-scripts allow-same-origin allow-forms allow-modals" style={{border: 1, flexGrow: 4}} id="ui" title="ui" src={`/ui.html?bootstrap=${encodeURIComponent(bootstrap())}`}></iframe>
        {/* onLoad={() => reprocessHistory()}  */}
        <iframe style={{height: '0', width: '0'}} id="game" title="game" src="/game.html"></iframe>
      </div>
      <div style={{width: '30vw', paddingLeft: '1em', height:'100vh', display: 'flex', flexDirection:'column'}}>
        <h2>History <button onClick={() => resetGame()}>Reset game</button></h2>
        <History players={players} revertTo={(n) => setHistory(history.slice(0, n+1))} initialState={initialState} items={history}/>
      </div>
    </div>
      );
}

export default App;
