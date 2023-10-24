package main

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strings"
	"syscall"

	devtools "github.com/boardzilla/boardzilla-devtools"
	"github.com/fsnotify/fsnotify"
	"golang.org/x/term"
)

func main() {
	if err := runBZ(); err != nil {
		panic(err)
	}
}

type buildError struct {
	Type int
	Out  string
	Err  string
}

func runBZ() error {
	serverURL := os.Getenv("SERVER_URL")
	if serverURL == "" {
		serverURL = "https://boardzilla.io/api"
	}

	if len(os.Args) == 1 {
		fmt.Println("usage: bz [command]")
		fmt.Println("")
		fmt.Println("run -root <game root>                          Run the devtools for a game")
		fmt.Println("info -root <game root>                         Get info about the game at root")
		fmt.Println("register                                       Register a user for publishing a game")
		fmt.Println("publish -root <game root> -version <version>   Publish a game")
		fmt.Println("")
		os.Exit(1)
	}

	command := os.Args[1]

	switch command {
	case "run":
		runCmd := flag.NewFlagSet("run", flag.ExitOnError)
		root := runCmd.String("root", "", "game root")
		port := runCmd.Int("port", 8080, "port for server")
		if err := runCmd.Parse(os.Args[2:]); err != nil {
			return err
		}

		gameRoot := *root
		if gameRoot == "" {
			fmt.Println("Requires -root <game root>")
			os.Exit(1)
		}

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
		errors := make(chan *buildError)

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
					for _, p := range manifest.UI.WatchPaths {
						r, err := filepath.Rel(path.Join(gameRoot, p), e.Name)
						if err != nil {
							log.Fatal(err)
						}
						if !strings.HasPrefix(r, "..") {
							if outbuf, errbuf, err := devBuilder.BuildUI(); err != nil {
								log.Println("error during rebuild:", err)
								errors <- &buildError{devtools.UI, string(outbuf), string(errbuf)}
								continue
							}
							log.Printf("UI reloaded due to change in %s\n", e.Name)
							rebuilt <- devtools.UI
							break
						}
					}

					for _, p := range manifest.Game.WatchPaths {
						r, err := filepath.Rel(path.Join(gameRoot, p), e.Name)
						if err != nil {
							log.Fatal(err)
						}
						if !strings.HasPrefix(r, "..") {
							if outbuf, errbuf, err := devBuilder.BuildGame(); err != nil {
								log.Println("error during rebuild:", err)
								errors <- &buildError{devtools.UI, string(outbuf), string(errbuf)}
								continue
							}
							log.Printf("Game reloaded due to change in %s\n", e.Name)
							rebuilt <- devtools.Game
							break
						}
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
		if err != nil {
			log.Fatal(err)
		}
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
			for {
				select {
				case i := <-rebuilt:
					server.Reload(i)
				case e := <-errors:
					server.BuildError(e.Type, e.Out, e.Err)
				}
			}
		}()
		fmt.Printf("Ready on :%d ✏️✏️✏️\n", *port)
		if err := server.Serve(); err != nil {
			log.Fatal(err)
		}
	case "info":
		infoCmd := flag.NewFlagSet("info", flag.ExitOnError)
		root := infoCmd.String("root", "", "game root")
		if err := infoCmd.Parse(os.Args[2:]); err != nil {
			return err
		}

		if *root == "" {
			fmt.Println("Requires -root <game root>")
			os.Exit(1)
		}

		builder, err := devtools.NewBuilder(*root)
		if err != nil {
			return err
		}
		manifest, err := builder.Manifest()
		if err != nil {
			return err
		}
		res, err := http.Get(fmt.Sprintf("%s/games/%s", serverURL, url.PathEscape(manifest.Name)))
		if err != nil {
			return err
		}

		switch res.StatusCode {
		case http.StatusNotFound:
			fmt.Printf("No game exists for %s!\n\nBe the first to claim it by publishing a game here", manifest.Name)
		case http.StatusOK:
			var gameInfo struct {
				LatestVersion string `json:"latest_version"`
			}
			if err := json.NewDecoder(res.Body).Decode(&gameInfo); err != nil {
				return err
			}

			fmt.Printf("%s\n\nLatest version is %s\n", manifest.Name, gameInfo.LatestVersion)
		}

	case "register":
		var registerReq struct {
			Email    string `json:"email"`
			Name     string `json:"name"`
			Password string `json:"password"`
		}
		reader := bufio.NewReader(os.Stdin)

		fmt.Print("Enter Email: ")
		email, err := reader.ReadString('\n')
		if err != nil {
			return err
		}

		name, password, err := credentials()
		if err != nil {
			return err
		}
		registerReq.Name = name
		registerReq.Password = password
		registerReq.Email = email
		reqData, err := json.Marshal(registerReq)
		if err != nil {
			return err
		}
		res, err := http.Post(fmt.Sprintf("%s/users", serverURL), "application/json", bytes.NewReader(reqData))
		if err != nil {
			return err
		}
		if res.StatusCode == 200 {
			fmt.Printf("ok!")
		} else {
			fmt.Printf("nope! %d", res.StatusCode)
		}
	case "publish":
		infoCmd := flag.NewFlagSet("info", flag.ExitOnError)
		root := infoCmd.String("root", "", "game root")
		version := infoCmd.String("version", "", "version")
		if err := infoCmd.Parse(os.Args[2:]); err != nil {
			return err
		}

		if *root == "" {
			fmt.Println("Requires -root <game root>")
			os.Exit(1)
		}

		if *version == "" {
			fmt.Println("Requires -version <version>")
			os.Exit(1)
		}

		builder, err := devtools.NewBuilder(*root)
		if err != nil {
			return fmt.Errorf("new builder: %w", err)
		}
		manifest, err := builder.Manifest()
		if err != nil {
			return fmt.Errorf("manifest: %w", err)
		}
		home, err := os.UserHomeDir()
		if err != nil {
			return err
		}
		var auth []byte
		authPath := path.Join(home, ".bzauth")
		if _, err := os.Stat(authPath); err != nil {
			if !os.IsNotExist(err) {
				return err
			}

			var loginReq struct {
				Name     string `json:"name"`
				Password string `json:"password"`
			}
			name, password, err := credentials()
			if err != nil {
				return err
			}
			loginReq.Name = name
			loginReq.Password = password
			reqData, err := json.Marshal(loginReq)
			if err != nil {
				return err
			}

			res, err := http.Post(fmt.Sprintf("%s/login", serverURL), "application/json", bytes.NewReader(reqData))
			if err != nil {
				return err
			}
			switch res.StatusCode {
			case 204:
				if res.Header.Get("set-cookie") == "" {
					return fmt.Errorf("expected cookie in response")
				}
				auth = []byte(res.Header.Get("set-cookie"))
				fmt.Printf("cookie! %s\n", auth)
				if err := os.WriteFile(authPath, []byte(auth), 0400); err != nil {
					return err
				}
			default:
				panic("didn't expect this!")
			}
		} else {
			auth, err = os.ReadFile(filepath.Clean(authPath))
			if err != nil {
				return err
			}
		}

		fmt.Printf("Publishing game at %s\n", *root)
		fmt.Printf("Cleaning\n")
		if err := builder.Clean(); err != nil {
			return err
		}
		fmt.Printf("Building\n")
		if err := builder.BuildProd(); err != nil {
			return err
		}

		pipeReader, pipeWriter := io.Pipe()
		errs := make(chan error)
		mpw := multipart.NewWriter(pipeWriter)
		gw := newGameWriter(serverURL, manifest.Name, mpw, *root)
		go func() {
			if err := gw.addFile("game.v1.json", *root, "game.v1.json"); err != nil {
				errs <- err
				return
			}
			if err := gw.addFile(manifest.Image, *root, manifest.Image); err != nil {
				errs <- err
				return
			}
			if err := gw.addFile("game.js", *root, manifest.Game.Root, manifest.Game.OutputFile); err != nil {
				errs <- err
				return
			}
			if err := gw.addDir("ui", *root, manifest.UI.Root, manifest.UI.OutputDirectory); err != nil {
				errs <- err
				return
			}
			if err := mpw.Close(); err != nil {
				errs <- err
				return
			}
			errs <- pipeWriter.Close()
		}()
		req, err := http.NewRequest(http.MethodPost, fmt.Sprintf("%s/api/games/%s/%s", serverURL, url.PathEscape(manifest.Name), *version), pipeReader)
		if err != nil {
			return err
		}
		req.Header.Add("Content-type", mpw.FormDataContentType())
		req.Header.Add("Cookie", string(auth))
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			return err
		}
		if err := <-errs; err != nil {
			return err
		}
		if err != nil {
			return err
		}
		switch res.StatusCode {
		case 200:
			fmt.Printf("Game %s submitted as version %s!\n\n", manifest.Name, *version)
			defer res.Body.Close()
			var publishResponse struct {
				Token string `json:"token"`
			}
			if err := json.NewDecoder(res.Body).Decode(&publishResponse); err != nil {
				fmt.Printf("Error %#v\n", err)
			}
			url := fmt.Sprintf("%s/g/%s/%s/t/%s", serverURL, url.PathEscape(manifest.Name), url.PathEscape(*version), url.PathEscape(publishResponse.Token))
			fmt.Printf("Opening %s...\n\n", url)
			return exec.Command("open", url).Start() // #nosec G204
		default:
			fmt.Printf("res was %#v\n", res)
			panic("no!")
		}

	}

	return nil
}

