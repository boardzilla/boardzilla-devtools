package main

import (
	"bytes"
	"crypto/sha256"
	"embed"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/erikgeiser/promptkit/textinput"
	"github.com/gookit/color"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"

	devtools "github.com/boardzilla/boardzilla-devtools"
	"github.com/rjeczalik/notify"
)

//go:embed package.json
var packageFS embed.FS

const debounceDurationMS = 500

func printHelp() {
	fmt.Println("usage: bz [command]")
	fmt.Println("")
	fmt.Println("run -root <game root>                          Run the devtools for a game")
	fmt.Println("info -root <game root>                         Get info about the game at root")
	fmt.Println("submit -root <game root> -version <version>    Submit a game")
	fmt.Println("version                                        Shows version installed")
	fmt.Println("")
}

func main() {
	bzCli := newBz()
	if err := bzCli.exec(); err != nil {
		color.Grayf("error: %s\n", err.Error())
		os.Exit(1)
	}
}

type notifier struct {
	out      func()
	notified bool
	lock     sync.Mutex
}

func (n *notifier) notify() {
	n.lock.Lock()
	defer n.lock.Unlock()
	if !n.notified {
		n.notified = true
		go func() {
			time.Sleep(debounceDurationMS * time.Millisecond)
			n.out()
			n.lock.Lock()
			n.notified = false
			defer n.lock.Unlock()
		}()
	}
}

type bz struct {
	serverURL string
}

func newBz() *bz {
	serverURL := os.Getenv("SERVER_URL")
	if serverURL == "" {
		serverURL = "https://new.boardzilla.io"
	}
	return &bz{
		serverURL: serverURL,
	}
}

func (b *bz) exec() error {
	if len(os.Args) == 1 {
		printHelp()
		os.Exit(1)
	}

	command := os.Args[1]

	switch command {
	case "version":
		return b.version()
	case "run":
		return b.run()
	case "info":
		return b.info()
	case "submit":
		return b.submit()
	default:
		fmt.Printf("Unrecognized command: %s\n\n", command)
		printHelp()
		os.Exit(1)
	}

	return nil
}

func (b *bz) version() error {
	f, err := packageFS.ReadFile("package.json")
	if err != nil {
		return err
	}
	data := make(map[string]any)
	if err := json.Unmarshal(f, &data); err != nil {
		return err
	}
	fmt.Printf("Version is %s\n", data["version"].(string))
	return nil
}

func (b *bz) run() error {
	runCmd := flag.NewFlagSet("run", flag.ExitOnError)
	root := runCmd.String("root", "", "game root")
	port := runCmd.Int("port", 8080, "port for server")
	if err := runCmd.Parse(os.Args[2:]); err != nil {
		return err
	}

	gameRoot, err := filepath.Abs(*root)
	if err != nil {
		log.Fatalf("error: %#v", err)
	}
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

	rebuilt := make(chan int, 10)

	uiNotifier := &notifier{out: func() {
		rebuilt <- devtools.UI
	}, notified: false}
	gameNotifier := &notifier{out: func() {
		rebuilt <- devtools.Game
	}, notified: false}

	go func() {
		if err := devBuilder.Build(); err != nil {
			log.Println("error during build:", err)
		}

		events := make(chan notify.EventInfo, 100)
		roots, err := devBuilder.WatchedFiles()
		if err != nil {
			log.Fatal(err)
		}
		for _, root := range roots {
			info, err := os.Stat(root)
			if err != nil {
				log.Fatal(err)
			}
			if info.IsDir() {
				if err := notify.Watch(path.Join(root, "..."), events, notify.All); err != nil {
					log.Fatal(err)
				}
			} else {
				if err := notify.Watch(root, events, notify.All); err != nil {
					log.Fatal(err)
				}
			}
		}

		defer notify.Stop(events)

		// Block until an event is received.
		for e := range events {
			if e.Event() != notify.Write {
				continue
			}
			for _, p := range manifest.UI.WatchPaths {
				p, err := filepath.EvalSymlinks(path.Join(gameRoot, p))
				if err != nil {
					log.Fatal(err)
				}
				r, err := filepath.Rel(p, e.Path())
				if err != nil {
					log.Fatal(err)
				}
				if !strings.HasPrefix(r, "..") {
					uiNotifier.notify()
					break
				}
			}

			for _, p := range manifest.Game.WatchPaths {
				p, err := filepath.EvalSymlinks(path.Join(gameRoot, p))
				if err != nil {
					log.Fatal(err)
				}
				r, err := filepath.Rel(p, e.Path())
				if err != nil {
					log.Fatal(err)
				}
				if !strings.HasPrefix(r, "..") {
					gameNotifier.notify()
					break
				}
			}
		}
	}()

	server, err := devtools.NewServer(gameRoot, manifest, *port)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Running dev builder on port %d at game root %s\n", *port, gameRoot)
	go func() {
		for i := range rebuilt {
			switch i {
			case devtools.UI:
				if outbuf, errbuf, err := devBuilder.BuildUI(); err != nil {
					log.Println("error during rebuild:", err)
					server.BuildError(devtools.UI, string(outbuf), string(errbuf))
					continue
				}
				log.Printf("UI reloaded due to change\n")
			case devtools.Game:
				if outbuf, errbuf, err := devBuilder.BuildGame(); err != nil {
					log.Println("error during rebuild:", err)
					server.BuildError(devtools.Game, string(outbuf), string(errbuf))
					continue
				}
				log.Printf("Game reloaded due to change\n")

			}
			server.Reload(i)
		}
	}()
	// Block main goroutine forever.
	fmt.Printf("Ready on :%d ✏️✏️✏️\n", *port)
	if err := server.Serve(); err != nil {
		log.Fatal(err)
	}
	return nil
}

