import ReconnectingEventSource from "reconnecting-eventsource";
import React, { useCallback, useEffect, useState, useMemo } from 'react';
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
  {id: "1", name: "Jennifer"},
  {id: "2", name: "Kateryna"},
  {id: "3", name: "Logan"},
  {id: "4", name: "Liubika"},
  {id: "5", name: "Aischa"},
  {id: "6", name: "Leilani"},
  {id: "7", name: "Avery"},
  {id: "8", name: "Guadalupe"},
  {id: "9", name: "Zvezdelina"},
];

const avatarURL = (userID: string): string => `https://i.pravatar.cc/200?u=bup${userID}`

const playerDetailsForUser = (players: UI.UserPlayer[], userID: string): {color: string, position: number, settings?: any} | undefined => {
  const player = players.find(p => p.userID === userID)
  if (!player) return undefined
  return {
    color: player.color,
    position: player.position,
    settings: player.settings
  }
}

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

type MessageType = Game.InitialStateResultMessage |
  Game.ProcessMoveResultMessage |
  Game.GetPlayerStateMessage |
  UI.UpdateSettingsMessage |
  UI.UpdatePlayersMessage |
  UI.StartMessage |
  UI.UpdateSelfPlayerMessage |
  UI.ReadyMessage |
  UI.MoveMessage |
  UI.KeyMessage |
  UI.SendDarkMessage

