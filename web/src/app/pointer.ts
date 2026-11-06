// The last world point of the pointer while it is over the canvas. The cursor readout and paste share it.
import type { Point } from "../model/index.ts";

export class CanvasPointer {
  at: Point | null = null;

  move(point: Point): void {
    this.at = point;
  }

  leave(): void {
    this.at = null;
  }
}
