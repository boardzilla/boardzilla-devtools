import ReconnectingEventSource from "reconnecting-eventsource";
import React, { useCallback, useEffect, useState } from 'react';
import History from './History';
import { HistoryItem, InitialStateHistoryItem } from './types';
import { Modal } from 'react-responsive-modal';
import toast, { Toaster } from 'react-hot-toast';
import Switch from "react-switch";

import 'react-responsive-modal/styles.css';
import './App.css';

import * as UI from './types/ui'
import * as Game from './types/game'
import { sendInitialState, processMove, getPlayerState, resolveGamePromise, rejectGamePromise } from './game';

const body = document.getElementsByTagName("body")[0];
const maxPlayers = parseInt(body.getAttribute("maxPlayers")!);
const minPlayers = parseInt(body.getAttribute("minPlayers")!);
const possibleUsers = [
  {id: "0", name: "Evelyn"},
  {id: "1", name: "Anastasia"},
  {id: "2", name: "Jayden"},
  {id: "3", name: "Priyanka"},
  {id: "4", name: "Logan"},
  {id: "5", name: "Avery"},
  {id: "6", name: "Aischa"},
  {id: "7", name: "Liubika"},
  {id: "8", name: "Zvezdelina"},
  {id: "9", name: "Guadalupe"},
];

type BuildError = {
  type: "ui" | "game"
  out: string
  err: string
}

type SaveState = {
  name: string
  ctime: number
}

type SaveStateData = {
  settings: Game.GameSettings
  players: UI.UserPlayer[]
  history: HistoryItem[]
  initialState: InitialStateHistoryItem
}

