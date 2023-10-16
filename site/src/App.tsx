import ReconnectingEventSource from "reconnecting-eventsource";
import React, { useCallback, useEffect, useState } from 'react';
import History from './History';
import { HistoryItem, InitialStateHistoryItem } from './types';
import { Modal } from 'react-responsive-modal';

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
  {id: "1", name: "Logan"},
  {id: "2", name: "Avery"},
  {id: "3", name: "Jayden"},
  {id: "4", name: "Aischa"},
  {id: "5", name: "Shyamapada"},
  {id: "6", name: "Iovica"},
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
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [players, setPlayers] = useState<UI.UserPlayer[]>([]);
  const [buildError, setBuildError] = useState<BuildError | undefined>();
  const [settings, setSettings] = useState<Game.GameSettings>({});
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [saveStatesOpen, setSaveStatesOpen] = useState(false);
  const [saveStates, setSaveStates] = useState<SaveState[]>([])

  const loadSaveStates = useCallback(async () => {
    const response = await fetch('/states')
    const states = await response.json();
    setSaveStates((states as {entries: SaveState[]}).entries)
  }, []);

  const getCurrentState = useCallback((history?: HistoryItem[]): Game.GameState => (
    history?.length ? history[history.length - 1].state! : initialState?.state!
  ), [initialState]);

  useEffect(() => {
    loadSaveStates()
  }, [loadSaveStates])

  const saveCurrentState = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault();
    const target = e.target as typeof e.target & {
      name: { value: string };
    };
    fetch(`/states/${encodeURIComponent(target.name.value)}`, {
      headers: {
        'Content-type': 'application/json',
      },
      body: JSON.stringify({
        initialState, history, players, settings
      }),
      method: "POST"
    }).then(response => {
      console.log(response)
    }).then(() => loadSaveStates())
  }, [initialState, history, loadSaveStates, players, settings]);

  const bootstrap = useCallback((): string => {
    return JSON.stringify({
      host: true,
      userID: possibleUsers[currentPlayer].id,
      minPlayers,
      maxPlayers
    })
  }, [currentPlayer]);

  const sendToUI = useCallback((data: UI.PlayersEvent | UI.GameUpdateEvent | UI.SettingsUpdateEvent | UI.MessageProcessedEvent) => {
    (document.getElementById("ui") as HTMLIFrameElement).contentWindow!.postMessage(data)
  }, [])

  const updateUI = useCallback((update: Game.GameUpdate) => {
    if (update.game.currentPlayerPosition) {
      console.log('setCurrentPlayer from', currentPlayer, update.game.currentPlayerPosition);
      setCurrentPlayer(update.game.currentPlayerPosition);
    }
    sendToUI({
      type: "gameUpdate",
      state: {
        position: currentPlayer,
        state: update.players.find(p => p.position === currentPlayer)!.state
      }
    });
  }, [sendToUI, currentPlayer]);

  const resetGame = useCallback(() => {
    setPhase("new");
    setSettings({});
    setInitialState(undefined);
    setHistory([]);
    setPlayers([]);
    setCurrentPlayer(0);
    (document.getElementById("ui") as HTMLIFrameElement).contentWindow?.location.reload();
    (document.getElementById("game") as HTMLIFrameElement).contentWindow?.location.reload();
  }, [])

  const reprocessHistory = useCallback(async () => {
    console.log('reprocessing history items', history.length);
    if (!initialState) return
    if (!settings) return
    let previousUpdate: Game.GameUpdate;
    try {
      previousUpdate = await sendInitialState({players, settings})
      let i = 0;
      const newHistory: HistoryItem[] = []
      while(i < history.length) {
        const { move, position } = history[i]
        try {
          previousUpdate = await processMove(previousUpdate.game, {...move, position});
          newHistory.push({position, move, seq: i, state: previousUpdate.game, messages: previousUpdate.messages})
        } catch(e) {
          console.error("error while reprocessing history", e)
          break
        }
        i++;
      }
      setHistory(newHistory);
      updateUI(previousUpdate);
    } catch(e) {
      console.error("reprocess", e)
    }
  }, [history, initialState, players, settings, updateUI]);

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
              (document.getElementById("game") as HTMLIFrameElement).contentWindow?.location.reload();
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
      console.log("eventsource error", e)
    }

    return () => evtSource.close()
  }, [])

  const updateUIFromState = useCallback(async (state: Game.GameState, position: number) => {
    setCurrentPlayer(position);
    sendToUI({
      type: "gameUpdate",
      state: {
        position: currentPlayer,
        state: await getPlayerState(state, position)
      }
    });
  }, [sendToUI, currentPlayer]);

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
      UI.SwitchPlayerMessage
    >) => {
      const path = (e.source! as WindowProxy).location.pathname
      console.log("got event", path, e.data.type)
      switch(e.data.type) {
        case 'initialStateResult':
          if (path !== '/game.html') return console.error("expected event from game.html!")
          resolveGamePromise(e.data.id, e.data.state)
          break
        case 'processMoveResult':
          if (path !== '/game.html') return console.error("expected event from game.html!")
          if (e.data.error) {
            rejectGamePromise(e.data.id, e.data.error)
          } else {
            resolveGamePromise(e.data.id, e.data.state)
          }
          break
        case 'getPlayerStateResult':
          if (path !== '/game.html') return console.error("expected event from game.html!")
          resolveGamePromise(e.data.id, e.data.state)
          break
        case 'updateSettings':
          if (path !== '/ui.html') return console.error("expected event from ui.html!")
          setSettings(e.data.settings);
          sendToUI({type: "messageProcessed", id: e.data.id, error: undefined})
          break
        case 'move':
          if (path !== '/ui.html') return console.error("expected event from ui.html!")
          const previousState = history.length === 0 ? initialState!.state : history[history.length - 1].state!;
          console.log("move!", e.data)
          try {
            const moveUpdate = await processMove(previousState, {position: currentPlayer, data: e.data.data});
            const newHistory = [...history, {
              position: currentPlayer,
              seq: history.length,
              state: moveUpdate.game,
              messages: moveUpdate.messages,
              move: e.data,
            }];
            setHistory(newHistory);
            sendToUI({type: "messageProcessed", id: e.data.id, error: undefined})
            updateUI(moveUpdate);
          } catch(err) {
            sendToUI({type: "messageProcessed", id: e.data.id, error: String(err)})
          }
          break
        case 'start':
          if (path !== '/ui.html') return console.error("expected event from ui.html!")
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
            updateUI(initialUpdate);
          } catch(err) {
            sendToUI({type: "messageProcessed", id: e.data.id, error: String(err)})
          }
          // this is a bit of a lie, it doesn't actually know how it was processed by game
          break
        case 'ready':
          if (path !== '/ui.html') return console.error("expected event from ui.html!")
          console.log('ready', initialState);
          if (!initialState) {
            if (settings) {
              sendToUI({type: "settingsUpdate", settings});
            }
            sendToUI({type: "players", players, users: possibleUsers.slice(0, numberOfUsers)});
          } else {
            updateUIFromState(getCurrentState(history), currentPlayer);
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
        case 'switchPlayer':
          if (path !== '/ui.html') return console.error("expected event from ui.html!")
          if (e.data.index >= players.length) break
          setCurrentPlayer(e.data.index)
          break
      }
    }

    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [currentPlayer, history, initialState, numberOfUsers, phase, players, sendToUI, updateUI, updateUIFromState, settings, getCurrentState]);

  useEffect(() => {
    const keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']
    const validKeys = keys.slice(0, players.length)
    const l = (e: globalThis.KeyboardEvent):any => {
      if (e.code === 'KeyS' && e.shiftKey) {
        e.stopPropagation();
        setSaveStatesOpen((s) => !s)
        return
      }

      if (e.code === 'KeyR' && e.shiftKey) {
        e.stopPropagation();
        (document.getElementById("ui") as HTMLIFrameElement).contentWindow?.location.reload();
        (document.getElementById("game") as HTMLIFrameElement).contentWindow?.location.reload();
        return
      }

      const idx = validKeys.indexOf(e.code)
      if (!e.shiftKey || idx === -1) return
      e.stopPropagation();
      setCurrentPlayer(players[idx].position);
    }
    window.addEventListener('keydown', l);
    return () => window.removeEventListener('keydown', l);
  }, [players])

  useEffect(() => {
    sendToUI({type: "players", players, users: possibleUsers.slice(0, numberOfUsers)});
  }, [numberOfUsers, players, sendToUI])

  const loadState = useCallback(async (name: string) => {
    const response = await fetch(`/states/${encodeURIComponent(name)}`);
    const state = await response.json() as SaveStateData;
    setSettings(state.settings);
    setPlayers(state.players);
    setInitialState(state.initialState);
    setHistory(state.history);
    (document.getElementById("ui") as HTMLIFrameElement).contentWindow?.location.reload();
  }, []);

  const deleteState = useCallback(async (name: string) => {
    await fetch(`/states/${encodeURIComponent(name)}`, {method: "DELETE"});
    await loadSaveStates();
  }, [loadSaveStates]);

  return (
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
          <form onSubmit={(e) => saveCurrentState(e)}>
            Name <input type="text" name="name"/><br/>
            <input type="submit" disabled={!initialState} value="Save new state" />
          </form>
        </div>
      </Modal>

      <div style={{display: 'flex', flexDirection:'column', flexGrow: 1}}>
        <div style={{display: 'flex', flexDirection:'row', alignItems: "center"}}>
          <input style={{width: '3em'}} disabled={phase === 'started'} type="number" value={numberOfUsers} min={minPlayers} max={maxPlayers} onChange={v => setNumberOfUsers(parseInt(v.currentTarget.value))}/>
          <span style={{flexGrow: 1}}>{players.map(p =>
            <button onClick={() => setCurrentPlayer(p.position)} key={p.position} style={{backgroundColor: p.color, border: p.position === currentPlayer ? "5px black dotted" : ""}}>{p.name}</button>
          )}
          </span>
          <button style={{fontSize: '20pt'}} className="button-link" onClick={() => setHelpOpen(true)}>ⓘ</button>
        </div>
        <iframe seamless={true} sandbox="allow-scripts allow-same-origin allow-forms allow-modals" style={{border: 1, flexGrow: 4}} id="ui" title="ui" src={`/ui.html?bootstrap=${encodeURIComponent(bootstrap())}`}></iframe>
        <iframe onLoad={() => reprocessHistory()} style={{height: '0', width: '0'}} id="game" title="game" src="/game.html"></iframe>
      </div>
      <div style={{width: '30vw', paddingLeft: '1em', height:'100vh', display: 'flex', flexDirection:'column'}}>
        <h2>History <button onClick={() => resetGame()}>Reset game</button></h2>
      <History
        players={players}
        view={n => updateUIFromState(n === -1 ? initialState!.state : history[n].state, currentPlayer)}
        revertTo={n => { setHistory(history.slice(0, n+1)); updateUIFromState(history[n].state, currentPlayer) }}
        initialState={initialState}
        items={history}/>
      </div>
    </div>
  );
}

export default App;
