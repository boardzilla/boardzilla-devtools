package devtools

import (
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

var liveDev = os.Getenv("LIVE_DEV") == "1"

//go:embed *.html
//go:embed *.jpg
//go:embed site/build/*
//go:embed site/node_modules/@fontsource-variable/dm-sans/index.css
//go:embed site/node_modules/@fontsource-variable/dm-sans/files/*
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
		escapedTarget := path.Join(saveStatesPath, chi.URLParam(r, "name"))
		target, err := url.PathUnescape(escapedTarget)
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
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
		escapedTarget := path.Join(saveStatesPath, chi.URLParam(r, "name"))
		target, err := url.PathUnescape(escapedTarget)
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
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
		escapedTarget := path.Join(saveStatesPath, chi.URLParam(r, "name"))
		target, err := url.PathUnescape(escapedTarget)
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
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

	r.Get("/font.css", func(w http.ResponseWriter, r *http.Request) {
		f, err := s.getFile("site/node_modules/@fontsource-variable/dm-sans/index.css")
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
		w.Header().Add("Content-type", "text/css")
		w.WriteHeader(200)
		if _, err := w.Write(f); err != nil {
			fmt.Printf("error while writing: %s", err.Error())
		}
	})

	r.Get("/files/dm-sans-latin-ext-wght-normal.woff2", func(w http.ResponseWriter, r *http.Request) {
		f, err := s.getFile("site/node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-ext-wght-normal.woff2")
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
		w.Header().Add("Content-type", "font/woff2")
		w.WriteHeader(200)
		if _, err := w.Write(f); err != nil {
			fmt.Printf("error while writing: %s", err.Error())
		}
	})

	r.Get("/files/dm-sans-latin-wght-normal.woff2", func(w http.ResponseWriter, r *http.Request) {
		f, err := s.getFile("site/node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2")
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
		w.Header().Add("Content-type", "font/woff2")
		w.WriteHeader(200)
		if _, err := w.Write(f); err != nil {
			fmt.Printf("error while writing: %s", err.Error())
		}
	})

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		f, err := s.getBuildFile("index.html")
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
		f, err := s.getFile("ui.html")
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
		w.Header().Add("Content-Security-Policy", "default-src 'self'; connect-src 'none'; object-src 'self' data:")
		if err := t.Execute(w, data); err != nil {
			fmt.Printf("error: %#v\n", err)
		}
	})

	r.Get("/game.html", func(w http.ResponseWriter, r *http.Request) {
		f, err := s.getFile("game.html")
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
		w.Header().Add("Content-type", "text/html")
		w.Header().Add("Cache-control", "no-store")
		w.WriteHeader(200)
		if _, err := w.Write(f); err != nil {
			fmt.Printf("error while writing: %s", err.Error())
		}
	})

	r.Get("/_profile/*", func(w http.ResponseWriter, r *http.Request) {
		assetPath := chi.URLParam(r, "*")
		f, err := s.getBuildFile(assetPath)
		if err != nil {
			fmt.Printf("error: %#v\n", err)
			w.WriteHeader(500)
			return
		}
		w.Header().Add("Content-type", "image/jpg")
		if _, err := w.Write(f); err != nil {
			fmt.Printf("error: %#v\n", err)
		}
	})

	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		assetPath := chi.URLParam(r, "*")
		ext := filepath.Ext(assetPath)
		f, err := s.getBuildFile("/" + assetPath)
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
	if liveDev {
		go func() {
			cmd := exec.Command("npm", "run", "build:watch")
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			cmd.Dir = "site"
			if err := cmd.Run(); err != nil {
				panic(err)
			}
		}()
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

func (s *Server) getBuildFile(n string) ([]byte, error) {
	switch n {
	case "/game.html", "/ui.html", "0.jpg", "1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg", "7.jpg", "8.jpg", "9.jpg":
		n = path.Join(".", n)
	default:
		n = path.Join("site", "build", n)
	}
	if liveDev {
		return os.ReadFile(filepath.Clean(n))
	}
	return site.ReadFile(n)
}

func (s *Server) getFile(n string) ([]byte, error) {
	n = path.Join(".", n)
	if liveDev {
		return os.ReadFile(filepath.Clean(n))
	}
	return site.ReadFile(n)
}
