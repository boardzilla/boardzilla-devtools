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
	if err := b.buildUI(manifest); err != nil {
		return err
	}
	if err := b.buildGame(manifest); err != nil {
		return err
	}
	return nil
}

func (b *Builder) WatchedFiles() ([]string, error) {
	manifest, err := b.Manifest()
	if err != nil {
		return nil, err
	}

	return []string{
		path.Join(b.root, "game.v1.json"),
		path.Join(b.root, manifest.UI.Root, manifest.UI.Source),
		path.Join(b.root, manifest.Game.Root, manifest.Game.Source),
	}, nil
}

func (b *Builder) BuildUI() error {
	manifest, err := b.Manifest()
	if err != nil {
		return err
	}
	return b.buildUI(manifest)
}

func (b *Builder) buildUI(m *ManifestV1) error {
	fmt.Printf("Buidling UI %s\n", m.UI.BuildCommand)
	args := strings.Fields(m.UI.BuildCommand)
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
	return b.buildGame(manifest)
}

func (b *Builder) buildGame(m *ManifestV1) error {
	fmt.Printf("Buidling Game %s\n", m.Game.BuildCommand)
	args := strings.Fields(m.Game.BuildCommand)
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