type gameWriter struct {
	mpw       *multipart.Writer
	root      string
	name      string
	serverURL string
}

func newGameWriter(serverURL, name string, mpw *multipart.Writer, root string) *gameWriter {
	return &gameWriter{
		serverURL: serverURL,
		name:      name,
		mpw:       mpw,
		root:      root,
	}
}

func (gw *gameWriter) addFile(target string, src ...string) error {
	assetPath := path.Join(src...)
	fmt.Printf("adding file %s from %s\n", target, assetPath)
	f, err := os.ReadFile(filepath.Clean(assetPath))
	if err != nil {
		return err
	}
	digest := sha256.Sum256(f)
	req, err := http.NewRequest(http.MethodHead, fmt.Sprintf("%s/api/assets/%s/%s", gw.serverURL, url.PathEscape(gw.name), assetPath), nil)
	if err != nil {
		return err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	if res.StatusCode == 204 {
		parts := strings.SplitN(req.Header.Get("Digest"), "=", 2)
		serverDigest, err := base64.RawURLEncoding.DecodeString(parts[1])
		if err != nil {
			return err
		}
		if bytes.Equal(serverDigest, digest[:]) {
			return nil
		}
	}
	writer, err := gw.mpw.CreateFormFile(target, target)
	if err != nil {
		return err
	}
	fmt.Printf("copying... %d\n", len(f))
	if _, err := io.Copy(writer, bytes.NewReader(f)); err != nil {
		return err
	}
	fmt.Printf("done copying...")
	return nil
}

func (gw *gameWriter) addDir(target string, src ...string) error {
	entries, err := os.ReadDir(path.Join(src...))
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.IsDir() {
			fmt.Printf("dir\n")
			if err := gw.addDir(path.Join(target, e.Name()), path.Join(append(src, e.Name())...)); err != nil {
				return err
			}
			continue
		}
		fmt.Printf("file %s\n", e.Name())
		if err := gw.addFile(path.Join(target, e.Name()), path.Join(append(src, e.Name())...)); err != nil {
			return err
		}
	}
	return nil
}

func credentials() (string, string, error) {
	reader := bufio.NewReader(os.Stdin)

	fmt.Print("Enter Username: ")
	username, err := reader.ReadString('\n')
	if err != nil {
		return "", "", err
	}

	fmt.Print("Enter Password: ")
	bytePassword, err := term.ReadPassword(int(syscall.Stdin))
	if err != nil {
		return "", "", err
	}

	password := string(bytePassword)
	return strings.TrimSpace(username), strings.TrimSpace(password), nil
}
