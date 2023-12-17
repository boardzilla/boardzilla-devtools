-: *Host start game*
Client -> Server: POST `/sessions`
Server -> Client: setup page
note: page includes a single shareable <invite URL>
Client -> Client Game: `Setup page`
note: get min/max players to show seating
Client -> Server: `ReadyMessage`
Server -> Client: `UserEvent`


-: *User joins lobby*
Client -> Server: GET <invite URL>
Server -> Client: setup page
Server -> All Clients: `UsersEvent`
Client -> Server: `ReadyMessage`
Server -> Client: `SettingsUpdateEvent`
Client -> Client Game: `Setup page`
note: shows seating and current settings

-: *Host seats user*
Client -> Server: `UpdatePlayersMessage[SeatOperation]`
note: Host UI picks an available color, plus any default settings and includes here
Server -> All Clients: `UsersEvent`

-: *Host swaps seats*
Client -> Server: `UpdatePlayersMessage[SeatOperation, SeatOperation]`
Server -> All Clients: `UsersEvent`

-: *Host unseats user*
Client -> Server: `UpdatePlayersMessage[UnseatOperation]`
Server -> All Clients: `UsersEvent`

-: *Host reserves seat*
Client -> Server: `UpdatePlayersMessage[ReserveOperation]`
Server -> All Clients: `UsersEvent`

-: *Host changes player info*
Client -> Server: `UpdatePlayersMessage[UpdateOperation]`
Server -> All Clients: `UsersEvent`

-: *User changes own color/name*
Client -> Server: `UpdateSelfPlayerMessage`
Server -> All Clients: `UsersEvent`

-: *Host changes setting*
Client -> Server: `UpdateSettingsMessage`
Server -> All Clients: `SettingsUpdateEvent`

-: *Host starts game*
Client -> Server: `StartMessage`
Server -> Server Game: `InitialState`
Server <- Server Game: returns `GameUpdate`
Server -> All Clients: `GameUpdateEvent`
note: server persists `GameUpdate` and broadcasts `GameUpdate.players[n]` to each player
All Clients -> Client Game: `game.setState`

=: **Game Play**

-: *Player makes move*
Client <-> Client Game: `processMove` returns success or `Selection`
Client -> Server: `MoveMessage`
Server -> Server Game: `processMove`
Server <- Server Game: returns `GameUpdate`
Server -> All Clients: `GameUpdateEvent`
note: server persists `GameUpdate` and broadcasts `GameUpdate.players[n]` to each player
All Clients -> Client Game: `game.setState`

-: *Player joins game*
Client -> Server: GET <session URL>
Server -> Client: game page
Client -> Client Game: `Setup page`
Server -> All Clients: `UserEvent`
note: included for chat
Client -> Server: `ReadyMessage`
Server -> Client: `GameUpdateEvent`
note: `GameUpdate` from server persisted state
Client -> Client Game: `game.setState`

order: Server Game, Server, Client, All Clients, Client Game