function App() {
  const [initialState, setInitialState] = useState<InitialStateHistoryItem | undefined>();
  const [numberOfUsers, setNumberOfUsers] = useState(minPlayers);
  const [phase, setPhase] = useState<"new" | "started">("new");
  const [currentUserID, setCurrentUserID] = useState(possibleUsers[0].id);
  const [currentUserIDRequested, setCurrentUserIDRequested] = useState<string | undefined>(undefined);
  const [players, setPlayers] = useState<UI.UserPlayer[]>([]);
  const [buildError, setBuildError] = useState<BuildError | undefined>();
  const [settings, setSettings] = useState<Game.GameSettings>({});
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyPin, setHistoryPin] = useState<number | undefined>(undefined);
  const [helpOpen, setHelpOpen] = useState(false);
  const [saveStatesOpen, setSaveStatesOpen] = useState(false);
  const [saveStates, setSaveStates] = useState<SaveState[]>([])
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [autoSwitch, setAutoSwitch] = useState(true);
  const [reprocessing, setReprocessing] = useState(true);
  const [darkMode, setDarkMode] = useState(localStorage.getItem("dark") === "true");

  useEffect(() => {
    localStorage.setItem("dark", darkMode ? "true" : "false")
    if (darkMode) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }, [darkMode])

  const currentPlayer = useMemo(() => players.find(p => p.userID === currentUserID)!, [players, currentUserID]);

  const loadSaveStates = useCallback(async () => {
    const response = await fetch('/states')
    const states = await response.json();
    setSaveStates((states as {entries: SaveState[]}).entries)
  }, []);

  const getCurrentState = useCallback((history?: HistoryItem[]): Game.GameState => {
    const historyItem = historyPin ?? (history?.length ?? 0) - 1;
    return history && historyItem >= 0  ? history[historyItem].state! : initialState?.state!
  }, [initialState, historyPin]);

  const sendToUI = useCallback((data: UI.UsersEvent | UI.GameUpdateEvent | UI.GameFinishedEvent | UI.SettingsUpdateEvent | UI.MessageProcessedEvent | UI.DarkSettingEvent | UI.UserOnlineEvent) => {
    (document.getElementById("ui") as HTMLIFrameElement)?.contentWindow!.postMessage(JSON.parse(JSON.stringify(data)))
  }, [])

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
    if (reprocessing) return;
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
        let position = currentPlayer.position;
        if (autoSwitch && update.game.currentPlayers[0] !== currentPlayer.position && currentUserIDRequested === undefined) {
          position = update.game.currentPlayers[0];
          setCurrentUserID(players.find(p => p.position === position)!.userID!);
          return
        }
        sendToUI({
          type: "gameUpdate",
          state: {
            position,
            state: playerState
          },
          currentPlayers: update.game.currentPlayers,
        });
        break
    }
  }, [sendToUI, reprocessing, autoSwitch, players, currentPlayer, currentUserIDRequested]);

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
      setCurrentUserIDRequested(undefined)
      setInitialState(newInitialState ? {state: newInitialState.game, players, settings} : undefined)
      setHistory(newHistory);
      setHistoryPin(undefined);
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
              (document.getElementById("ui") as HTMLIFrameElement)?.contentWindow?.location.reload();
              setBuildError(undefined)
              toast.success("UI Reloaded!")
              break
            case "game":
              setReprocessing(true);
              (document.getElementById("game") as HTMLIFrameElement)?.contentWindow?.location.reload();
              setBuildError(undefined)
              toast.success("Game Reloaded!")
              break
          }
          break
        case "buildError":
          switch(e.target) {
            case "ui":
              setBuildError({type:"ui", out: e.out, err: e.err})
              break
            case "game":
              setBuildError({type:"game", out: e.out, err: e.err})
              break
          }
          break
        case "ping":
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
      case 'KeyF':
        setFullScreen(s => !s);
        return true;
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
    const listener = async (e: MessageEvent<MessageType>) => {
      const evt = JSON.parse(JSON.stringify(e.data)) as MessageType

      switch(evt.type) {
        case 'initialStateResult':
          resolveGamePromise(evt.id, evt.state)
          break
        case 'processMoveResult':
          if (evt.error) {
            rejectGamePromise(evt.id, evt.error)
          } else {
            resolveGamePromise(evt.id, evt.state)
          }
          break
        case 'getPlayerStateResult':
          resolveGamePromise(evt.id, evt.state)
          break
        case 'updateSettings':
          setSettings(evt.settings);
          sendToUI({type: "messageProcessed", id: evt.id, error: undefined})
          break
        case 'move':
          const previousState = history.length === 0 ? initialState!.state : history[history.length - 1].state!;
          try {
            const moveUpdate = await processMove(previousState, {position: currentPlayer.position, data: evt.data});
            const newHistory = [...history, {
              position: currentPlayer.position,
              seq: history.length,
              state: moveUpdate.game,
              messages: moveUpdate.messages,
              move: evt.data,
            }];
            setHistory(newHistory);
            setHistoryPin(undefined);
            sendToUI({type: "messageProcessed", id: evt.id, error: undefined})
            setCurrentUserIDRequested(undefined);
            if (moveUpdate.game.phase === 'started' && autoSwitch && moveUpdate.game.currentPlayers[0] !== currentPlayer.position) {
              setCurrentUserID(players.find(p => p.position === moveUpdate.game.currentPlayers[0])!.userID!);
              return
            }
            await updateUI(moveUpdate);
          } catch(err) {
            console.error('error during move', err);
            sendToUI({type: "messageProcessed", id: evt.id, error: String(err)})
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
            sendToUI({type: "messageProcessed", id: evt.id, error: undefined});
            await updateUI(initialUpdate);
          } catch(err) {
            console.error('error during start', err);
            sendToUI({type: "messageProcessed", id: evt.id, error: String(err)})
          }
          break
        case 'ready':
          if (!initialState) {
            sendToUI({type: "settingsUpdate", settings});
            sendToUI({type: "users", users: possibleUsers.slice(0, numberOfUsers).map(u => ({
              id: u.id,
              name: u.name,
              avatar: avatarURL(u.id),
              playerDetails: playerDetailsForUser(players, u.id),
            }))});
          } else {
            await updateUI({ game: getCurrentState(history) });
          }
          break
        case 'updatePlayers':
          let newPlayers = players.slice()
          let p: Game.Player | undefined
          for (let op of evt.operations) {
            switch (op.type) {
              case 'reserve':
                break
              case 'seat':
                newPlayers.push({
                  color: op.color,
                  name: op.name,
                  avatar: avatarURL(op.userID),
                  host: op.userID === possibleUsers[0].id,
                  position: op.position,
                  userID: op.userID,
                })
                break
              case 'unseat':
                const unseatOp = op
                newPlayers = newPlayers.filter(p => p.userID !== unseatOp.userID)
                break
              case 'update':
                const updateOp = op
                p = newPlayers.find(p => p.userID === updateOp.userID)
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
          sendToUI({type: "messageProcessed", id: evt.id, error: undefined})
          break
        case 'updateSelfPlayer':
          const {name, color} = evt
          setPlayers(players.map(p => {
            if (p.userID !== currentUserID) return p
            return {
              ...p,
              name,
              color,
            }
          }))
        break
        // special event for player switching
        case 'key':
          processKey(evt.code)
          break
        case 'sendDark':
          sendToUI({
            type: 'darkSetting',
            dark: document.documentElement.classList.contains('dark'),
          })
          break
      }
    }

    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [currentPlayer, history, initialState, numberOfUsers, phase, players, sendToUI, updateUI, settings, getCurrentState, processKey, autoSwitch, currentUserID]);

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
    players.forEach(p => {
      sendToUI({type: "userOnline", id: p.userID!, online: true})
    })
  }, [players])

  useEffect(() => {
    sendToUI({type: "users", users: possibleUsers.slice(0, numberOfUsers).map(u => ({
      id: u.id,
      name: u.name,
      avatar: avatarURL(u.id),
      playerDetails: playerDetailsForUser(players, u.id),
    }))});
}, [numberOfUsers, players, sendToUI])

  useEffect(() => {
    sendToUI({ type: 'darkSetting', dark: darkMode !== false })
  }, [darkMode, sendToUI])

  const loadState = useCallback(async (name: string) => {
    setReprocessing(true)
    const response = await fetch(`/states/${encodeURIComponent(name)}`);
    const state = await response.json() as SaveStateData;
    try {
      reprocessHistory(state.history, state.settings, state.players);
      await saveCurrentState(name)
    } catch(e) {
      toast.error(`Error reprocessing history: ${String(e)}`)
      console.error(e)
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
      <div className={fullScreen || navigator.userAgent.match(/Mobi/) ? 'fullscreen' : ''} style={{display:'flex', flexDirection:'row'}}>
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
          <dt><kbd>Shift</kbd> + <kbd>F</kbd></dt>
          <dd>Toggle full screen</dd>
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

      <div style={{display: 'flex', flexDirection: 'column', flexGrow: 1}}>
        <div className="header">
          <span style={{marginRight: '0.5em'}}><Switch onChange={(v) => setAutoSwitch(v)} checked={autoSwitch} uncheckedIcon={false} checkedIcon={false} /></span> <span style={{marginRight: '3em'}}>Autoswitch players</span>
          {phase === "new" && <span><input style={{width: '3em', marginRight: '0.5em'}} type="number" value={numberOfUsers} min={minPlayers} max={maxPlayers} onChange={v => setNumberOfUsers(parseInt(v.currentTarget.value))}/> Number of players</span>}
          <span style={{flexGrow: 1}}>{players.map(p =>
            <button className="player" onClick={() => {setCurrentUserIDRequested(p.userID!); setCurrentUserID(p.userID!)}} key={p.position} style={{backgroundColor: p.color, opacity: phase === 'started' && (currentPlayer.userID !== p.userID) ? 0.4 : 1, border: phase === 'started' && (currentPlayer.userID !== p.userID) ? '2px transparent solid' : '2px black solid'}}>{p.name}</button>
          )}</span>
          <span style={{marginRight: '0.5em'}}>🌞</span>
          <Switch onChange={(v) => setDarkMode(v)} checked={darkMode} uncheckedIcon={false} checkedIcon={false} />
          <span style={{marginLeft: '0.5em'}}>🌚</span>
          <button style={{marginLeft: '2em', fontSize: '20pt'}} className="button-link" onClick={() => setHelpOpen(true)}>ⓘ</button>
        </div>
        {reprocessing && <div style={{height: '100vh', width: '100vw'}}>REPROCESSING HISTORY</div>}
        {!reprocessing && (
          <iframe seamless={true} style={{border: 1, flexGrow: 4}} id="ui" title="ui" src={`/ui.html?bootstrap=${encodeURIComponent(bootstrap())}`}></iframe>
        )}
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
          view={n => { setHistoryPin(n === history.length ? undefined : n); updateUI({ game: n === -1 ? initialState!.state : history[n].state })}}
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