function App() {
  const [initialState, setInitialState] = useState<InitialStateHistoryItem | undefined>();
  const [numberOfUsers, setNumberOfUsers] = useState(minPlayers);
  const [phase, setPhase] = useState<"new" | "started">("new");
  const [currentUserID, setCurrentUserID] = useState(possibleUsers[0].id);
  const [players, setPlayers] = useState<UI.UserPlayer[]>([]);
  const [buildError, setBuildError] = useState<BuildError | undefined>();
  const [settings, setSettings] = useState<Game.GameSettings>({});
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [saveStatesOpen, setSaveStatesOpen] = useState(false);
  const [saveStates, setSaveStates] = useState<SaveState[]>([])
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [autoSwitch, setAutoSwitch] = useState(true);
  const [reprocessing, setReprocessing] = useState(true);

  const currentPlayer = players.find(p => p.userID === currentUserID)!

  const loadSaveStates = useCallback(async () => {
    const response = await fetch('/states')
    const states = await response.json();
    setSaveStates((states as {entries: SaveState[]}).entries)
  }, []);

  const getCurrentState = useCallback((history?: HistoryItem[]): Game.GameState => (
    history?.length ? history[history.length - 1].state! : initialState?.state!
  ), [initialState]);

  const sendToUI = useCallback((data: UI.PlayersEvent | UI.GameUpdateEvent | UI.GameFinishedEvent | UI.SettingsUpdateEvent | UI.MessageProcessedEvent) => {
    if (reprocessing) return;
    (document.getElementById("ui") as HTMLIFrameElement)?.contentWindow!.postMessage(data)
  }, [reprocessing])

  useEffect(() => {
    loadSaveStates()
  }, [loadSaveStates])

  useEffect(() => {
    if (phase === 'new') {
      sendToUI({type: "settingsUpdate", settings});
    }
  }, [phase, sendToUI, settings])

  const saveCurrentState = useCallback((name: string): Promise<void> => {
    return fetch(`/states/${encodeURIComponent(name)}`, {
      headers: {
        'Content-type': 'application/json',
      },
      body: JSON.stringify({
        initialState, history, players, settings
      }),
      method: "POST"
    }).then(() => loadSaveStates())
  }, [initialState, history, loadSaveStates, players, settings]);

  const saveCurrentStateCallback = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault();
    const target = e.target as typeof e.target & {
      name: { value: string };
    };
    saveCurrentState(target.name.value)
  }, [saveCurrentState])

  const bootstrap = useCallback((): string => {
    return JSON.stringify({
      host: currentUserID === possibleUsers[0].id,
      userID: currentUserID,
      minPlayers,
      maxPlayers
    })
  }, [currentUserID]);

  const updateUI = useCallback(async (update: {game: Game.GameState, players?: Game.PlayerState[]}) => {
    const playerState = update.players?.find(p => p.position === currentPlayer.position)?.state || await getPlayerState(update.game, currentPlayer.position);
    switch(update.game.phase) {
      case 'finished':
        sendToUI({
          type: "gameFinished",
          state: {
            position: currentPlayer.position,
            state: playerState
          },
          winners: update.game.winners,
        });
        break
      case 'started':
        sendToUI({
          type: "gameUpdate",
          state: {
            position: currentPlayer.position,
            state: playerState
          },
          currentPlayers: update.game.currentPlayers,
        });
        break
    }
  }, [sendToUI, currentPlayer]);

  const resetGame = useCallback(() => {
    setPhase("new");
    setSettings({});
    setInitialState(undefined);
    setHistory([]);
    setPlayers([]);
    setCurrentUserID(possibleUsers[0].id);
    setReprocessing(true);
    (document.getElementById("ui") as HTMLIFrameElement)?.contentWindow?.location.reload();
    (document.getElementById("game") as HTMLIFrameElement)?.contentWindow?.location.reload();
  }, [])

  const reprocessHistory = useCallback(async (history: HistoryItem[], settings: Game.GameSettings, players: UI.UserPlayer[]): Promise<Game.GameState | undefined> => {
    let newInitialState: Game.GameUpdate | undefined;
    let previousUpdate: Game.GameUpdate | undefined;
    const newHistory: HistoryItem[] = []
    try {
      newInitialState = await sendInitialState({players, settings});
      previousUpdate = newInitialState;
      console.time('reprocessHistory');
      let i = 0;
      console.log('reprocessHistory items', history.length);
      while(i < history.length) {
        const { move, position } = history[i]
        try {
          previousUpdate = await processMove(previousUpdate.game, {position, data: move}, false);
          newHistory.push({position, move, seq: i, state: previousUpdate.game, messages: previousUpdate.messages})
        } catch(e) {
          console.error("error while reprocessing history", e)
          break
        }
        i++;
      }
      console.timeEnd('reprocessHistory');
    } catch(e) {
      console.error("reprocess", e)
      throw e
    } finally {
      setPlayers(players);
      setCurrentUserID(players[0].userID!)
      setInitialState(newInitialState ? {state: newInitialState.game, players, settings} : undefined)
      setHistory(newHistory);
      setPhase(newInitialState ? 'started' : 'new');
    }
    return previousUpdate ? previousUpdate.game : undefined
  }, []);

  const reprocessHistoryCallback = useCallback(async () => {
    setReprocessing(true)
    try {
      if (initialState && settings) {
        const newState = await reprocessHistory(history, settings, players)
        if (newState) await updateUI({ game: newState });
      }
    } catch(e) {
      console.log("error reprocessing history")
    } finally {
      setReprocessing(false)
    }
  }, [history, initialState, players, reprocessHistory, settings, updateUI]);

  useEffect(() => {
    const evtSource = new ReconnectingEventSource("/events");
    evtSource!.onmessage = (m => {
      const e = JSON.parse(m.data)
      switch (e.type) {
        case "reload":
          switch(e.target) {
            case "ui":
              console.debug("UI reloading due to changes");
              (document.getElementById("ui") as HTMLIFrameElement)?.contentWindow?.location.reload();
              setBuildError(undefined)
              toast.success("UI Reloaded!")
              break
            case "game":
              setReprocessing(true);
              console.debug("Game reloading due to changes");
              (document.getElementById("game") as HTMLIFrameElement)?.contentWindow?.location.reload();
              setBuildError(undefined)
              toast.success("Game Reloaded!")
              break
          }
          break
        case "buildError":
          switch(e.target) {
            case "ui":
              console.debug("UI build error");
              setBuildError({type:"ui", out: e.out, err: e.err})
              break
            case "game":
              console.debug("Game build error");
              setBuildError({type:"game", out: e.out, err: e.err})
              break
          }
          break
        case "ping":
          console.debug("ping received");
          break
      }
    })
    evtSource!.onerror = e => {
      toast.error(`Error from eventsource: ${(e as ErrorEvent).message}`)
      console.log("eventsource error", e)
    }

    return () => evtSource.close()
  }, [])

  const processKey = useCallback((code: string): boolean => {
    const keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']
    const validKeys = keys.slice(0, players.length)
    switch (code) {
      case 'KeyS':
        setSaveStatesOpen((s) => !s)
        return true
      case 'KeyR':
        setReprocessing(true);
        (document.getElementById("ui") as HTMLIFrameElement)?.contentWindow?.location.reload();
        (document.getElementById("game") as HTMLIFrameElement)?.contentWindow?.location.reload();
        return true
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
      case 'Digit5':
      case 'Digit6':
      case 'Digit7':
      case 'Digit8':
      case 'Digit9':
      case 'Digit0':
        const idx = validKeys.indexOf(code)
        setCurrentUserID(players[idx].userID!);
        return true
      default:
        return false
    }
  }, [players])

  useEffect(() => {
    const listener = async (e: MessageEvent<
      Game.InitialStateResultMessage |
      Game.ProcessMoveResultMessage |
      Game.GetPlayerStateMessage |
      UI.UpdateSettingsMessage |
      UI.UpdatePlayersMessage |
      UI.StartMessage |
      UI.UpdateSelfPlayerMessage |
      UI.ReadyMessage |
      UI.MoveMessage |
      UI.KeyMessage
    >) => {
      switch(e.data.type) {
        case 'initialStateResult':
          resolveGamePromise(e.data.id, e.data.state)
          break
        case 'processMoveResult':
          if (e.data.error) {
            rejectGamePromise(e.data.id, e.data.error)
          } else {
            resolveGamePromise(e.data.id, e.data.state)
          }
          break
        case 'getPlayerStateResult':
          resolveGamePromise(e.data.id, e.data.state)
          break
        case 'updateSettings':
          setSettings(e.data.settings);
          sendToUI({type: "messageProcessed", id: e.data.id, error: undefined})
          break
        case 'move':
          const previousState = history.length === 0 ? initialState!.state : history[history.length - 1].state!;
          try {
            const moveUpdate = await processMove(previousState, {position: currentPlayer.position, data: e.data.data});
            const newHistory = [...history, {
              position: currentPlayer.position,
              seq: history.length,
              state: moveUpdate.game,
              messages: moveUpdate.messages,
              move: e.data.data,
            }];
            setHistory(newHistory);
            sendToUI({type: "messageProcessed", id: e.data.id, error: undefined})
            if (moveUpdate.game.phase === 'started' && autoSwitch && moveUpdate.game.currentPlayers[0] !== currentPlayer.position) {
              setCurrentUserID(players.find(p => p.position === moveUpdate.game.currentPlayers[0])!.userID!);
              return
            }
            await updateUI(moveUpdate);
          } catch(err) {
            console.error('error during move', err);
            sendToUI({type: "messageProcessed", id: e.data.id, error: String(err)})
          }
          break
        case 'start':
          try {
            const initialUpdate = await sendInitialState({ players, settings });
            const newInitialState = {
              state: initialUpdate.game,
              players,
              settings,
            };
            setInitialState(newInitialState);
            setPhase("started");
            sendToUI({type: "messageProcessed", id: e.data.id, error: undefined});
            await updateUI(initialUpdate);
          } catch(err) {
            console.error('error during start', err);
            sendToUI({type: "messageProcessed", id: e.data.id, error: String(err)})
          }
          break
        case 'ready':
          if (!initialState) {
            sendToUI({type: "settingsUpdate", settings});
            sendToUI({type: "players", players, users: possibleUsers.slice(0, numberOfUsers)});
          } else {
            await updateUI({ game: getCurrentState(history) });
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
                newPlayers.push({
                  color: op.color,
                  name: op.name,
                  avatar: `https://i.pravatar.cc/200?u=${op.userID}`,
                  host: op.userID === possibleUsers[0].id,
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
            setPlayers(newPlayers)
          }
          sendToUI({type: "messageProcessed", id: e.data.id, error: undefined})
          break
        case 'updateSelfPlayer':
          break
        // special event for player switching
        case 'key':
          processKey(e.data.code)
          break
      }
    }

    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [currentPlayer, history, initialState, numberOfUsers, phase, players, sendToUI, updateUI, settings, getCurrentState, processKey, autoSwitch]);

  useEffect(() => {
    const l = (e: globalThis.KeyboardEvent):any => {

      if (!e.shiftKey) return
      if (processKey(e.code)) {
        e.stopPropagation();
      }
    }
    window.addEventListener('keyup', l);
    return () => window.removeEventListener('keyup', l);
  }, [players, processKey])

  useEffect(() => {
    sendToUI({type: "players", players, users: possibleUsers.slice(0, numberOfUsers)});
  }, [numberOfUsers, players, sendToUI])

  const loadState = useCallback(async (name: string) => {
    setReprocessing(true)
    const response = await fetch(`/states/${encodeURIComponent(name)}`);
    const state = await response.json() as SaveStateData;
    try {
      reprocessHistory(state.history, state.settings, state.players);
      await saveCurrentState(name)
    } catch(e) {
      toast.error(`Error reprocessing history: ${String(e)}`)
      console.log(e)
    }
    setSaveStatesOpen(false);
    (document.getElementById("game") as HTMLIFrameElement)?.contentWindow?.location.reload();
    setReprocessing(false)
  }, [reprocessHistory, saveCurrentState]);

  const deleteState = useCallback(async (name: string) => {
    await fetch(`/states/${encodeURIComponent(name)}`, {method: "DELETE"});
    await loadSaveStates();
  }, [loadSaveStates]);

  return (
    <>
    <Toaster/>
    <div style={{display:'flex', flexDirection:'row'}}>

      <Modal open={!!buildError} onClose={() => setBuildError(undefined)} center>
        <h2>BUILD ERROR!</h2>
        <h3>{buildError?.type}</h3>
        <h4>OUT</h4>
        <pre>{buildError?.out}</pre>
        <h4>ERR</h4>
        <pre>{buildError?.err}</pre>
      </Modal>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} center>
        <h2>Help</h2>
        <dl>
          <dt><kbd>Shift</kbd> + <kbd>1</kbd>, <kbd>Shift</kbd> + <kbd>2</kbd></dt>
          <dd>Switch between users</dd>
          <dt><kbd>Shift</kbd> + <kbd>R</kbd></dt>
          <dd>Manually reload UI/Game iframes</dd>
          <dt><kbd>Shift</kbd> + <kbd>S</kbd></dt>
          <dd>Toggle save state model open</dd>
        </dl>
      </Modal>

      <Modal open={saveStatesOpen} onClose={() => setSaveStatesOpen(false)} center>
        <div>
          <h2>Save states</h2>
          <div style={{overflowY: 'auto', height: "80vh", width: "50vw"}}>
            {saveStates.map(s => <div key={s.name}>{s.name}<br/>{new Date(s.ctime).toString()} <button onClick={() => loadState(s.name)}>Open</button><button onClick={() => deleteState(s.name)}>Delete</button></div>)}
          </div>
          <form onSubmit={(e) => saveCurrentStateCallback(e)}>
            Name <input type="text" name="name" onKeyUp={e=>{ e.stopPropagation() }}/><br/>
            <input type="submit" disabled={!initialState} value="Save new state" />
          </form>
        </div>
      </Modal>

      <div style={{display: 'flex', flexDirection:'column', flexGrow: 1}}>
        <div className="header" style={{display: 'flex', flexDirection:'row', alignItems: "center"}}>
          <span style={{marginRight: '0.5em'}}><Switch onChange={(v) => setAutoSwitch(v)} checked={autoSwitch} uncheckedIcon={false} checkedIcon={false} /></span> <span style={{marginRight: '3em'}}>Autoswitch players</span>
          {phase === "new" && <span><input style={{width: '3em', marginRight: '0.5em'}} type="number" value={numberOfUsers} min={minPlayers} max={maxPlayers} onChange={v => setNumberOfUsers(parseInt(v.currentTarget.value))}/> Number of players</span>}
          <span style={{flexGrow: 1}}>{players.map(p =>
            <button className="player" onClick={() => setCurrentUserID(p.userID!)} key={p.position} style={{backgroundColor: p.color, opacity: phase === 'started' && (currentPlayer.userID !== p.userID) ? 0.4 : 1, border: phase === 'started' && (currentPlayer.userID !== p.userID) ? '2px transparent solid' : '2px black solid'}}>{p.name}</button>
          )}</span>
          <button style={{marginLeft: '2em', fontSize: '20pt'}} className="button-link" onClick={() => setHelpOpen(true)}>ⓘ</button>
        </div>
        {reprocessing && <div style={{height: '100vh', width: '100vw'}}>REPROCESSING HISTORY</div>}
        {!reprocessing && (
          <iframe seamless={true} style={{border: 1, flexGrow: 4}} id="ui" title="ui" src={`/ui.html?bootstrap=${encodeURIComponent(bootstrap())}`}></iframe>
        )};
        <iframe onLoad={() => reprocessHistoryCallback()} style={{height: '0', width: '0'}} id="game" title="game" src="/game.html"></iframe>
      </div>
      <div id="history" className={historyCollapsed ? "collapsed" : ""}>
        <h2>
          <svg onClick={() => setHistoryCollapsed(!historyCollapsed)} className="arrow" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg">
            <path d="M721.833102 597.433606l-60.943176 60.943176-211.189226-211.189225L510.643877 386.244381z" fill="#444444" />
            <path d="M299.323503 597.30514l60.943176 60.943176 211.189226-211.189225L510.512728 386.115915z" fill="#444444" />
          </svg>
          {historyCollapsed || <span>History <button onClick={() => resetGame()}>Reset game</button></span>}
        </h2>
        <History
          players={players}
          view={n => updateUI({game : n === -1 ? initialState!.state : history[n].state })}
          revertTo={n => {setHistory(history.slice(0, n+1)); updateUI({ game: n === -1 ? initialState!.state : history[n].state })}}
          initialState={initialState}
          items={history}
          collapsed={historyCollapsed}
        />
      </div>
    </div>
    </>
  );
}

export default App;
