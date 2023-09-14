package devtools

import (
	"embed"
	"encoding/json"
	"fmt"
	"html"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

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
	senders  map[int]chan interface{}
	lock     sync.Mutex
}

func NewServer(gameRoot string, manifest *ManifestV1, port int) (*Server, error) {
	return &Server{
		gameRoot: gameRoot,
		manifest: manifest,
		port:     port,
		senders:  map[int]chan interface{}{},
		lock:     sync.Mutex{},
	}, nil
}

type reloadEvent struct {
	Type   string `json:"type"`
	Target string `json:"target"`
}

type pingEvent struct {
	Type string `json:"type"`
}

func (s *Server) Serve() error {
	go func() {
		for {
			s.lock.Lock()
			for _, sender := range s.senders {
				sender <- pingEvent{Type: "ping"}
			}
			s.lock.Unlock()
			time.Sleep(10 * time.Second)
		}
	}()

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
		c := make(chan interface{})
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
			if _, err := w.Write([]byte("data: ")); err != nil {
				fmt.Printf("err: %#v\n", err)
				return
			}
			if err := encoder.Encode(i); err != nil {
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
		f, err := os.ReadFile(path.Join(s.gameRoot, s.manifest.Game.Root, s.manifest.Game.OutputFile))
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
		w.Header().Add("Content-type", "application/javascript")
		w.Write(f)
	})
	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		uiPage := path == "/ui.html"
		index := path == "/"
		if index {
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
		if index {
			out := string(f)
			out = strings.ReplaceAll(out, "{{minPlayers}}", strconv.Itoa(s.manifest.MinimumPlayers))
			out = strings.ReplaceAll(out, "{{maxPlayers}}", strconv.Itoa(s.manifest.MaximumPlayers))
			f = []byte(out)
		} else if uiPage {
			out := string(f)
			bootstrap := r.URL.Query().Get("bootstrap")
			out = strings.ReplaceAll(out, "{{bootstrap-json}}", html.EscapeString(bootstrap))
			f = []byte(out)
		}
		w.Write(f)
	})
	srv := &http.Server{
		Handler: r,
		Addr:    fmt.Sprintf(":%d", s.port),
	}
	return srv.ListenAndServe()
}

func (s *Server) Reload(t int) {
	s.lock.Lock()
	defer s.lock.Unlock()
	for _, sender := range s.senders {
		var reloadTarget string
		switch t {
		case ReloadGame:
			reloadTarget = "game"
		case ReloadUI:
			reloadTarget = "ui"
		}
		sender <- &reloadEvent{
			Type:   "reload",
			Target: reloadTarget,
		}
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
