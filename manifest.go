package devtools

type UIConfig struct {
	Root            string `json:"root"`
	BuildCommand    string `json:"build"`
	Source          string `json:"src"`
	OutputDirectory string `json:"out"`
}

type GameConfig struct {
	Root          string `json:"root"`
	BuildCommand  string `json:"build"`
	Source        string `json:"src"`
	BuildArtifact string `json:"artifact"`
}

type ManifestV1 struct {
	Name           string     `json:"name"`
	MinimumPlayers int        `json:"minPlayers"`
	MaximumPlayers int        `json:"maxPlayers"`
	UI             UIConfig   `json:"ui"`
	Game           GameConfig `json:"Game"`
}

// {
//   "name": "Number guesser",
//   "minPlayers": 2,
//   "maxPlayers": 2,
//   "ui": {
//     "root": "ui",
//     "build": "npm run build",
//     "artifact": "build/index.js"
//   },
//   "game": {
//     "root": "game",
//     "build": "npm run build",
//     "artifact": "build/index.js"
//   }
// }