func (b *bz) info() error {
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
	res, err := http.Get(fmt.Sprintf("%s/games/%s", b.serverURL, url.PathEscape(manifest.Name)))
	if err != nil {
		return err
	}

	switch res.StatusCode {
	case http.StatusNotFound:
		fmt.Printf("No game exists for %s!\n\nBe the first to claim it by submitting a game here", manifest.Name)
	case http.StatusOK:
		var gameInfo struct {
			LatestVersion string `json:"latest_version"`
		}
		if err := json.NewDecoder(res.Body).Decode(&gameInfo); err != nil {
			return err
		}

		fmt.Printf("%s\n\nLatest version is %s\n", manifest.Name, gameInfo.LatestVersion)
	}
	return nil
}

func (b *bz) getAuth() ([]byte, error) {
	var auth []byte
	home, err := os.UserHomeDir()
	if err != nil {
		return auth, err
	}
	parsedServerURL, err := url.Parse(b.serverURL)
	if err != nil {
		return auth, err
	}
	authPath := path.Join(home, fmt.Sprintf(".bzauth-%s", parsedServerURL.Host))
	if _, err := os.Stat(authPath); err != nil {
		// if auth exists, try it, if it doesn't work, delete and try once more
		if !os.IsNotExist(err) {
			return nil, err
		}

		var loginReq struct {
			Name     string `json:"name"`
			Password string `json:"password"`
		}
		name, password, err := credentials()
		if err != nil {
			return auth, err
		}
		loginReq.Name = name
		loginReq.Password = password
		reqData, err := json.Marshal(loginReq)
		if err != nil {
			return auth, err
		}

		res, err := http.Post(fmt.Sprintf("%s/api/login", b.serverURL), "application/json", bytes.NewReader(reqData))
		if err != nil {
			return auth, err
		}
		switch res.StatusCode {
		case 204:
			if res.Header.Get("set-cookie") == "" {
				return auth, fmt.Errorf("expected cookie in response")
			}
			auth = []byte(res.Header.Get("set-cookie"))
			if err := os.WriteFile(authPath, []byte(auth), 0400); err != nil {
				return auth, err
			}
		case 401:
			color.Println(`
<error>🚫 Cannot login with this username/password.</>

If you do not currently have an account, please create one by going to <cyan>https://new.boardzilla.io/register</> and signing up`)
			return auth, fmt.Errorf("unauthorized")
		default:
			body, _ := io.ReadAll(res.Body)
			defer res.Body.Close()
			return auth, fmt.Errorf("authentication sent status: %d body; %s", res.StatusCode, body)
		}
	} else {
		auth, err = os.ReadFile(filepath.Clean(authPath))
		if err != nil {
			return auth, err
		}
	}
	ok, err := b.testAuth(auth)
	if err != nil {
		return nil, err
	}
	if !ok {
		if err := os.Remove(authPath); err != nil {
			return nil, err
		}
		return b.getAuth()
	}
	return auth, nil
}

