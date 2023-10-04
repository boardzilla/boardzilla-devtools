package devtools

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path"
	"strings"
)

const (
	ReloadUI = iota
	ReloadGame
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
	if err := b.buildUI(manifest, false); err != nil {
		return err
	}
	if err := b.buildGame(manifest, false); err != nil {
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

func (b *Builder) BuildUI() error {
	manifest, err := b.Manifest()
	if err != nil {
		return err
	}
	return b.buildUI(manifest, false)
}

func (b *Builder) buildUI(m *ManifestV1, prod bool) error {
	fmt.Printf("Buidling UI %s\n", m.UI.BuildCommand)
	buildCmd := m.UI.BuildCommand.Dev
	if prod {
		buildCmd = m.UI.BuildCommand.Production
	}
	args := strings.Fields(buildCmd)
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Dir = path.Join(b.root, m.UI.Root)
	if err := cmd.Run(); err != nil {
		return err
	}
	return nil
}
func (b *Builder) BuildGame() error {
	manifest, err := b.Manifest()
	if err != nil {
		return err
	}
	return b.buildGame(manifest, false)
}

func (b *Builder) buildGame(m *ManifestV1, prod bool) error {
	fmt.Printf("Buidling Game %s\n", m.Game.BuildCommand)
	buildCmd := m.Game.BuildCommand.Dev
	if prod {
		buildCmd = m.Game.BuildCommand.Production
	}
	args := strings.Fields(buildCmd)
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Dir = path.Join(b.root, m.Game.Root)
	if err := cmd.Run(); err != nil {
		return err
	}
	return nil
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
	manifest, err := b.Manifest()
	if err != nil {
		return err
	}
	gameOutPath := path.Join(b.root, manifest.Game.Root, manifest.Game.OutputFile)
	_, err = os.Stat(gameOutPath)
	if err != nil {
		if !os.IsNotExist(err) {
			return err
		}
	} else {
		if err := os.Remove(gameOutPath); err != nil {
			return err
		}
	}
	uiOutDir := path.Join(b.root, manifest.UI.Root, manifest.UI.OutputDirectory)
	files, err := os.ReadDir(uiOutDir)
	if err != nil {
		return err
	}

	for _, f := range files {
		if err := os.RemoveAll(path.Join(uiOutDir, f.Name())); err != nil {
			return err
		}
	}
	return nil
}

func (b *Builder) BuildProd() error {
	manifest, err := b.Manifest()
	if err != nil {
		return err
	}
	if err := b.buildUI(manifest, true); err != nil {
		return err
	}
	if err := b.buildGame(manifest, true); err != nil {
		return err
	}
	return nil
}

// clean
// run prod build for game and ui
// start a post with a zip body
