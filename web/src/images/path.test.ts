import { describe, expect, it } from "vitest";
import { imageMime, resolveAsset } from "./path.ts";

describe("resolving an image path", () => {
  it("is relative to the folder of the diagram file", () => {
    expect(resolveAsset("a.drawit.kdl", "assets/logo.png")).toBe("assets/logo.png");
    expect(resolveAsset("sub/a.drawit.kdl", "assets/logo.svg")).toBe("sub/assets/logo.svg");
    expect(resolveAsset("sub/deep/a.drawit.kdl", "../shared/x.webp")).toBe("sub/shared/x.webp");
    expect(resolveAsset("a.drawit.kdl", "./assets//x.jpg")).toBe("assets/x.jpg");
  });

  it("is null for a path that leaves the workspace folder", () => {
    expect(resolveAsset("a.drawit.kdl", "../x.png")).toBeNull();
    expect(resolveAsset("sub/a.drawit.kdl", "../../x.png")).toBeNull();
    expect(resolveAsset("a.drawit.kdl", "assets/../../x.png")).toBeNull();
  });

  it("is null for an absolute path, a URL, a backslash or NUL, and an empty path", () => {
    for (const src of ["/etc/x.png", "https://example.com/x.png", "data:image/png;base64,AAAA", "javascript:x.png", "assets\\x.png", "assets/x\0.png", "", ".", "assets/"]) {
      expect(resolveAsset("a.drawit.kdl", src), src).toBeNull();
    }
  });

  it("is null unless the file is a raster or SVG image", () => {
    expect(resolveAsset("a.drawit.kdl", "assets/notes.txt")).toBeNull();
    expect(resolveAsset("a.drawit.kdl", "assets/page.html")).toBeNull();
    expect(resolveAsset("a.drawit.kdl", "assets/noext")).toBeNull();
    for (const ext of ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "PNG"]) {
      expect(resolveAsset("a.drawit.kdl", `assets/x.${ext}`), ext).not.toBeNull();
    }
  });
});

describe("image type", () => {
  it("is the media type of the extension", () => {
    expect(imageMime("assets/x.png")).toBe("image/png");
    expect(imageMime("assets/x.JPG")).toBe("image/jpeg");
    expect(imageMime("assets/x.jpeg")).toBe("image/jpeg");
    expect(imageMime("assets/x.svg")).toBe("image/svg+xml");
    expect(imageMime("assets/x.webp")).toBe("image/webp");
    expect(imageMime("assets/x.gif")).toBe("image/gif");
    expect(imageMime("assets/x.avif")).toBe("image/avif");
    expect(imageMime("assets/x.txt")).toBeUndefined();
  });
});
