package main

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"runtime/debug"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/bmatcuk/doublestar/v4"
	devtools "github.com/boardzilla/boardzilla-devtools/internal"
	"github.com/erikgeiser/promptkit/selection"
	"github.com/erikgeiser/promptkit/textinput"
	"github.com/gookit/color"
	"github.com/radovskyb/watcher"
	"github.com/stoewer/go-strcase"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
	"golang.org/x/exp/maps"
	"golang.org/x/mod/semver"
)

var (
	version = "dev"
	commit  = "none"
	date    = "unknown"
)

const noInstallOption = "I'll do it myself"
const debounceDurationMS = 500

func validateName(name string) error {
	if len(strings.TrimSpace(name)) == 0 {
		return fmt.Errorf("this value is required")
	}
	return nil
}

func validateShortName(name string) error {
	m, err := regexp.MatchString("^[a-z0-9_-]+$", name)
	if err != nil {
		return err
	}
	if !m {
		return fmt.Errorf("can only contain lowercase letters, digits, _ and -")
	}
	return nil
}

func getTextInput(prompt, placeholder, errorText string, validator func(string) error) (string, error) {
	input := textinput.New(prompt)
	input.InitialValue = placeholder
	input.Validate = validator
	input.Template += `
	{{- if .ValidationError -}}
		{{- print " " (Foreground "1" .ValidationError.Error) -}}
	{{- end -}}`
	s, err := input.RunPrompt()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(s), nil
}

