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
import { sendInitialState, processMove, resolveGamePromise, rejectGamePromise } from './game';

const body = document.getElementsByTagName("body")[0];
const maxPlayers = parseInt(body.getAttribute("maxPlayers")!);
const minPlayers = parseInt(body.getAttribute("minPlayers")!);
const defaultPlayers = parseInt(body.getAttribute("defaultPlayers")!);
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
const colors = [
  '#d50000', '#00695c', '#304ffe', '#ff6f00', '#7c4dff',
  '#ffa825', '#f2d330', '#43a047', '#004d40', '#795a4f',
  '#00838f', '#408074', '#448aff', '#1a237e', '#ff4081',
  '#bf360c', '#4a148c', '#aa00ff', '#455a64', '#600020'];

const isReserved = (userID: string): boolean => !!userID.match(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i)

const avatarURL = (userID: string): string => `/_profile/${userID}.jpg`

const playerDetailsForUser = (isHost: boolean, players: UI.UserPlayer[], userID: string, ready: boolean): {color: string, position: number, settings?: any, ready: boolean, sessionURL?: string, reserved: boolean} | undefined => {
  const player = players.find(p => p.id === userID)
  if (!player) return undefined
  return {
    // hack based on use of uuid for reserved players
    reserved: isReserved(userID),
    color: player.color,
    position: player.position,
    settings: player.settings,
    ready,
    sessionURL: isHost ? "https://someone/somewhere" : undefined,
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
  const [playerReadiness, setPlayerReadiness] = useState<Map<string, boolean>>(new Map());
  const [buildError, setBuildError] = useState<BuildError | undefined>();
  const [settings, setSettings] = useState<Game.GameSettings>({});
  const [seatCount, setSeatCount] = useState(defaultPlayers);
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

  const host = currentUserID === possibleUsers[0].id

  useEffect(() => {
    localStorage.setItem("dark", darkMode ? "true" : "false")
    if (darkMode) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }, [darkMode])

  const currentPlayer = useMemo(() => players.find(p => p.id === currentUserID)!, [players, currentUserID]);

  const loadSaveStates = useCallback(async () => {
    const response = await fetch('/states')
    const states = await response.json();
    setSaveStates((states as {entries: SaveState[]}).entries)
  }, []);

  const getCurrentState = useCallback((history?: HistoryItem[]): Game.GameUpdate => {
    const historyItem = historyPin ?? (history?.length ?? 0) - 1;
    return history && historyItem >= 0 ? history[historyItem].state : initialState!.state
  }, [initialState, historyPin]);

  const sendToUI = useCallback((data: UI.UsersEvent | UI.GameUpdateEvent | UI.GameFinishedEvent | UI.SettingsUpdateEvent | UI.MessageProcessedEvent | UI.DarkSettingEvent | UI.UserOnlineEvent) => {
    (document.getElementById("ui") as HTMLIFrameElement)?.contentWindow!.postMessage(JSON.parse(JSON.stringify(data)))
  }, []);

  useEffect(() => {
    loadSaveStates()
  }, [loadSaveStates])

  useEffect(() => {
    if (phase === 'new') {
      sendToUI({type: "settingsUpdate", settings, seatCount});
    }
  }, [phase, sendToUI, settings, seatCount])

  const setNumberAndSeat = useCallback((n: number) => {
    setPlayers(possibleUsers.slice(0, n).map((u, i) => ({
      id: u.id,
      name: u.name,
      avatar: avatarURL(u.id),
      color: colors[i],
      position: i+1,
      host: i === 0,
    })))
    setNumberOfUsers(n)
  }, [])

  const saveCurrentState = useCallback(async (
    name: string,
    initialState: InitialStateHistoryItem,
    history: HistoryItem[],
    settings: Game.GameSettings,
    players: UI.UserPlayer[]
  ): Promise<void> => {
    return fetch(`/states/${encodeURIComponent(name)}`, {
      headers: {
        'Content-type': 'application/json',
      },
      body: JSON.stringify({
        initialState, history, players, settings
      }),
      method: "POST"
    }).then(() => loadSaveStates())
  }, [loadSaveStates]);

  const saveCurrentStateCallback = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault();
    const target = e.target as typeof e.target & {
      name: { value: string };
    };
    saveCurrentState(target.name.value, initialState!, history, settings, players)
  }, [saveCurrentState, initialState, history, settings, players])

  const bootstrap = useCallback((): string => {
    return JSON.stringify({
      host: currentUserID === possibleUsers[0].id,
      userID: currentUserID,
      minPlayers,
      maxPlayers,
      defaultPlayers,
      dev: true
    })
  }, [currentUserID]);

  const updateUI = useCallback(async (update: {game: Game.GameState, players: Game.PlayerState[]}) => {
    if (reprocessing) return;
    const playerState = update.players.find(p => p.position === currentPlayer.position)?.state;
    switch(update.game.phase) {
      case 'finished':
        sendToUI({
          type: "gameFinished",
          position: currentPlayer.position,
          state: playerState,
          winners: update.game.winners,
        });
        break
      case 'started':
        let position = currentPlayer.position;
        if (autoSwitch && update.game.currentPlayers[0] !== currentPlayer.position && currentUserIDRequested === undefined) {
          position = update.game.currentPlayers[0];
          setCurrentUserID(players.find(p => p.position === position)!.id!);
          return
        }
        sendToUI({
          type: "gameUpdate",
          position: currentPlayer.position,
          state: playerState,
          currentPlayers: update.game.currentPlayers,
          readOnly: historyPin !== undefined,
        });
        break
    }
  }, [sendToUI, reprocessing, autoSwitch, players, currentPlayer, currentUserIDRequested, historyPin]);

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

  const reprocessHistory = useCallback(async (history: HistoryItem[], settings: Game.GameSettings, players: UI.UserPlayer[]): Promise<[
    Game.GameUpdate, InitialStateHistoryItem | undefined, HistoryItem[], Game.GameSettings, Game.Player[]
  ]> => {
    let newInitialState: Game.GameUpdate | undefined;
    let initialState: InitialStateHistoryItem | undefined = undefined;
    let previousUpdate: Game.GameUpdate | undefined;
    const newHistory: HistoryItem[] = []
    try {
      newInitialState = await sendInitialState({players, settings});
      previousUpdate = newInitialState;
      console.time('reprocessHistory');
      let i = 0;
      while(i < history.length && previousUpdate.game.phase !== 'finished') {
        const { move, position } = history[i]
        try {
          previousUpdate = await processMove(previousUpdate.game, {position, data: move});
          newHistory.push({position, move, seq: i, state: previousUpdate})
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
      setCurrentUserID(players[0].id!)
      setCurrentUserIDRequested(undefined)
      initialState = newInitialState ? {state: newInitialState, players, settings} : undefined;
      setInitialState(initialState)
      setHistory(newHistory);
      setHistoryPin(undefined);
      setPhase(newInitialState ? 'started' : 'new');
    }
    return [previousUpdate, initialState, newHistory, settings, players];
  }, []);

  const reprocessHistoryCallback = useCallback(async () => {
    setReprocessing(true)
    try {
      if (initialState && settings) {
        const [update] = await reprocessHistory(history, settings, players)
        await updateUI(update);
      }
    } catch(e) {
      console.error("error reprocessing history")
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
      console.error("eventsource error", e)
    }

    return () => evtSource.close()
  }, [])

  const users = useMemo((): UI.User[] => {
    const users = possibleUsers.slice(0, numberOfUsers).map(u => {
      const player = players.find(p => u.id === p.id);
      return ({
        id: u.id,
        name: player?.name ?? u.name,
        avatar: avatarURL(u.id),
        playerDetails: playerDetailsForUser(host, players, u.id, playerReadiness.get(u.id) ?? true),
      })
    })

    players.forEach(p => {
      if (users.find(u => u.id === p.id)) return

      users.push({
        id: p.id,
        name: p.name,
        avatar: avatarURL(p.id),
        playerDetails: {
          reserved: isReserved(p.id),
          color: p.color,
          position: p.position,
          settings: p.settings,
          ready: true,
        }
      })
    })

    return users
  }, [host, numberOfUsers, playerReadiness, players])

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
        setCurrentUserID(players[idx].id!);
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
        case 'updateSettings':
          setSettings(evt.settings);
          setSeatCount(evt.seatCount);
          sendToUI({type: "messageProcessed", id: evt.id, error: undefined})
          break
        case 'move':
          const previousState = history.length === 0 ? initialState!.state : history[history.length - 1].state!;
          if (previousState.game.phase === 'finished') break;
          try {
            const moveUpdate = await processMove(previousState.game, {position: currentPlayer.position, data: evt.data});
            const newHistory = [...history, {
              position: currentPlayer.position,
              seq: history.length,
              state: moveUpdate,
              move: evt.data,
            }];
            setHistory(newHistory);
            setHistoryPin(undefined);
            sendToUI({type: "messageProcessed", id: evt.id, error: undefined})
            setCurrentUserIDRequested(undefined);
            if (moveUpdate.game.phase === 'started' && autoSwitch && moveUpdate.game.currentPlayers[0] !== currentPlayer.position) {
              setCurrentUserID(players.find(p => p.position === (moveUpdate.game as Game.GameStartedState).currentPlayers[0])!.id!);
              return
            }
            await updateUI(moveUpdate);
          } catch(err) {
            sendToUI({type: "messageProcessed", id: evt.id, error: String(err)})
          }
          break
        case 'start':
          try {
            const initialUpdate = await sendInitialState({ players, settings });
            const newInitialState = {
              state: initialUpdate,
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
            sendToUI({type: "settingsUpdate", settings, seatCount});
            sendToUI({type: "users", users});
          } else {
            await updateUI(getCurrentState(history));
          }
          break
        case 'updatePlayers':
          let newPlayers = players.slice()
          let p: Game.Player | undefined
          for (let op of evt.operations) {
            switch (op.type) {
              case 'reserve':
                newPlayers.push({
                  color: op.color,
                  name: op.name,
                  avatar: avatarURL("reserved"),
                  host: false,
                  position: op.position,
                  id: crypto.randomUUID(),
                })
                break
              case 'seat':
                newPlayers.push({
                  color: op.color,
                  name: op.name,
                  avatar: avatarURL(op.userID),
                  host: op.userID === possibleUsers[0].id,
                  position: op.position,
                  id: op.userID,
                })
                break
              case 'unseat':
                const unseatOp = op
                newPlayers = newPlayers.filter(p => p.id !== unseatOp.userID)
                break
              case 'update':
                const updateOp = op
                p = newPlayers.find(p => p.id === updateOp.userID)
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
          const {name, color, position, ready} = evt
          setPlayers(players.map(p => {
            if (p.id !== currentUserID) return p
            if (ready !== undefined) {
              setPlayerReadiness(new Map([...playerReadiness, [p.id, ready]]))
            }

            return {
              ...p,
              name: name || p.name,
              color: color || p.color,
              position: position === undefined ? p.position : position,
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
  }, [currentPlayer, history, initialState, numberOfUsers, phase, players, sendToUI, updateUI, settings, seatCount, getCurrentState, processKey, autoSwitch, currentUserID, users, playerReadiness]);

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
      sendToUI({type: "userOnline", id: p.id!, online: true})
    })
  }, [players, sendToUI])

  useEffect(() => {
    sendToUI({type: "users", users});
  }, [users, sendToUI])

  useEffect(() => {
    sendToUI({ type: 'darkSetting', dark: darkMode !== false })
  }, [darkMode, sendToUI])

  const loadState = useCallback(async (name: string) => {
    setReprocessing(true)
    const response = await fetch(`/states/${encodeURIComponent(name)}`);
    const state = await response.json() as SaveStateData;
    try {
      const [, initialState, history, settings, players] = await reprocessHistory(state.history, state.settings, state.players);
      if (initialState) await saveCurrentState(name, initialState, history, settings, players)
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

  const viewHistory = useCallback((idx: number) => {
    setHistoryPin(() => idx === history.length -1 ? undefined : idx);
    updateUI(idx === -1 ? initialState!.state : history[idx].state)
  }, [updateUI, initialState, history])

  const revertTo = useCallback((idx: number) => {
    setHistory(history.slice(0, idx+1))
    setHistoryPin(undefined);
    updateUI(idx === -1 ? initialState!.state : history[idx].state)
  }, [updateUI, initialState, history])

  const resetRandomSeed = useCallback(() => {
    sessionStorage.setItem('rseed', crypto.randomUUID());
    resetGame()
  }, [resetGame])

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
          {phase === "new" && <span><input style={{width: '3em', marginRight: '0.5em'}} type="number" value={numberOfUsers} min={minPlayers} max={maxPlayers} onChange={v => setNumberAndSeat(parseInt(v.currentTarget.value))}/> Number of players</span>}
          <span style={{flexGrow: 1}}>
            {users.filter(u => phase === 'new' || u.playerDetails).map(u => (
              <button
                className="player"
                onClick={() => {setCurrentUserIDRequested(u.id!); setCurrentUserID(u.id!)}}
                key={u.id}
                style={{
                  backgroundColor: u.playerDetails?.color || '#666',
                  opacity: phase === 'started' && (currentPlayer.id !== u.id) ? 0.4 : 1,
                  border: phase === 'started' && (currentPlayer.id !== u.id) ? '2px transparent solid' : '2px black solid'}}>
                {u.name}
              </button>
            ))}
          </span>
          <span style={{marginRight: '0.5em'}}>🌞</span>
          <Switch onChange={(v) => setDarkMode(v)} checked={darkMode} uncheckedIcon={false} checkedIcon={false} />
          <span style={{marginLeft: '0.5em'}}>🌚</span>
          <button style={{marginLeft: '1em'}} onClick={() => resetRandomSeed()}>Reset seed</button>
          <button style={{marginLeft: '0.5em', fontSize: '20pt'}} className="button-link" onClick={() => setHelpOpen(true)}>ⓘ</button>
        </div>
        {reprocessing && <div style={{height: '100vh', width: '100vw'}}>REPROCESSING HISTORY</div>}
        {!reprocessing && (
          <iframe
            seamless
            style={{border: 1, flexGrow: 4}}
            id="ui"
            title="ui"
            src={`/ui.html?bootstrap=${encodeURIComponent(bootstrap())}`}
          />
        )}
        <iframe onLoad={() => reprocessHistoryCallback()} style={{height: '0', width: '0'}} id="game" title="game" src="/game.html"></iframe>
      </div>
      <div id="history" className={historyCollapsed ? "collapsed" : ""}>
        <h2>
          <svg onClick={() => setHistoryCollapsed(!historyCollapsed)} className="arrow" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg">
            <path d="M721.833102 597.433606l-60.943176 60.943176-211.189226-211.189225L510.643877 386.244381z" fill={darkMode ? "#bbb" : "#444"} />
            <path d="M299.323503 597.30514l60.943176 60.943176 211.189226-211.189225L510.512728 386.115915z" fill={darkMode ? "#bbb" : "#444"} />
          </svg>
          {historyCollapsed || <span>History <button onClick={() => resetGame()}>Reset game</button></span>}
        </h2>
        <History
          players={players}
          view={n => viewHistory(n)}
          revertTo={n => revertTo(n)}
          initialState={initialState}
          items={history}
          collapsed={historyCollapsed}
          darkMode={darkMode}
        />
      </div>
    </div>
    </>
  );
}

export default App;
