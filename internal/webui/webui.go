// Package webui holds the built web app, embedded into the binary.
//
// `pnpm build` in web/ writes the app to dist/app. Without a build the app folder is empty and
// the server answers 404 for it.
package webui

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var dist embed.FS

// Files returns the app files, with index.html at the root.
func Files() fs.FS {
	app, err := fs.Sub(dist, "dist/app")
	if err != nil {
		return embed.FS{}
	}
	if _, err := fs.Stat(app, "."); err != nil {
		return embed.FS{}
	}
	return app
}
