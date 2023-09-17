package main

import (
	"flag"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path"
	"path/filepath"
	"strings"

	devtools "github.com/boardzilla/boardzilla-devtools"
	"github.com/fsnotify/fsnotify"
)

func main() {
	port := flag.Int("port", 8080, "port for server")

	flag.Parse()
	if flag.NArg() != 1 {
		flag.Usage()
		os.Exit(1)
	}

	gameRoot := os.Args[1]
	devBuilder, err := devtools.NewBuilder(gameRoot)
	if err != nil {
		log.Fatal(err)
	}
	// Add a path.
	manifest, err := devBuilder.Manifest()
	if err != nil {
		log.Fatal(err)
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Fatal(err)
	}
	defer watcher.Close()
	rebuilt := make(chan int)

	go func() {
		if err := devBuilder.Build(); err != nil {
			log.Println("error during build:", err)
		}

		for {
			select {
			case e, ok := <-watcher.Events:
				if !ok {
					return
				}
				if e.Op != fsnotify.Write {
					continue
				}
				log.Printf("path.Join(gameRoot, manifest.UI.Root): %s e.Name %s\n", path.Join(gameRoot, manifest.UI.Root), e.Name)
				rel, err := filepath.Rel(path.Join(gameRoot, manifest.UI.Root, manifest.UI.Source), e.Name)
				if err != nil {
					log.Fatal(err)
				}
				log.Printf("rel %s\n", rel)
				if strings.HasPrefix(rel, "..") {
					log.Printf("Game reloaded due to change in %s\n", e.Name)
					if err := devBuilder.BuildGame(); err != nil {
						log.Println("error during rebuild:", err)
					}
					rebuilt <- devtools.ReloadGame
				} else {
					log.Printf("UI reloaded due to change in %s\n", e.Name)
					if err := devBuilder.BuildUI(); err != nil {
						log.Println("error during rebuild:", err)
					}
					rebuilt <- devtools.ReloadUI
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}
				log.Println("error:", err)
			}
		}
	}()

	roots, err := devBuilder.WatchedFiles()
	for _, root := range roots {
		if err := watcher.Add(root); err != nil {
			log.Fatal(err)
		}
		if err := filepath.Walk(root, func(p string, info fs.FileInfo, err error) error {
			if p == root {
				return nil
			}
			if !info.IsDir() {
				return nil
			}
			return watcher.Add(p)
		}); err != nil {
			log.Fatal(err)
		}
	}

	server, err := devtools.NewServer(gameRoot, manifest, *port)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Running dev builder on port %d at game root %s\n", *port, gameRoot)
	// Block main goroutine forever.
	go func() {
		for i := range rebuilt {
			server.Reload(i)
		}
	}()
	if err := server.Serve(); err != nil {
		log.Fatal(err)
	}
}
