import { clearFormat, format, InvalidKdlError, parse } from "@bgotink/kdl";
import { describe, expect, it } from "vitest";

const file = `diagram version=1 title="Order flow" {
  plugins core@1 arch@1
}

// ── structure
node api "API Gateway" shape=arch.gateway
// kept with the element below
gadget g1 mode=fast enabled=#true {
  part 1 2 tag=x
}
edge api -

layout {
  api x=40 y=150 locked=#true
}
`;

describe("KDL parser choice", () => {
  it("parses KDL v2 syntax", () => {
    const doc = parse(file);
    expect(doc.nodes.map((n) => n.name.getName())).toEqual(["diagram", "node", "gadget", "edge", "layout"]);
    const api = doc.findNodeByName("layout")?.children?.findNodeByName("api");
    expect(api?.getProperty("locked")).toBe(true);
    expect(api?.getProperty("x")).toBe(40);
  });

  it("reports line and column on a syntax error", () => {
    const run = () => parse('node a\nnode "unterminated');
    expect(run).toThrow(InvalidKdlError);
    try {
      run();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidKdlError);
      expect((error as InvalidKdlError).start).toMatchObject({ line: 2, column: 19 });
    }
  });

  it("keeps whole-line comments with the node below", () => {
    const doc = parse(file);
    const gadget = doc.findNodeByName("gadget");
    expect(gadget?.leading).toContain("// kept with the element below");
    expect(format(doc)).toBe(file);
  });

  it("keeps unknown nodes, properties and children across an edit", () => {
    const doc = parse(file);
    doc.findNodeByName("node")?.setProperty("shape", "arch.server");
    const out = format(clearFormat(doc));
    const again = parse(out);
    const gadget = again.findNodeByName("gadget");
    expect(gadget?.getProperty("mode")).toBe("fast");
    expect(gadget?.getProperty("enabled")).toBe(true);
    const part = gadget?.children?.findNodeByName("part");
    expect(part?.getArguments()).toEqual([1, 2]);
    expect(part?.getProperty("tag")).toBe("x");
    expect(again.findNodeByName("node")?.getProperty("shape")).toBe("arch.server");
  });
});
