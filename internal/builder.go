package internal

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path"
	"strings"
	"time"

	"github.com/gookit/color"
)

type BuildType int
type BuildMode int

const (
	UI BuildType = 1 << iota
	Game
)
const (
	Prod BuildMode = iota
	Dev
)

type cmd struct {
	root string
	cmd  string
}

type result struct {
	stdout []byte
	stderr []byte
	err    error
}

type Builder struct {
	root string
}

func NewBuilder(root string) (*Builder, error) {
	return &Builder{
		root: root,
	}, nil
}

func (b *Builder) Build(mode BuildMode, types BuildType) ([]byte, []byte, error) {
	// load json manifest
	manifest, err := b.Manifest()
	if err != nil {
		return nil, nil, err
	}

	buildSteps := make(map[cmd]bool)
	if types&UI != 0 {
		color.Printf("Building UI\n")
		switch mode {
		case Prod:
			for _, c := range manifest.UI.BuildCommands.Production {
				buildSteps[cmd{path.Join(b.root, manifest.UI.Root), c}] = true
			}
		case Dev:
			for _, c := range manifest.UI.BuildCommands.Dev {
				buildSteps[cmd{path.Join(b.root, manifest.UI.Root), c}] = true
			}
		}
	}
	if types&Game != 0 {
		color.Printf("Building Game\n")
		switch mode {
		case Prod:
			for _, c := range manifest.Game.BuildCommands.Production {
				buildSteps[cmd{path.Join(b.root, manifest.Game.Root), c}] = true
			}
		case Dev:
			for _, c := range manifest.Game.BuildCommands.Dev {
				buildSteps[cmd{path.Join(b.root, manifest.Game.Root), c}] = true
			}
		}
	}

	results := make(chan result, len(buildSteps))
	ctx, cancelFn := context.WithCancel(context.Background())
	for c := range buildSteps {
		go func(c cmd) {
			results <- b.run(ctx, c.root, c.cmd)
		}(c)
	}
	var res result
	for range buildSteps {
		res = <-results
		if res.err != nil {
			cancelFn()
			return res.stdout, res.stderr, res.err
		}
	}
	return res.stdout, res.stderr, res.err
}

func (b *Builder) WatchedFiles() ([]string, error) {
	manifest, err := b.Manifest()
	if err != nil {
		return nil, err
	}
	paths := make([]string, 0, len(manifest.UI.WatchPaths)+len(manifest.Game.WatchPaths)+1)
	if _, err := os.Stat(path.Join(b.root, "game.v1.json")); err != nil {
		if !os.IsNotExist(err) {
			return nil, err
		}
	} else {
		paths = append(paths, path.Join(b.root, "game.v1.json"))
	}
	if _, err := os.Stat(path.Join(b.root, "game.json")); err != nil {
		if !os.IsNotExist(err) {
			return nil, err
		}
	} else {
		paths = append(paths, path.Join(b.root, "game.json"))
	}
	for _, p := range manifest.UI.WatchPaths {
		paths = append(paths, path.Join(b.root, p))
	}
	for _, p := range manifest.Game.WatchPaths {
		paths = append(paths, path.Join(b.root, p))
	}
	return paths, nil
}

func (b *Builder) Manifest() (*ManifestV1, error) {
	f, err := os.Open(path.Join(b.root, "game.v1.json"))
	if err != nil {
		if os.IsNotExist(err) {
			f, err = os.Open(path.Join(b.root, "game.json"))
			if err != nil {
				return nil, err
			}
		} else {
			return nil, err
		}
	}
	defer f.Close()
	manifest := &ManifestV1{}
	if err := json.NewDecoder(f).Decode(manifest); err != nil {
		return nil, err
	}
	return manifest, nil
}

func (b *Builder) Clean() error {
	// load json manifest
	manifest, err := b.Manifest()
	if err != nil {
		return err
	}

	// run game/ui build
	if err := b.cleanUI(manifest); err != nil {
		return err
	}
	if err := b.cleanGame(manifest); err != nil {
		return err
	}
	return nil
}

func (b *Builder) cleanUI(manifest *ManifestV1) error {
	uiOutDir := path.Join(b.root, manifest.UI.Root, manifest.UI.OutputDirectory)
	_, err := os.Stat(uiOutDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	files, err := os.ReadDir(uiOutDir)
	if err != nil {
		return err
	}

	for _, f := range files {
		if err := os.RemoveAll(path.Join(uiOutDir, f.Name())); err != nil {
			return fmt.Errorf("remove ui path: %w", err)
		}
	}
	return nil
}

func (b *Builder) cleanGame(manifest *ManifestV1) error {
	gameOutPath := path.Join(b.root, manifest.Game.Root, manifest.Game.OutputFile)
	_, err := os.Stat(gameOutPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	return os.RemoveAll(gameOutPath)
}

func (b *Builder) run(ctx context.Context, dir, cmdStr string) result {
	color.Printf("Running cmd <grey>%s</>\n", cmdStr)
	startTime := time.Now()
	args := strings.Fields(cmdStr)
	ctx, cancelFn := context.WithTimeout(ctx, 10*time.Second)
	defer cancelFn()
	cmd := exec.CommandContext(ctx, args[0], args[1:]...) // #nosec G204

	outbuf := bytes.NewBuffer(make([]byte, 1024*1024*5))
	errbuf := bytes.NewBuffer(make([]byte, 1024*1024*5))

	cmd.Stdout = io.MultiWriter(os.Stdout, outbuf)
	cmd.Stderr = io.MultiWriter(os.Stderr, errbuf)
	cmd.Dir = dir
	err := cmd.Run()
	if err == nil {
		fmt.Printf("%s succeeded\n", cmdStr)
	} else {
		fmt.Printf("%s encountered an error: %s\n", cmdStr, err.Error())
	}

	color.Printf("Running cmd <grey>%s</> finished in %s\n", cmdStr, time.Since(startTime))

	return result{outbuf.Bytes(), errbuf.Bytes(), err}
}

// clean
// run prod build for game and ui
// start a post with a zip body