func printHelp() {
	fmt.Println("usage: bz [command]")
	fmt.Println("")
	fmt.Println("run -root <game root>                          Run the devtools for a game")
	fmt.Println("info -root <game root>                         Get info about the game at root")
	fmt.Println("submit -root <game root> -version <version>    Submit a game")
	fmt.Println("new")
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

var errGameNotFound = errors.New("no game found")

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
	case "new":
		return b.new()
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
		if err == errGameNotFound {
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
	version = "dev"
	commit = "none"
	date = "unknown"
	info, ok := debug.ReadBuildInfo()
	if ok {
		fmt.Printf("Installed version: %s\n", info.Main.Version)
	} else {
		fmt.Printf(
			`Version: %s
Commit:  %s
Date     %s`, version, commit, date)
		fmt.Println()
	}
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
		return fmt.Errorf("requires -root <game root>")
	}
	b.root = gameRoot
	devBuilder, err := devtools.NewBuilder(gameRoot)
	if err != nil {
		log.Fatal(err)
	}
	// Add a path.
	manifest, err := devBuilder.Manifest()
	if err != nil {
		log.Fatal(fmt.Errorf("error getting manifest: %w", err))
	}
	server, err := devtools.NewServer(gameRoot, manifest, *port)
	if err != nil {
		log.Fatal(err)
	}

	go func() {
		if stdout, stderr, err := devBuilder.Build(devtools.Dev, devtools.UI|devtools.Game); err != nil {
			log.Println("error during build: %s\n\nout: %s\n\nerr: %s\n", err, stdout, stderr)
		}

		w := watcher.New()
		w.SetMaxEvents(1)
		w.FilterOps(watcher.Rename, watcher.Move, watcher.Create, watcher.Write)

		roots, err := devBuilder.WatchedFiles()
		if err != nil {
			log.Fatalf("error getting roots: %#v", err)
		}
		for _, root := range roots {
			root = filepath.FromSlash(root)
			info, err := os.Stat(root)
			if err != nil {
				log.Fatalf("error stating root: %#v", err)
			}
			if info.IsDir() {
				if err := w.AddRecursive(root); err != nil {
					log.Fatalf("error watching dir %s: %#v", root, err)
				}
			} else {
				if err := w.Add(root); err != nil {
					log.Fatalf("error watching path %s: %#v %s", root, err, err)
				}
			}
		}

		w.AddFilterHook(func(info os.FileInfo, fullPath string) error {
			name := info.Name()
			if info.IsDir() || path.Ext(name) == ".bak" || strings.HasPrefix(name, ".#") || strings.HasPrefix(name, "#") || strings.HasSuffix(name, "~") {
				return watcher.ErrSkip
			}
			return nil
		})

		go func() {
			if err := w.Start(time.Millisecond * 100); err != nil {
				log.Fatalln(err)
			}
		}()

		server.Reload(devtools.UI)
		server.Reload(devtools.Game)

		// Block until an event is received.
		for {
			select {
			case e := <-w.Event:
				var buildType devtools.BuildType
				for _, p := range manifest.UI.WatchPaths {
					p := path.Join(gameRoot, p)
					if err != nil {
						log.Fatal(fmt.Errorf("error watching %s: %w", p, err))
					}
					r, err := filepath.Rel(p, e.Path)
					if err != nil {
						log.Fatal(fmt.Errorf("error rel %s: %w", p, err))
					}
					if !strings.HasPrefix(r, "..") {
						color.Printf("Reloading UI due to changes in <bold>%s</>: <bold>%s</>\n", e.Path, e.Op)
						buildType |= devtools.UI
						break
					}
				}

				for _, p := range manifest.Game.WatchPaths {
					p := path.Join(gameRoot, p)
					if err != nil {
						log.Fatal(fmt.Errorf("error watching %s: %w", p, err))
					}
					r, err := filepath.Rel(p, e.Path)
					if err != nil {
						log.Fatal(fmt.Errorf("error rel %s: %w", p, err))
					}
					if !strings.HasPrefix(r, "..") {
						color.Printf("Reloading Game due to changes in <bold>%s</>: <bold>%s</>\n", e.Path, e.Op)
						buildType |= devtools.Game
						break
					}
				}
				stdout, stderr, err := devBuilder.Build(devtools.Dev, buildType)
				if err != nil {
					server.BuildError(string(stdout), string(stderr))
				}
				if buildType&devtools.Game != 0 {
					server.Reload(devtools.Game)
				}
				if buildType&devtools.UI != 0 {
					server.Reload(devtools.UI)
				}
			case err := <-w.Error:
				log.Fatalln(err)
			case <-w.Closed:
				return
			}
		}
	}()

	color.Printf("Running dev builder on port <bold>%d</> at game root <bold>%s</>\n", *port, gameRoot)

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
	if err != nil && err != errGameNotFound {
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
	if _, _, err := builder.Build(devtools.Prod, devtools.UI|devtools.Game); err != nil {
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

	req, err := http.NewRequest(http.MethodPost, fmt.Sprintf("%s/api/me/games/%s/%s/submit?sha=%s&min=%d&max=%d&default=%d", b.serverURL, url.PathEscape(name), version, gitSha, manifest.MinimumPlayers, manifest.MaximumPlayers, manifest.DefaultPlayers), pipeReader)
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
		if err := gw.postPreloadAssets(auth, submitResponse.ID); err != nil {
			return err
		}

		url := fmt.Sprintf("%s/home/games/%s/%d", b.serverURL, url.PathEscape(name), submitResponse.ID)
		fmt.Printf("Opening %s...\n\n", url)
		// #nosec G204
		return exec.Command("open", url).Start()
	default:
		body, _ := io.ReadAll(res.Body)
		defer res.Body.Close()
		return fmt.Errorf("publishing sent status: %d body; %s", res.StatusCode, body)
	}
}

func (b *bz) new() error {
	name, err := getTextInput("What is the name of your game?", "", "Name is required", validateName)
	if err != nil {
		return err
	}
	shortName, err := getTextInput("What would you like the short name to be?", strcase.KebabCase(name), "Short name is required", validateShortName)
	if err != nil {
		return err
	}
	dirName, err := getTextInput("What would you like the name of the directory to be?", strcase.KebabCase(name), "Directory name is required", validateShortName)
	if err != nil {
		return err
	}
	className, err := getTextInput("What would you like the class name to be?", strcase.UpperCamelCase(name), "Class name is required", validateName)
	if err != nil {
		return err
	}

	repoMap := map[string]string{
		"Simple Token game": "boardzilla-starter-game",
		"Simple Tiles game": "boardzilla-tiles-starter-game",
		"Empty game":        "boardzilla-empty-game",
	}
	repoSelect := selection.New("Which template would you like to use?", maps.Keys(repoMap))
	repo, err := repoSelect.RunPrompt()
	if err != nil {
		return err
	}
	templateName := repoMap[repo]

	installSelect := selection.New("Which template would you like to use?", []string{"yarn", "npm", "pnpm", noInstallOption})
	installer, err := installSelect.RunPrompt()
	if err != nil {
		return err
	}

	releaseURL := fmt.Sprintf("https://github.com/boardzilla/%s/releases/latest/", templateName)
	color.Printf("Getting latest release for <cyan>%s</> from <cyan>%s</>", templateName, releaseURL)

	req, err := http.NewRequest("GET", releaseURL, nil)
	if err != nil {
		return err
	}
	req.Header.Add("Accept", "application/json")
	req.Header.Add("X-GitHub-Api-Version", "2022-11-28")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	body, err := io.ReadAll(resp.Body)
	defer resp.Body.Close()
	if err != nil {
		return err
	}
	tagName := gjson.Get(string(body), "tag_name")
	if !tagName.Exists() {
		return fmt.Errorf("cannot get current name from package.json")
	}
	color.Println(" ✅")
	url := fmt.Sprintf("https://github.com/boardzilla/%s/archive/refs/tags/%s.zip", templateName, tagName.Str)
	color.Printf("Downloading template from <cyan>%s</>", url)

	zipResp, err := http.Get(url) // #nosec G107
	if err != nil {
		return err
	}
	out, err := os.CreateTemp("", "zip-*")
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, zipResp.Body); err != nil {
		return err
	}
	color.Println(" ✅")
	zipFile, err := zip.OpenReader(out.Name())
	if err != nil {
		return err
	}
	prefix := ""
	color.Printf("Extracting to <cyan>%s</>", dirName)
	// Iterate through the files in the archive,
	for k, f := range zipFile.File {
		rc, err := f.Open()
		if err != nil {
			log.Fatalf("impossible to open file n°%d in archine: %s", k, err)
		}
		defer rc.Close()
		// define the new file path
		if prefix == "" {
			prefix = f.Name
		}
		newFilePath := filepath.Join(dirName, strings.TrimPrefix(f.Name, prefix))

		// CASE 1 : we have a directory
		if f.FileInfo().IsDir() {
			// if we have a directory we have to create it
			err = os.MkdirAll(newFilePath, 0750)
			if err != nil {
				log.Fatalf("impossible to MkdirAll: %s", err)
			}
			// we can go to next iteration
			continue
		}

		// CASE 2 : we have a file
		// create new uncompressed file
		uncompressedFile, err := os.Create(newFilePath) // #nosec G304
		if err != nil {
			log.Fatalf("impossible to create uncompressed: %s", err)
		}
		_, err = io.Copy(uncompressedFile, rc) // #nosec G110
		if err != nil {
			log.Fatalf("impossible to copy file n°%d: %s", k, err)
		}
	}
	color.Println(" ✅")

	// munge package.json
	packageJSONPath := filepath.Join(dirName, "package.json")
	color.Printf("Modifying <cyan>%s</>", packageJSONPath)
	packageJSONPathStat, err := os.Stat(packageJSONPath)
	if err != nil {
		return err
	}
	packageJSONBytes, err := os.ReadFile(packageJSONPath) // #nosec G304
	if err != nil {
		return err
	}
	packageJSON, err := sjson.Set(string(packageJSONBytes), "name", shortName)
	if err != nil {
		return err
	}
	packageJSON, err = sjson.Set(packageJSON, "version", "1.0.0")
	if err != nil {
		return err
	}
	if err := os.WriteFile(packageJSONPath, []byte(packageJSON), packageJSONPathStat.Mode().Perm()); err != nil {
		return err
	}
	color.Println(" ✅")

	// munge game.v1.json or game.json
	gameV1Path := filepath.Join(dirName, "game.v1.json")
	gameV1PathStat, err := os.Stat(gameV1Path)
	if err != nil {
		if os.IsNotExist(err) {
			gameV1Path = filepath.Join(dirName, "game.json")
			gameV1PathStat, err = os.Stat(gameV1Path)
			if err != nil {
				return err
			}
		} else {
			return err
		}
	}
	color.Printf("Modifying <cyan>%s</>", gameV1Path)
	gameV1JSONBytes, err := os.ReadFile(gameV1Path) // #nosec G304
	if err != nil {
		return err
	}
	gameV1JSON, err := sjson.Set(string(gameV1JSONBytes), "name", shortName)
	if err != nil {
		return err
	}
	gameV1JSON, err = sjson.Set(gameV1JSON, "friendlyName", name)
	if err != nil {
		return err
	}
	if err := os.WriteFile(gameV1Path, []byte(gameV1JSON), gameV1PathStat.Mode().Perm()); err != nil {
		return err
	}
	color.Println(" ✅")

	// recurively fix any ts/tsx files
	color.Printf("Updating player/game references in <cyan>%s</>", dirName)
	files, err := doublestar.FilepathGlob(filepath.Join(dirName, "**"))
	if err != nil {
		return err
	}
	for _, f := range files {
		ext := filepath.Ext(f)
		if ext != ".tsx" && ext != ".ts" {
			continue
		}
		info, err := os.Stat(f)
		if err != nil {
			return err
		}
		reg, err := regexp.Compile("MyGame(Board|Player)")
		if err != nil {
			return err
		}
		contents, err := os.ReadFile(f) // #nosec G304
		if err != nil {
			return err
		}
		contents = reg.ReplaceAll(contents, []byte(fmt.Sprintf("%s$1", className)))
		if err := os.WriteFile(f, contents, info.Mode().Perm()); err != nil {
			return err
		}
	}
	color.Println(" ✅")

	color.Printf("Updating <cyan>.gitignore</>")
	// move gitignore
	if err := os.Remove(filepath.Join(dirName, ".gitignore")); err != nil {
		return err
	}
	if err := os.Rename(filepath.Join(dirName, "gitignore"), filepath.Join(dirName, ".gitignore")); err != nil {
		return err
	}
	color.Println(" ✅")

	// run installer
	if installer != noInstallOption {
		color.Printf("Running <cyan>%s install</>", installer)
		cmd := exec.Command(installer, "install") // #nosec G204
		cmd.Dir = dirName
		if err := cmd.Run(); err != nil {
			return err
		}
		color.Println(" ✅")
	} else {
		installer = "npm"
	}

	color.Printf("\n🎉 Success!\n\nNow you can go to <cyan>%s</> and run <cyan>%s run dev</> to start developing\n", dirName, installer)

	return nil
}

