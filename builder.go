package devtools

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path"
	"strings"
)

const (
	UI = iota
	Game
)

type Builder struct {
	root string
}

func NewBuilder(root string) (*Builder, error) {
	return &Builder{
		root: root,
	}, nil
}

func (b *Builder) Build() error {
	// load json manifest
	manifest, err := b.Manifest()
	if err != nil {
		return err
	}

	// run game/ui build
	if _, _, err := b.buildUI(manifest, false); err != nil {
		return err
	}
	if _, _, err := b.buildGame(manifest, false); err != nil {
		return err
	}
	return nil
}

func (b *Builder) WatchedFiles() ([]string, error) {
	manifest, err := b.Manifest()
	if err != nil {
		return nil, err
	}
	paths := make([]string, 0, len(manifest.UI.WatchPaths)+len(manifest.Game.WatchPaths)+1)
	paths = append(paths, path.Join(b.root, "game.v1.json"))
	for _, p := range manifest.UI.WatchPaths {
		paths = append(paths, path.Join(b.root, p))
	}
	for _, p := range manifest.Game.WatchPaths {
		paths = append(paths, path.Join(b.root, p))
	}
	return paths, nil
}

func (b *Builder) BuildUI() ([]byte, []byte, error) {
	manifest, err := b.Manifest()
	if err != nil {
		return nil, nil, err
	}
	return b.buildUI(manifest, false)
}

func (b *Builder) buildUI(m *ManifestV1, prod bool) ([]byte, []byte, error) {
	fmt.Printf("Buidling UI %s\n", m.UI.BuildCommand)
	buildCmd := m.UI.BuildCommand.Dev
	if prod {
		buildCmd = m.UI.BuildCommand.Production
	}
	return b.run(path.Join(b.root, m.UI.Root), buildCmd)
}

func (b *Builder) BuildGame() ([]byte, []byte, error) {
	manifest, err := b.Manifest()
	if err != nil {
		return nil, nil, err
	}
	return b.buildGame(manifest, false)
}

func (b *Builder) buildGame(m *ManifestV1, prod bool) ([]byte, []byte, error) {
	fmt.Printf("Buidling Game %s\n", m.Game.BuildCommand)
	buildCmd := m.Game.BuildCommand.Dev
	if prod {
		buildCmd = m.Game.BuildCommand.Production
	}
	return b.run(path.Join(b.root, m.Game.Root), buildCmd)
}

func (b *Builder) Manifest() (*ManifestV1, error) {
	f, err := os.Open(path.Join(b.root, "game.v1.json"))
	if err != nil {
		return nil, err
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
		if !os.IsNotExist(err) {
			return nil
		}
		return err
	}
	return os.RemoveAll(gameOutPath)
}

func (b *Builder) BuildProd() error {
	manifest, err := b.Manifest()
	if err != nil {
		return err
	}
	if _, _, err := b.buildUI(manifest, true); err != nil {
		return err
	}
	if _, _, err := b.buildGame(manifest, true); err != nil {
		return err
	}
	return nil
}

func (b *Builder) run(dir, cmdStr string) ([]byte, []byte, error) {
	args := strings.Fields(cmdStr)
	cmd := exec.Command(args[0], args[1:]...) // #nosec G204

	outbuf := bytes.NewBuffer(make([]byte, 1024*1024*5))
	errbuf := bytes.NewBuffer(make([]byte, 1024*1024*5))

	cmd.Stdout = io.MultiWriter(os.Stdout, outbuf)
	cmd.Stderr = io.MultiWriter(os.Stderr, errbuf)
	cmd.Dir = dir
	err := cmd.Run()
	fmt.Printf("%s done with err %#v\n", cmdStr, err)

	return outbuf.Bytes(), errbuf.Bytes(), err
}

// clean
// run prod build for game and ui
// start a post with a zip body
