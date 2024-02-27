package internal

type BuildCommand struct {
	Dev        string `json:"dev"`
	Production string `json:"prod"`
}

type UIConfig struct {
	Root            string       `json:"root"`
	BuildCommand    BuildCommand `json:"build"`
	WatchPaths      []string     `json:"watchPaths"`
	OutputDirectory string       `json:"outDir"`
}

type GameConfig struct {
	Root         string       `json:"root"`
	BuildCommand BuildCommand `json:"build"`
	WatchPaths   []string     `json:"watchPaths"`
	OutputFile   string       `json:"out"`
}

type ManifestV1 struct {
	MinimumPlayers int        `json:"minPlayers"`
	MaximumPlayers int        `json:"maxPlayers"`
	DefaultPlayers int        `json:"defaultPlayers,omitempty"`
	UI             UIConfig   `json:"ui"`
	Game           GameConfig `json:"game"`
}
