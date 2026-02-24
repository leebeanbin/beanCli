import type { ITerminalCanvas } from '../core/TerminalCanvas.js';
import { getTheme } from '../core/Theme.js';

export class TabBar {
  private index = 0;

  constructor(private readonly tabs: readonly string[]) {}

  current(): string { return this.tabs[this.index] ?? ''; }
  currentIndex(): number { return this.index; }
  length(): number { return this.tabs.length; }

  next(): void { this.index = (this.index + 1) % this.tabs.length; }
  prev(): void { this.index = (this.index - 1 + this.tabs.length) % this.tabs.length; }

  setIndex(i: number): void {
    if (i >= 0 && i < this.tabs.length) this.index = i;
  }

  setByValue(value: string): void {
    const i = this.tabs.indexOf(value);
    if (i >= 0) this.index = i;
  }

  render(
    canvas: ITerminalCanvas,
    x: number,
    y: number,
    labelFn?: (tab: string) => string,
  ): void {
    const t = getTheme();
    let xPos = x;
    this.tabs.forEach((tab, i) => {
      const label = labelFn ? labelFn(tab) : tab;
      const isActive = i === this.index;
      canvas.write(xPos, y, ` ${label} `, isActive ? t.s.tabActive : t.s.tabInactive);
      xPos += label.length + 3;
    });
  }
}
