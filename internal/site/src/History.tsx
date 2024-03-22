import { useCallback, useRef, useEffect } from "react";
import { HistoryItem, InitialStateHistoryItem } from "./types";
import * as Game from "./types/game";
import JsonView from "@uiw/react-json-view";
import { lightTheme } from "@uiw/react-json-view/light";
import { darkTheme } from "@uiw/react-json-view/dark";
import "./History.css";

type HistoryProps = {
  items: HistoryItem[];
  initialState?: InitialStateHistoryItem;
  revertTo: (n: number) => void;
  view: (n: number) => void;
  players: Game.Player[];
  collapsed: boolean;
  darkMode: boolean;
};

export default function History({
  items,
  initialState,
  revertTo,
  view,
  players,
  collapsed,
  darkMode,
}: HistoryProps) {
  const historyEndRef = useRef<HTMLDivElement>(null);

  const player = useCallback(
    (pos: number): Game.Player => {
      const p = players.find((p) => p.position === pos);
      if (!p) {
        throw new Error("cannot find player");
      }
      return p;
    },
    [players]
  );

  useEffect(() => {
    if (!collapsed)
      historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items, collapsed]);

  return (
    <div className="history-list" style={{ overflowY: "scroll" }}>
      {initialState && !collapsed && (
        <>
          Initial state
          <button onClick={() => view(-1)}>View</button>
          <button onClick={() => revertTo(-1)}>Revert</button>
          {Object.entries(initialState.state.messages || []).map(([key, m]) => (
            <div
              key={key}
              dangerouslySetInnerHTML={{
                __html: m.body.replace(/\[\[[^|]*\|(.*?)\]\]/g, "<b>$1</b>"),
              }}
            />
          ))}
          <JsonView
            value={initialState}
            style={darkMode ? darkTheme : lightTheme}
            collapsed={1}
          />
        </>
      )}
      {initialState && collapsed && (
        <button
          key="-1"
          onClick={() => view(-1)}
          style={{ background: "#999" }}
        >
          -
        </button>
      )}
      {items.map((item, i) =>
        collapsed ? (
          <button
            key={item.seq}
            onClick={() => view(item.seq)}
            style={{ background: player(item.position).color }}
          >
            {player(item.position).name.slice(0, 1)}
          </button>
        ) : (
          <div key={item.seq}>
            <>
              {item.seq}
              <span
                style={{
                  marginLeft: "3px",
                  padding: "1px",
                  border: `2px ${player(item.position).color} solid`,
                }}
              >
                {player(item.position).name}
              </span>
              <button onClick={() => view(item.seq)}>View</button>
              {i !== items.length - 1 && (
                <button onClick={() => revertTo(item.seq)}>Revert</button>
              )}
              {(item.data instanceof Array ? item.data : [item.data])
                .filter((m) => "name" in m)
                .map((move: any, i: number) => (
                  <div key={i}>
                    <code>
                      {move.name}(
                      {Object.entries(move.args)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(", ")}
                      )
                    </code>
                  </div>
                ))}
              {Object.entries(item.state.messages || []).map(([key, m]) => (
                <div
                  key={key}
                  dangerouslySetInnerHTML={{
                    __html: m.body.replace(
                      /\[\[[^|]*\|(.*?)\]\]/g,
                      "<b>$1</b>"
                    ),
                  }}
                />
              ))}
              {item.state?.game.state.board && (
                <JsonView value={item.state?.game.state.board} collapsed={0} />
              )}
            </>
          </div>
        )
      )}
      <div ref={historyEndRef} />
    </div>
  );
}
