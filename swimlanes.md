-: *Host start game*
Client -> Server: POST `/sessions`
Server -> Client: setup page
note: page includes a single shareable <invite URL>
Client -> Client Game: `setup`
note: just needed to get min/max players?
Client -> Server: `ReadyMessage`
Server -> Client: `UserEvent`


-: *User joins lobby*
Client -> Server: GET <invite URL>
Server -> Client: setup page
Server -> All Clients: `UserEvent`
Client -> Server: `ReadyMessage`
Server -> Client: `SettingsUpdateEvent`


-: *Host seats user*
Client -> Server: `UpdatePlayersMessage[SeatOperation]`
note: Host UI picks an available color, plus any default settings and includes here
Server -> All Clients: `PlayersEvent`

-: *Host swaps seats*
Client -> Server: `UpdatePlayersMessage[SeatOperation, SeatOperation]`
Server -> All Clients: `PlayersEvent`

-: *Host unseats user*
Client -> Server: `UpdatePlayersMessage[UnseatOperation]`
Server -> All Clients: `PlayersEvent`

-: *Host reserves seat*
Client -> Server: `UpdatePlayersMessage[ReserveOperation]`
Server -> All Clients: `PlayersEvent`

-: *Host changes player info*
Client -> Server: `UpdatePlayersMessage[UpdateOperation]`
Server -> All Clients: `PlayersEvent`

-: *User changes own color/name*
Client -> Server: `UpdateSelfPlayerMessage`
Server -> All Clients: `PlayersEvent`

-: *Host changes setting*
Client -> Server: `UpdateSettingsMessage`
Server -> All Clients: `SettingsUpdateEvent`

-: *Host starts game*
Client -> Server: `StartMessage`
Server <-> Server Game: `InitialState` returns `GameUpdate`
Server -> All Clients: route change to <session URL> + `GameUpdateEvent`
note: server persists `GameUpdate` and broadcasts `GameUpdate.players[n]` to each player
All Clients -> Client Game: `game.setState`

=: **Game Play**

-: *Player makes move*
Client <-> Client Game: `processMove` returns success or `Selection`
Client -> Server: `MoveMessage`
Server <-> Server Game: `processMove` returns `GameUpdate`
Server -> All Clients: `GameUpdateEvent`
note: server persists `GameUpdate` and broadcasts `GameUpdate.players[n]` to each player
All Clients -> Client Game: `game.setState`

-: *Player joins game*
Client -> Server: GET <session URL>
Server -> Client: game page
Client -> Client Game: `setup`
Server -> All Clients: `UserEvent`
note: included for chat
Client -> Server: `ReadyMessage`
Server -> Client: `GameUpdateEvent`
note: `GameUpdate` from server persisted state
Client -> Client Game: `game.setState`

order: Server Game, Server, Client, All Clients, Client Game