func (b *bz) testAuth(auth []byte) (bool, error) {
	req, err := http.NewRequest(http.MethodGet, fmt.Sprintf("%s/api/me/user", b.serverURL), nil)
	if err != nil {
		return false, err
	}
	req.Header.Add("Cookie", string(auth))
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return false, err
	}
	return res.StatusCode == 200, nil
}

func (b *bz) submit() error {
	submitCmd := flag.NewFlagSet("submit", flag.ExitOnError)
	root := submitCmd.String("root", "", "game root")
	version := submitCmd.String("version", "", "version")
	interactive := submitCmd.Bool("interactive", false, "interactive")

	if err := submitCmd.Parse(os.Args[2:]); err != nil {
		return err
	}

	if *root == "" {
		color.Redln("Requires -root <game root>")
		return fmt.Errorf("root required")
	}

	// check that git is clean
	statusCmd := exec.Command("git", "status", "--porcelain")
	statusCmd.Dir = *root
	if out, err := statusCmd.Output(); err != nil {
		color.Redln("⛔️ Root directory must be a git repo\n")
		return fmt.Errorf("error checking git status: %w", err)
	} else if len(out) != 0 {
		color.Redln("⛔️ Submit aborted due to uncommitted changes. Please ensure everything is committed, and submit again.\n")
		return fmt.Errorf("uncommitted changes")
	}

	packageJSONPath := path.Join(*root, "package.json")
	stat, err := os.Stat(packageJSONPath)
	if err != nil {
		return err
	}
	packageJSONBytes, err := os.ReadFile(packageJSONPath)
	if err != nil {
		return err
	}
	currentVersion := gjson.Get(string(packageJSONBytes), "version")
	if !currentVersion.Exists() {
		return fmt.Errorf("cannot get current version from package.json")
	}
	differentVersion := false
	if *interactive {
		versionInput := textinput.New("Enter your version:")
		versionInput.Placeholder = currentVersion.Str
		versionInput.Validate = func(s string) error {
			if s == "" {
				return fmt.Errorf("required")
			}

			return nil
		}
		versionInput.Template += `
		{{- if .ValidationError -}}
			{{- print " " (Foreground "1" .ValidationError.Error) -}}
		{{- end -}}`

		newVersion, err := versionInput.RunPrompt()
		if err != nil {
			return err
		}
		newPackageJSON, err := sjson.Set(string(packageJSONBytes), "version", newVersion)
		if err != nil {
			return err
		}
		if err := os.WriteFile(path.Join(*root, "package.json"), []byte(newPackageJSON), stat.Mode()); err != nil {
			return err
		}
		differentVersion = currentVersion.Str != newVersion
		version = &newVersion
	}
	successful := false
	versionTag := fmt.Sprintf("v%s", *version)
	defer func() {
		if successful {
			return
		}
		if differentVersion {
			if out, err := sh(*root, "git", "tag", "-d", versionTag); err != nil {
				color.Redf("error deleting tag: %s -- %s\n", err.Error(), out)
			}
		}
		if out, err := sh(*root, "git", "reset", "--hard"); err != nil {
			color.Redf("error resetting: %s -- %s\n", err.Error(), out)
		}
	}()
	if version == nil || *version == "" {
		return fmt.Errorf("Requires -version <version>")
	}

	gitShaOut, err := sh(*root, "git", "rev-parse", "HEAD")
	if err != nil {
		return fmt.Errorf("error getting sha: %w -- %s", err, gitShaOut)
	}
	gitSha := strings.TrimSpace(string(gitShaOut))
	builder, err := devtools.NewBuilder(*root)
	if err != nil {
		return fmt.Errorf("new builder: %w", err)
	}
	manifest, err := builder.Manifest()
	if err != nil {
		return fmt.Errorf("manifest: %w", err)
	}

	auth, err := b.getAuth()
	if err != nil {
		return fmt.Errorf("unable to authenticate: %w", err)
	}

	color.Printf("Submitting game at <cyan>%s</>\n", *root)
	fmt.Print("🧹 Cleaning\n")
	if err := builder.Clean(); err != nil {
		return err
	}
	fmt.Println("✅ Done cleaning")
	fmt.Printf("🛠️ Building")
	if err := builder.BuildProd(); err != nil {
		return err
	}
	fmt.Println("✅ Done building")

	pipeReader, pipeWriter := io.Pipe()
	errs := make(chan error)
	mpw := multipart.NewWriter(pipeWriter)
	gw := newGameWriter(b.serverURL, manifest.Name, mpw, *root)
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
	req, err := http.NewRequest(http.MethodPost, fmt.Sprintf("%s/api/me/games/%s/%s/submit?sha=%s", b.serverURL, url.PathEscape(manifest.Name), versionTag, gitSha), pipeReader)
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
		color.Printf("🎉🎉🎉 Game <green>%s</> submitted as version <green>%s</>\n\n", manifest.Name, versionTag)
		successful = true

		var submitResponse struct {
			ID uint64 `json:"id"`
		}
		defer res.Body.Close()
		if err := json.NewDecoder(res.Body).Decode(&submitResponse); err != nil {
			return err
		}
		if differentVersion {
			color.Printf("Committing package.json with new version <green>%s</>\n", versionTag)
			if out, err := sh(*root, "git", "add", "package.json"); err != nil {
				return fmt.Errorf("error adding package.json: %w -- %s", err, out)
			}
			if out, err := sh(*root, "git", "commit", "-m", fmt.Sprintf("Bump to %s", versionTag)); err != nil {
				return fmt.Errorf("error committing: %w -- %s", err, out)
			}
			color.Printf("Pushing package.json change\n")
			if out, err := sh(*root, "git", "push"); err != nil {
				return fmt.Errorf("error pushing change: %w -- %s", err, out)
			}
		}
		color.Printf("Adding git tag for <green>%s</>\n", versionTag)
		if out, err := sh(*root, "git", "tag", "-f", "-a", versionTag, "-m", fmt.Sprintf("Bump to %s", versionTag)); err != nil {
			return fmt.Errorf("error adding tag: %w -- %s", err, out)
		}
		color.Printf("Pushing new tag <green>%s</>\n", versionTag)
		if out, err := sh(*root, "git", "push", "--tags"); err != nil {
			return fmt.Errorf("error pushing change: %w -- %s", err, out)
		}

		url := fmt.Sprintf("%s/home/games/%s/%d", b.serverURL, url.PathEscape(manifest.Name), submitResponse.ID)
		fmt.Printf("Opening %s...\n\n", url)
		return exec.Command("open", url).Start() // #nosec G204
	default:
		body, _ := io.ReadAll(res.Body)
		defer res.Body.Close()
		return fmt.Errorf("publishing sent status: %d body; %s", res.StatusCode, body)
	}
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
	color.Printf("Adding file <cyan>%s</> from <cyan>%s</>", target, assetPath)
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
			color.Println(", <yellow>skipping</>")
			return nil
		}
	}
	writer, err := gw.mpw.CreateFormFile(target, target)
	if err != nil {
		return err
	}
	if _, err := io.Copy(writer, bytes.NewReader(f)); err != nil {
		return err
	}
	color.Println(" ✅")
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
	usernameInput := textinput.New("Enter your username:")
	usernameInput.Placeholder = ""
	usernameInput.Validate = func(s string) error {
		if s == "" {
			return fmt.Errorf("required")
		}

		return nil
	}
	usernameInput.Template += `
	{{- if .ValidationError -}}
		{{- print " " (Foreground "1" .ValidationError.Error) -}}
	{{- end -}}`

	username, err := usernameInput.RunPrompt()
	if err != nil {
		return "", "", err
	}

	passwordInput := textinput.New("Enter your password:")
	passwordInput.Placeholder = ""
	passwordInput.Validate = func(s string) error {
		if s == "" {
			return fmt.Errorf("required")
		}

		return nil
	}
	passwordInput.Hidden = true
	passwordInput.Template += `
	{{- if .ValidationError -}}
		{{- print " " (Foreground "1" .ValidationError.Error) -}}
	{{- end -}}`

	password, err := passwordInput.RunPrompt()
	if err != nil {
		return "", "", err
	}

	return username, password, nil
}

func sh(root, cmd string, rest ...string) ([]byte, error) {
	ex := exec.Command(cmd, rest...)
	ex.Dir = root
	return ex.CombinedOutput()
}
