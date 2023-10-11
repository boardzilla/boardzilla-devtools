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
]

function App() {
  const savedInitialState: InitialStateHistoryItem | undefined = JSON.parse(localStorage.getItem('initialState') || 'null') || undefined;
  const savedHistory = JSON.parse(localStorage.getItem('history') || '[]') as HistoryItem[];
  const savedPlayers = savedInitialState?.players || [];
  const savedSettings = savedInitialState?.settings || {};

  const [initialState, setInitialState] = useState(savedInitialState);

  const getCurrentState = useCallback((history?: HistoryItem[]): Game.GameState => (
    history?.length ? history[history.length - 1].state! : initialState?.state!
  ), [initialState]);

  const currentState: Game.GameState = getCurrentState(savedHistory);
  const initialCurrentPlayer = currentState?.currentPlayerPosition || 1;
  const initialPhase: "new" | "started" = savedHistory?.length ? 'started' : 'new'
  const initialMinPlayers = savedPlayers.length || 1;

  const [numberOfUsers, setNumberOfUsers] = useState(initialMinPlayers);
  const [phase, setPhase] = useState(initialPhase);
  const [currentPlayer, setCurrentPlayer] = useState(initialCurrentPlayer);
  const [players, setPlayers] = useState(savedPlayers);
  const [settings, setSettings] = useState<Game.GameSettings>(savedSettings);
  const [history, setHistory] = useState(savedHistory || []);
  const [open, setOpen] = useState(false);

  const onOpenModal = () => setOpen(true);
  const onCloseModal = () => setOpen(false);

  const bootstrap = useCallback((): string => {
    return JSON.stringify({
      host: currentPlayer === players[0]?.position,
      userID: players.find(p => p.position === currentPlayer)?.userID || possibleUsers[0].id,
      minPlayers,
      maxPlayers
    })
  }, [currentPlayer, players])

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
    setPhase("new")
    setSettings({})
    setInitialState(undefined)
    setHistory([])
    setPlayers([])
    setCurrentPlayer(1)
    localStorage.removeItem('initialState');
    localStorage.removeItem('history');
    (document.getElementById("ui") as HTMLIFrameElement).contentWindow?.location.reload();
    (document.getElementById("game") as HTMLIFrameElement).contentWindow?.location.reload();
  }, [])

  const reprocessHistory = useCallback(async () => {
    return;
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
            localStorage.setItem('history', JSON.stringify(newHistory));
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
            localStorage.setItem('initialState', JSON.stringify(newInitialState));
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
  }, [currentPlayer, history, initialState, numberOfUsers, phase, players, sendToUI, updateUI, updateUIFromState, settings, getCurrentState]);

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

  useEffect(() => {
    sendToUI({type: "players", players, users: possibleUsers.slice(0, numberOfUsers)});
  }, [numberOfUsers, players, sendToUI])

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
          <input style={{width: '3em'}} disabled={phase === 'started'} type="number" value={numberOfUsers} min={minPlayers} max={maxPlayers} onChange={v => setNumberOfUsers(parseInt(v.currentTarget.value))}/>
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
