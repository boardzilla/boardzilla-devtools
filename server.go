package devtools

import (
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
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

type buildErrorEvent struct {
	Type   string `json:"type"`
	Target string `json:"target"`
	Out    string `json:"out"`
	Err    string `json:"err"`
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

	saveStatesPath := path.Join(s.gameRoot, ".save-states")
	if err := os.MkdirAll(saveStatesPath, 0700); err != nil {
		return err
	}

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
		c := make(chan interface{}, 10)
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

	r.Get("/states", func(w http.ResponseWriter, r *http.Request) {
		entries, err := os.ReadDir(saveStatesPath)
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}

		type entry struct {
			Name  string `json:"name"`
			Ctime int64  `json:"ctime"`
		}

		var entriesResponse struct {
			Entries []*entry `json:"entries"`
		}
		entriesResponse.Entries = []*entry{}

		for _, e := range entries {
			i, err := e.Info()
			if err != nil {
				fmt.Printf("error: %#v\n", err)
				w.WriteHeader(500)
				return
			}
			entriesResponse.Entries = append(entriesResponse.Entries, &entry{
				Name:  e.Name(),
				Ctime: i.ModTime().UnixMilli(),
			})
		}
		w.Header().Add("Content-type", "application/json")
		w.Header().Add("Cache-control", "no-store")
		w.WriteHeader(200)
		if err := json.NewEncoder(w).Encode(entriesResponse); err != nil {
			fmt.Printf("error: %#v\n", err)
		}
	})

	r.Get("/states/{name}", func(w http.ResponseWriter, r *http.Request) {
		target := path.Join(saveStatesPath, chi.URLParam(r, "name"))
		data, err := os.ReadFile(filepath.Clean(target))
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
		w.Header().Add("Content-type", "application/json")
		w.Header().Add("Cache-control", "no-store")
		w.WriteHeader(200)
		if _, err := w.Write(data); err != nil {
			fmt.Printf("error: %#v\n", err)
		}
	})

	r.Post("/states/{name}", func(w http.ResponseWriter, r *http.Request) {
		target := path.Join(saveStatesPath, chi.URLParam(r, "name"))
		f, err := os.OpenFile(filepath.Clean(target), os.O_RDWR|os.O_TRUNC|os.O_CREATE, 0600)
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}

		if _, err := io.Copy(f, r.Body); err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}

		w.WriteHeader(201)
	})

	r.Delete("/states/{name}", func(w http.ResponseWriter, r *http.Request) {
		target := path.Join(saveStatesPath, chi.URLParam(r, "name"))
		if err := os.Remove(target); err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
		w.WriteHeader(204)
	})

	r.Get("/ui.js", func(w http.ResponseWriter, r *http.Request) {
		f, err := os.ReadFile(path.Join(s.gameRoot, s.manifest.UI.Root, s.manifest.UI.OutputDirectory, "index.js"))
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
		w.Header().Add("Content-type", "application/javascript")
		w.Header().Add("Cache-control", "no-store")
		if _, err := w.Write(f); err != nil {
			fmt.Printf("error: %#v\n", err)
		}
	})

	r.Get("/game.js", func(w http.ResponseWriter, r *http.Request) {
		f, err := os.ReadFile(path.Join(s.gameRoot, s.manifest.Game.Root, s.manifest.Game.OutputFile))
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
		w.Header().Add("Content-type", "application/javascript")
		w.Header().Add("Cache-control", "no-store")
		if _, err := w.Write(f); err != nil {
			fmt.Printf("error: %#v\n", err)
		}
	})

	r.Get("/ui.css", func(w http.ResponseWriter, r *http.Request) {
		f, err := os.ReadFile(path.Join(s.gameRoot, s.manifest.UI.Root, s.manifest.UI.OutputDirectory, "index.css"))
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
		w.Header().Add("Content-type", "text/css")
		w.Header().Add("Cache-control", "no-store")
		if _, err := w.Write(f); err != nil {
			fmt.Printf("error: %#v\n", err)
		}
	})

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		f, err := s.getFile("/index.html")
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
		t, err := template.New("index.html").Parse(string(f))
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
		var data struct {
			MinimumPlayers int
			MaximumPlayers int
		}
		data.MinimumPlayers = s.manifest.MinimumPlayers
		data.MaximumPlayers = s.manifest.MaximumPlayers
		w.Header().Add("Content-type", "text/html")
		w.Header().Add("Cache-control", "no-store")
		if err := t.Execute(w, data); err != nil {
			fmt.Printf("error: %#v\n", err)
		}
	})

	r.Get("/ui.html", func(w http.ResponseWriter, r *http.Request) {
		f, err := s.getFile("/ui.html")
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
		t, err := template.New("ui.html").Parse(string(f))
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
		var data struct {
			Bootstrap string
		}
		data.Bootstrap = r.URL.Query().Get("bootstrap")
		w.Header().Add("Content-type", "text/html")
		w.Header().Add("Cache-control", "no-store")
		if err := t.Execute(w, data); err != nil {
			fmt.Printf("error: %#v\n", err)
		}
	})

	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		assetPath := chi.URLParam(r, "*")
		ext := filepath.Ext(assetPath)
		f, err := s.getFile("/" + assetPath)
		if err != nil {
			f, err = os.ReadFile(filepath.Clean(path.Join(s.gameRoot, s.manifest.UI.Root, s.manifest.UI.OutputDirectory, assetPath)))
		}
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
		w.Header().Add("Content-type", mime.TypeByExtension(ext))
		w.Header().Add("Cache-control", "no-store")
		if _, err := w.Write(f); err != nil {
			fmt.Printf("error: %#v\n", err)
		}
	})
	srv := &http.Server{
		Handler:           r,
		ReadHeaderTimeout: 200 * time.Millisecond,
		Addr:              fmt.Sprintf(":%d", s.port),
	}
	return srv.ListenAndServe()
}

func (s *Server) Reload(t int) {
	s.lock.Lock()
	defer s.lock.Unlock()
	for _, sender := range s.senders {
		var reloadTarget string
		switch t {
		case Game:
			reloadTarget = "game"
		case UI:
			reloadTarget = "ui"
		}
		sender <- &reloadEvent{
			Type:   "reload",
			Target: reloadTarget,
		}
	}
}

func (s *Server) BuildError(t int, o, e string) {
	fmt.Printf("sending build error!")
	s.lock.Lock()
	defer s.lock.Unlock()
	for _, sender := range s.senders {
		var reloadTarget string
		switch t {
		case Game:
			reloadTarget = "game"
		case UI:
			reloadTarget = "ui"
		}
		sender <- &buildErrorEvent{
			Type:   "buildError",
			Target: reloadTarget,
			Out:    o,
			Err:    e,
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
		return os.ReadFile(filepath.Clean(n))
	}
	return site.ReadFile(n)
}
