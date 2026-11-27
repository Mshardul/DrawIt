// The Arrange group of the right panel: align, distribute and stacking buttons for the selection. It
// holds no state; each button is enabled from the document and runs one command.
import { iconButton, type IconName } from "../app/icons.ts";
import type { OpenFile } from "../app/workspace.ts";
import { type Command, CommandError } from "../commands/command.ts";
import { ALIGN_MODES, alignCommand, arrangeAvailability, AXES, distributeCommand } from "../edit/arrange.ts";
import type { AlignMode, Axis } from "../edit/arrange.ts";
import { type StackTo, stackAvailability, stackCommand } from "../edit/stacking.ts";
import type { TextMeasurer } from "../text/measure.ts";

export interface ArrangeHost {
  getFile(): OpenFile | null;
  measurer: TextMeasurer;
  /** Redraws the canvas and the unsaved indicator after the document changed. */
  refresh(): void;
}

export interface ArrangeGroup {
  element: HTMLElement;
  /** Enables the buttons that would do something for the current selection. */
  update(): void;
}

const alignName: Record<AlignMode, string> = {
  left: "Align left",
  centre: "Align centre",
  right: "Align right",
  top: "Align top",
  middle: "Align middle",
  bottom: "Align bottom",
};

const alignIcon: Record<AlignMode, IconName> = {
  left: "alignLeft",
  centre: "alignCentre",
  right: "alignRight",
  top: "alignTop",
  middle: "alignMiddle",
  bottom: "alignBottom",
};

const distributeIcon: Record<Axis, IconName> = {
  horizontal: "distributeH",
  vertical: "distributeV",
};

const distributeName: Record<Axis, string> = {
  horizontal: "Distribute horizontally",
  vertical: "Distribute vertically",
};

const stackName: Record<StackTo, string> = {
  front: "Bring to front",
  back: "Send to back",
};

export function createArrangeGroup(host: ArrangeHost): ArrangeGroup {
  const element = document.createElement("div");
  element.className = "arrange-group";
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", "Arrange");

  const run = (build: (file: OpenFile) => Command | null): void => {
    const file = host.getFile();
    const command = file && build(file);
    if (command) {
      try {
        file.history.execute(command);
      } catch (e) {
        if (!(e instanceof CommandError)) throw e;
      }
    }
    host.refresh();
  };

  const button = (glyph: IconName, name: string, build: (file: OpenFile) => Command | null): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    iconButton(b, glyph, name);
    b.addEventListener("click", () => { run(build); });
    return b;
  };

  const aligns = ALIGN_MODES.map((mode) => ({
    mode,
    button: button(alignIcon[mode], alignName[mode], (f) => alignCommand(f.document, host.measurer, f.history.selection, mode)),
  }));
  const distributes = AXES.map((axis) => ({
    axis,
    button: button(distributeIcon[axis], distributeName[axis], (f) => distributeCommand(f.document, host.measurer, f.history.selection, axis)),
  }));
  const stacks = (["front", "back"] as const).map((to) => ({
    to,
    button: button(to === "front" ? "toFront" : "toBack", stackName[to], (f) => stackCommand(f.document, f.history.selection, to)),
  }));
  element.append(...aligns.map((a) => a.button), ...distributes.map((d) => d.button), ...stacks.map((s) => s.button));

  return {
    element,
    update() {
      const file = host.getFile();
      const available = file && arrangeAvailability(file.document, host.measurer, file.history.selection);
      for (const { mode, button: b } of aligns) b.disabled = !available?.align[mode];
      for (const { axis, button: b } of distributes) b.disabled = !available?.distribute[axis];
      const stackable = file && stackAvailability(file.document, file.history.selection);
      for (const { to, button: b } of stacks) b.disabled = !stackable?.[to];
    },
  };
}