type preload struct {
	Path string `json:"path"`
	As   string `json:"as"`
}

type gameWriter struct {
	mpw       *multipart.Writer
	root      string
	name      string
	serverURL string
	assets    []*preload
}

func newGameWriter(serverURL, name string, mpw *multipart.Writer, root string) *gameWriter {
	return &gameWriter{
		mpw:       mpw,
		root:      root,
		name:      name,
		serverURL: serverURL,
		assets:    []*preload{},
	}
}

func (gw *gameWriter) addFile(target string, src ...string) error {
	assetPath := path.Join(src...)
	color.Printf("Adding file <cyan>%s</> from <cyan>%s</>", target, assetPath)
	f, err := os.ReadFile(assetPath) // #nosec G304
	if err != nil {
		return err
	}
	if strings.HasPrefix(target, "ui/") {
		assetTarget, _ := strings.CutPrefix(target, "ui/")
		assetTypes := strings.Split(mime.TypeByExtension(path.Ext(assetTarget)), "/")
		var assetType string
		switch assetTypes[0] {
		case "image":
			assetType = "image"
		case "audio":
			assetType = "audio"
		}
		if assetType != "" {
			gw.assets = append(gw.assets, &preload{assetTarget, assetType})
		}
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

func (gw *gameWriter) postPreloadAssets(auth []byte, id uint64) error {
	var preloadAssets struct {
		Preload []*preload `json:"preload"`
	}
	preloadAssets.Preload = gw.assets
	body, err := json.Marshal(preloadAssets)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, fmt.Sprintf("%s/api/me/games/%s/%d/preload", gw.serverURL, url.PathEscape(gw.name), id), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Add("cookie", string(auth))
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	if res.StatusCode != 204 {
		return fmt.Errorf("unable to post preload assets: %s", res.Status)
	}
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
		return nil, errGameNotFound
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
