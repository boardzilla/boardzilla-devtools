package devtools

import (
	"embed"
	"encoding/json"
	"fmt"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sync"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

var liveDev = os.Getenv("LIVE_DEV") == "1"

//go:embed *.html
//go:embed site/build/*
var site embed.FS

type Server struct {
	gameRoot string
	manifest *ManifestV1
	port     int
	players  int
	senders  map[int]chan int
	lock     sync.Mutex
}

func NewServer(gameRoot string, manifest *ManifestV1, port, players int) (*Server, error) {
	return &Server{
		gameRoot: gameRoot,
		manifest: manifest,
		port:     port,
		players:  players,
		senders:  map[int]chan int{},
		lock:     sync.Mutex{},
	}, nil
}

type reloadEvent struct {
	Type   string `json:"type"`
	Target string `json:"target"`
}

func (s *Server) Serve() {
	i := 0
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Get("/events", func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)

		if !ok {
			http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
			return
		}

		s.lock.Lock()
		currentID := i
		c := make(chan int)
		s.senders[i] = c
		s.lock.Unlock()
		i++

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		encoder := json.NewEncoder(w)

		defer func() {
			s.lock.Lock()
			defer s.lock.Unlock()
			delete(s.senders, currentID)
		}()

		for i := range c {
			var reloadTarget string
			switch i {
			case ReloadGame:
				reloadTarget = "game"
			case ReloadUI:
				reloadTarget = "ui"
			}
			if _, err := w.Write([]byte("data: ")); err != nil {
				fmt.Printf("err: %#v\n", err)
				return
			}
			if err := encoder.Encode(&reloadEvent{
				Type:   "reload",
				Target: reloadTarget,
			}); err != nil {
				fmt.Printf("err: %#v\n", err)
				return
			}
			if _, err := w.Write([]byte("\n\n")); err != nil {
				fmt.Printf("err: %#v\n", err)
				return
			}
			flusher.Flush()
		}
	})
	r.Get("/ui.js", func(w http.ResponseWriter, r *http.Request) {
		f, err := os.ReadFile(path.Join(s.gameRoot, s.manifest.UI.Root, s.manifest.UI.OutputDirectory, "index.js"))
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
		w.Header().Add("Content-type", "application/javascript")
		w.Write(f)
	})
	r.Get("/game.js", func(w http.ResponseWriter, r *http.Request) {
		f, err := os.ReadFile(path.Join(s.gameRoot, s.manifest.Game.Root, s.manifest.Game.BuildArtifact))
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
		w.Header().Add("Content-type", "application/javascript")
		w.Write(f)
	})
	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		path := r.RequestURI
		if path == "/" {
			path = "index.html"
		}
		ext := filepath.Ext(path)
		f, err := s.getFile(path)
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
		w.Header().Add("Content-type", mime.TypeByExtension(ext))
		w.Write(f)
	})
	http.ListenAndServe(fmt.Sprintf(":%d", s.port), r)
}

func (s *Server) Reload(t int) {
	s.lock.Lock()
	defer s.lock.Unlock()
	fmt.Printf("reloadin! %d\n", t)
	for i, sender := range s.senders {
		fmt.Printf("i! %d\n", i)
		sender <- t
		fmt.Printf("done i! %d\n", i)
	}
}

func (s *Server) getFile(n string) ([]byte, error) {
	switch n {
	case "/game.html", "/ui.html":
		n = path.Join(".", n)
	default:
		n = path.Join("site", "build", n)
	}
	if liveDev {
		return os.ReadFile(n)
	}
	return site.ReadFile(n)
}
