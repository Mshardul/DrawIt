package scaffold

import "testing"

func TestT001_ModuleBuilds(t *testing.T) {
	if Name != "drawit" {
		t.Fatalf("Name = %q, want %q", Name, "drawit")
	}
}
