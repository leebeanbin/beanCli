import type { ITerminalCanvas } from './TerminalCanvas.js';
import type { IScene } from './IScene.js';

export class RenderLoop {
  private readonly frameBudgetMs: number;
  private dirty = false;
  private running = false;
  private lastFrameTime = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private frameCount = 0;
  private lastSlowFrameMs = 0;

  private postRender?: (canvas: ITerminalCanvas) => void;
  private animationTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly canvas: ITerminalCanvas,
    private scene: IScene,
    private readonly targetFps = 30,
  ) {
    this.frameBudgetMs = 1000 / this.targetFps;
  }

  setPostRender(fn: (canvas: ITerminalCanvas) => void): void {
    this.postRender = fn;
  }

  /** Marks dirty on a fixed interval — required for spinner animations. */
  enableAnimation(intervalMs = 250): void {
    if (this.animationTimer) clearInterval(this.animationTimer);
    this.animationTimer = setInterval(() => this.markDirty(), intervalMs);
  }

  markDirty(): void {
    this.dirty = true;
  }

  start(): void {
    this.running = true;
    this.scheduleFrame();
  }

  stop(): void {
    this.running = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.animationTimer) { clearInterval(this.animationTimer); this.animationTimer = null; }
  }

  setScene(scene: IScene): void {
    this.scene = scene;
    this.markDirty();
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  getLastSlowFrameMs(): number {
    return this.lastSlowFrameMs;
  }

  isRunning(): boolean {
    return this.running;
  }

  private scheduleFrame(): void {
    if (!this.running) return;

    const now = Date.now();
    const elapsed = now - this.lastFrameTime;
    const delay = Math.max(0, this.frameBudgetMs - elapsed);

    this.timer = setTimeout(() => {
      if (this.dirty) {
        this.renderFrame();
        this.dirty = false;
        this.lastFrameTime = Date.now();
      }
      this.scheduleFrame();
    }, delay);
  }

  private renderFrame(): void {
    const start = performance.now();
    this.canvas.beginFrame();
    this.scene.render(this.canvas);
    this.postRender?.(this.canvas);
    this.canvas.endFrame();
    const took = performance.now() - start;
    this.frameCount++;

    if (took > this.frameBudgetMs) {
      this.lastSlowFrameMs = took;
      this.scene.onSlowFrame(took);
    }
  }
}
