import { describe, expect, it } from "vitest";
import { exportFileName } from "./name.ts";

describe("export file name", () => {
  it("uses the diagram file name, and adds the frame id for a frame", () => {
    expect(exportFileName("notes/network.drawit.kdl", null, "png")).toBe("network.png");
    expect(exportFileName("notes/network.drawit.kdl", "overview", "svg")).toBe("network-overview.svg");
    expect(exportFileName("a.drawit.kdl", null, "svg")).toBe("a.svg");
  });
});
