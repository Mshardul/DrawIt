package scaffold

import "testing"

func TestModuleBuilds(t *testing.T) {
	if Name != "drawit" {
		t.Fatalf("Name = %q, want %q", Name, "drawit")
	}
}
