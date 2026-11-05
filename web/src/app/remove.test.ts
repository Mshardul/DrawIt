import { describe, expect, it } from "vitest";
import { deleteWording } from "./remove.ts";

describe("delete confirmation", () => {
  it("says a project and its diagrams move to the Trash", () => {
    expect(deleteWording({ kind: "project", name: "Client pitch", diagrams: 2, permanent: false })).toEqual({
      title: 'Delete "Client pitch"?',
      body: "This project and its 2 diagrams move to the Trash.",
      confirm: "Move to Trash",
    });
    expect(deleteWording({ kind: "project", name: "Notes", diagrams: 1, permanent: false }).body).toBe(
      "This project and its 1 diagram move to the Trash.",
    );
    expect(deleteWording({ kind: "project", name: "Empty", diagrams: 0, permanent: false }).body).toBe(
      "This project moves to the Trash.",
    );
  });

  it("asks a second time when the delete is permanent", () => {
    expect(deleteWording({ kind: "project", name: "Client pitch", diagrams: 2, permanent: true })).toEqual({
      title: 'Delete "Client pitch" permanently?',
      body: "This cannot be undone. The project and its 2 diagrams will be removed from the disk.",
      confirm: "Delete permanently",
    });
    expect(deleteWording({ kind: "diagram", name: "network", diagrams: 0, permanent: false })).toEqual({
      title: 'Delete "network"?',
      body: "network.drawit.kdl moves to the Trash.",
      confirm: "Move to Trash",
    });
    expect(deleteWording({ kind: "diagram", name: "network", diagrams: 0, permanent: true })).toEqual({
      title: 'Delete "network" permanently?',
      body: "This cannot be undone. network.drawit.kdl will be removed from the disk.",
      confirm: "Delete permanently",
    });
  });
});
