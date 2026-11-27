const DELAY = 500;
/** Reaching another control this soon after a tooltip closes shows the next one at once. */
const WARM = 300;
const GAP = 6;
const EDGE = 4;

/** Names a control in the app's tooltip, with the key of `action` when it has one. */
export function setTip(element: HTMLElement, name: string, action?: string): void {
  element.dataset["tip"] = name;
  if (action !== undefined) element.dataset["tipAction"] = action;
}

/** One tooltip for everything under `root` that has a tip. */
export function installTooltips(root: HTMLElement, keyFor: (action: string) => string): void {
  const tip = document.createElement("div");
  tip.className = "tooltip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  const name = document.createElement("span");
  const key = document.createElement("kbd");
  tip.append(name, key);

  let over: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closedAt = -Infinity;

  const close = (warm: boolean): void => {
    clearTimeout(timer);
    if (tip.hidden) return;
    tip.hidden = true;
    closedAt = warm ? performance.now() : -Infinity;
  };
  const show = (target: HTMLElement): void => {
    if (!target.isConnected || target.getClientRects().length === 0) return;
    name.textContent = target.dataset["tip"] ?? "";
    const action = target.dataset["tipAction"];
    key.textContent = action === undefined ? "" : keyFor(action);
    key.hidden = key.textContent === "";
    // The shell replaces the root's children, so the tooltip joins them when first needed.
    if (!tip.isConnected) root.append(tip);
    tip.hidden = false;
    const box = target.getBoundingClientRect();
    const size = tip.getBoundingClientRect();
    const left = Math.min(Math.max(box.left + (box.width - size.width) / 2, EDGE), innerWidth - size.width - EDGE);
    const below = box.bottom + GAP;
    const top = below + size.height + EDGE <= innerHeight ? below : box.top - GAP - size.height;
    tip.style.left = `${String(left)}px`;
    tip.style.top = `${String(top)}px`;
  };
  const tipped = (target: EventTarget | null): HTMLElement | null =>
    target instanceof Element ? target.closest<HTMLElement>("[data-tip]") : null;
  // A disabled button gets no pointer events, so the stylesheet lets them through to its parent.
  const disabledAt = ({ target, clientX, clientY }: PointerEvent): HTMLElement | null => {
    if (!(target instanceof HTMLElement)) return null;
    return [...target.querySelectorAll<HTMLElement>("[data-tip]:disabled")].find((item) => {
      const box = item.getBoundingClientRect();
      return clientX >= box.left && clientX < box.right && clientY >= box.top && clientY < box.bottom;
    }) ?? null;
  };
  const enter = (target: HTMLElement | null): void => {
    if (target === over) return;
    over = target;
    close(true);
    if (!target) return;
    if (performance.now() - closedAt <= WARM) show(target);
    else timer = setTimeout(() => { show(target); }, DELAY);
  };

  const point = (event: PointerEvent): void => {
    if (event.pointerType === "touch" || event.buttons !== 0) return;
    enter(tipped(event.target) ?? disabledAt(event));
  };
  root.addEventListener("pointerover", point);
  root.addEventListener("pointermove", point);
  root.addEventListener("pointerleave", () => { enter(null); });
  root.addEventListener("pointerdown", () => { close(false); }, true);
  root.addEventListener("focusin", (event) => {
    const target = tipped(event.target);
    if (target && event.target instanceof Element && event.target.matches(":focus-visible")) show(target);
    else close(false);
  });
  root.addEventListener("focusout", () => { close(false); });
  addEventListener("keydown", (event) => { if (event.key === "Escape") close(false); }, true);
  addEventListener("resize", () => { close(false); });
  addEventListener("scroll", () => { close(false); }, true);
}
