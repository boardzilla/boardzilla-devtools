package main

import (
	"bytes"
	"crypto/sha256"
	"embed"
	"encoding/base64"
	"encoding/json"
	"errors"
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
	"strconv"
	"strings"
	"sync"
	"time"

	devtools "github.com/boardzilla/boardzilla-devtools"
	"github.com/erikgeiser/promptkit/textinput"
	"github.com/gookit/color"
	"github.com/rjeczalik/notify"
	"github.com/tidwall/gjson"
	"golang.org/x/mod/semver"
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

type userGameVersion struct {
	ID           uint64 `json:"id"`
	Name         string `json:"name"`
	FriendlyName string `json:"friendlyName"`
	Description  string `json:"description"`
	ImagePath    string `json:"imagePath"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
	Version      string `json:"version"`
	ReleaseNotes string `json:"releaseNotes"`
	State        string `json:"state"`
	GitSha       string `json:"gitSha"`
}

type userGame struct {
	Name              string  `json:"name"`
	LatestPublishedID *uint64 `json:"latestPublishedID"`
	LatestSubmittedID *uint64 `json:"latestSubmittedID"`
	CreatedAt         string  `json:"createdAt"`
	LatestPublished   *userGameVersion
	LatestSubmitted   *userGameVersion
}

var gameNotFound = errors.New("no game found")

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
	root      string
}

func newBz() *bz {
	serverURL := os.Getenv("SERVER_URL")
	if serverURL == "" {
		serverURL = "https://www.boardzilla.io"
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

func (b *bz) info() error {
	infoCmd := flag.NewFlagSet("info", flag.ExitOnError)
	root := infoCmd.String("root", "", "game root")
	if err := infoCmd.Parse(os.Args[2:]); err != nil {
		return err
	}

	if *root == "" {
		fmt.Println("Requires -root <game root>")
		return fmt.Errorf("no root specified")
	}
	b.root = *root
	name, err := b.getGameName()
	if err != nil {
		return err
	}
	gi, err := b.getInfo(name)
	if err != nil {
		if err == gameNotFound {
			fmt.Printf("No game exists for %s!\n\nBe the first to claim it by submitting a game here", name)
			return nil
		}
		return err
	}

	color.Printf("\nGame <fg=cyan;op=bold>%s</>\n\nCreated at %s\n\n", gi.Name, gi.CreatedAt)
	if gi.LatestPublished != nil {
		color.Printf("Published version <cyan>%s</> id <cyan>%d</>\n", gi.LatestPublished.Version, gi.LatestPublished.ID)
		color.Printf("Name: <bold>%s</>\n", gi.LatestPublished.Name)
		color.Printf("Friendly name: <bold>%s</>\n", gi.LatestPublished.FriendlyName)
		color.Printf("Git sha: <bold>%s</>\n", gi.LatestPublished.GitSha)
		color.Printf("Description:\n\n<bold>%s</>\n\n", gi.LatestPublished.Description)
		color.Printf("Release notes:\n\n<bold>%s</>\n\n", gi.LatestPublished.ReleaseNotes)
	} else {
		color.Grayln("No currently published game\n")
	}

	if gi.LatestSubmitted != nil {
		color.Printf("Submitted version <cyan>%s</> id <cyan>%d</>\n", gi.LatestSubmitted.Version, gi.LatestSubmitted.ID)
		color.Printf("Name: <bold>%s</>\n", gi.LatestSubmitted.Name)
		color.Printf("Friendly name: <bold>%s</>\n", gi.LatestSubmitted.FriendlyName)
		color.Printf("Git sha: <bold>%s</>\n", gi.LatestSubmitted.GitSha)
		color.Printf("Description:\n\n<bold>%s</>\n\n", gi.LatestSubmitted.Description)
		color.Printf("Release notes:\n\n<bold>%s</>\n\n", gi.LatestSubmitted.ReleaseNotes)
	} else {
		color.Grayln("No currently submitted game\n")
	}
	url := fmt.Sprintf("%s/home/games/%s", b.serverURL, url.PathEscape(name))
	color.Printf("Visit <bold>%s</> for more information\n", url)

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
		return err
	}
	if gameRoot == "" {
		return fmt.Errorf("Requires -root <game root>")
	}
	b.root = gameRoot
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
	color.Printf("Running dev builder on port <bold>%d</> at game root <bold>%s</>\n", *port, gameRoot)
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
	color.Printf("🦖 Ready on <bold>:%d</>\n", *port)
	if err := server.Serve(); err != nil {
		log.Fatal(err)
	}
	return nil
}

func (b *bz) getGameName() (string, error) {
	packageJSONPath := path.Join(b.root, "package.json")
	_, err := os.Stat(packageJSONPath)
	if err != nil {
		return "", err
	}
	packageJSONBytes, err := os.ReadFile(packageJSONPath) // #nosec G304
	if err != nil {
		return "", err
	}
	nameResult := gjson.Get(string(packageJSONBytes), "name")
	if !nameResult.Exists() {
		return "", fmt.Errorf("cannot get current name from package.json")
	}
	return nameResult.Str, nil
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
			color.Printf(`
<error>🚫 Cannot login with this username/password.</>

If you do not currently have an account, please create one by going to <cyan>%s/register</> and signing up
`, b.serverURL)
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
	noGitOps := submitCmd.Bool("no-git", false, "no git ops")
	noCleanCheck := submitCmd.Bool("no-clean-check", false, "no clean check")

	if err := submitCmd.Parse(os.Args[2:]); err != nil {
		return err
	}

	if *root == "" {
		color.Redln("Requires -root <game root>")
		return fmt.Errorf("root required")
	}
	b.root = *root

	if !*noCleanCheck {
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
	}

	name, err := b.getGameName()
	if err != nil {
		return err
	}

	// calculate next version
	info, err := b.getInfo(name)
	nextVersion := "v0.0.1"
	if err != nil && err != gameNotFound {
		return err
	}
	if info != nil {
		if info.LatestPublished != nil {
			majorMinor := semver.MajorMinor(info.LatestPublished.Version)
			patchStr := info.LatestPublished.Version[len(majorMinor)+1:]
			patch, err := strconv.ParseUint(patchStr, 10, 64)
			if err != nil {
				return err
			}
			nextVersion = fmt.Sprintf("%s.%d", majorMinor, patch+1)
		} else if info.LatestSubmitted != nil {
			nextVersion = info.LatestSubmitted.Version
		}
	}

	// check with user that its correct
	versionInput := textinput.New("Enter your version:")
	versionInput.InitialValue = nextVersion
	versionInput.Validate = func(s string) error {
		if s == "" {
			return fmt.Errorf("required")
		}
		if !semver.IsValid(s) {
			return fmt.Errorf("expected a valid semver version")
		}

		if info != nil && info.LatestPublished != nil {
			if semver.Compare(s, info.LatestPublished.Version) != 1 {
				return fmt.Errorf("expected version to be higher than %s", info.LatestPublished.Version)
			}
		}
		return nil
	}
	versionInput.Template += `
		{{- if .ValidationError -}}
			{{- print " " (Foreground "1" .ValidationError.Error) -}}
		{{- end -}}`

	version, err := versionInput.RunPrompt()
	if err != nil {
		return err
	}

	// submit game
	gitShaOut, err := b.sh("git", "rev-parse", "HEAD")
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
	mpw := multipart.NewWriter(pipeWriter)

	gw := newGameWriter(b.serverURL, name, mpw, *root)
	go func() {
		if err := gw.addFile("game.js", *root, manifest.Game.Root, manifest.Game.OutputFile); err != nil {
			panic(err)
		}
		if err := gw.addDir("ui", *root, manifest.UI.Root, manifest.UI.OutputDirectory); err != nil {
			panic(err)
		}
		if err := mpw.Close(); err != nil {
			panic(err)
		}
		if err := pipeWriter.Close(); err != nil {
			panic(err)
		}
	}()

	req, err := http.NewRequest(http.MethodPost, fmt.Sprintf("%s/api/me/games/%s/%s/submit?sha=%s&min=%d&max=%d", b.serverURL, url.PathEscape(name), version, gitSha, manifest.MinimumPlayers, manifest.MaximumPlayers), pipeReader)
	if err != nil {
		return err
	}
	req.Header.Add("Content-type", mpw.FormDataContentType())
	req.Header.Add("Cookie", string(auth))
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	if err != nil {
		return err
	}
	switch res.StatusCode {
	case 200:
		now := time.Now()
		versionTag := fmt.Sprintf("%s-%s-%02d-%02d-%02d", version, now.Format(time.DateOnly), now.Hour(), now.Minute(), now.Second())
		color.Printf("🎉🎉🎉 Game <green>%s</> submitted as version <green>%s</> with git tag <gray>%s</>\n\n", name, version, versionTag)
		var submitResponse struct {
			ID uint64 `json:"id"`
		}
		defer res.Body.Close()
		if err := json.NewDecoder(res.Body).Decode(&submitResponse); err != nil {
			return err
		}
		if !*noGitOps {
			// construct a tag based on that
			// if successful, add git tag
			// push git tag
			color.Printf("Adding git tag for <green>%s</>\n", versionTag)
			if out, err := b.sh("git", "tag", "-a", versionTag, "-m", fmt.Sprintf("Bump to %s", versionTag)); err != nil {
				return fmt.Errorf("error adding tag: %w -- %s", err, out)
			}
		}
		url := fmt.Sprintf("%s/home/games/%s/%d", b.serverURL, url.PathEscape(name), submitResponse.ID)
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
	if strings.HasPrefix(target, "ui/") {
		assetTarget, _ := strings.CutPrefix(target, "ui/")
		digest := sha256.Sum256(f)
		req, err := http.NewRequest(http.MethodHead, fmt.Sprintf("%s/api/assets/%s/%s", gw.serverURL, url.PathEscape(gw.name), assetTarget), nil)
		if err != nil {
			return err
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			return err
		}
		if res.StatusCode == 204 {
			parts := strings.SplitN(res.Header.Get("Digest"), "=", 2)
			serverDigest, err := base64.RawURLEncoding.DecodeString(parts[1])
			if err != nil {
				return err
			}
			if bytes.Equal(serverDigest, digest[:]) {
				color.Println(", <yellow>skipping</>")
				return nil
			}
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

func (b *bz) sh(cmd string, rest ...string) ([]byte, error) {
	ex := exec.Command(cmd, rest...)
	ex.Dir = b.root
	return ex.CombinedOutput()
}

func (b *bz) doGetReq(url string) (*http.Response, error) {
	auth, err := b.getAuth()
	if err != nil {
		return nil, fmt.Errorf("unable to authenticate: %w", err)
	}

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Add("cookie", string(auth))
	return http.DefaultClient.Do(req)
}

func (b *bz) getInfo(name string) (*userGame, error) {
	res, err := b.doGetReq(fmt.Sprintf("%s/api/me/games/%s", b.serverURL, url.PathEscape(name)))
	if err != nil {
		return nil, err
	}

	gameInfo := &userGame{}

	switch res.StatusCode {
	case http.StatusNotFound:
		return nil, gameNotFound
	case http.StatusOK:
		if err := json.NewDecoder(res.Body).Decode(&gameInfo); err != nil {
			return nil, err
		}

		if gameInfo.LatestPublishedID != nil {
			info := &userGameVersion{}
			res, err := b.doGetReq(fmt.Sprintf("%s/api/me/games/%s/%d", b.serverURL, url.PathEscape(name), *gameInfo.LatestPublishedID))
			if err != nil {
				return nil, err
			}
			defer res.Body.Close()
			if err := json.NewDecoder(res.Body).Decode(info); err != nil {
				return nil, err
			}
			gameInfo.LatestPublished = info
		}
		if gameInfo.LatestSubmittedID != nil {
			info := &userGameVersion{}
			res, err := b.doGetReq(fmt.Sprintf("%s/api/me/games/%s/%d", b.serverURL, url.PathEscape(name), *gameInfo.LatestSubmittedID))
			if err != nil {
				return nil, err
			}
			defer res.Body.Close()
			if err := json.NewDecoder(res.Body).Decode(info); err != nil {
				return nil, err
			}
		}
	}

	return gameInfo, nil
}
