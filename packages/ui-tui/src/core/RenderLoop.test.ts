import { RenderLoop } from './RenderLoop.js';
import type { ITerminalCanvas } from './TerminalCanvas.js';
import type { IScene } from './IScene.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('RenderLoop', () => {
  let canvas: ITerminalCanvas;
  let scene: IScene;
  let renderCallCount: number;

  beforeEach(() => {
    renderCallCount = 0;
    canvas = {
      beginFrame: jest.fn(),
      endFrame: jest.fn(),
      write: jest.fn(),
      clear: jest.fn(),
      getSize: jest.fn().mockReturnValue({ cols: 80, rows: 24 }),
    };
    scene = {
      name: 'test',
      render: jest.fn(() => { renderCallCount++; }),
      onKeyPress: jest.fn(),
      onSlowFrame: jest.fn(),
    };
  });

  it('should not render when not dirty', async () => {
    const loop = new RenderLoop(canvas, scene);
    loop.start();
    await delay(100);
    loop.stop();

    expect(renderCallCount).toBe(0);
  });

  it('should render when marked dirty', async () => {
    const loop = new RenderLoop(canvas, scene);
    loop.markDirty();
    loop.start();
    await delay(100);
    loop.stop();

    expect(renderCallCount).toBeGreaterThan(0);
    expect(canvas.beginFrame).toHaveBeenCalled();
    expect(canvas.endFrame).toHaveBeenCalled();
  });

  it('should track frame count', async () => {
    const loop = new RenderLoop(canvas, scene);
    loop.markDirty();
    loop.start();
    await delay(100);
    loop.stop();

    expect(loop.getFrameCount()).toBeGreaterThan(0);
  });

  it('should support scene switching', () => {
    const loop = new RenderLoop(canvas, scene);
    const newScene: IScene = { name: 'new', render: jest.fn(), onKeyPress: jest.fn(), onSlowFrame: jest.fn() };

    loop.setScene(newScene);
    expect(loop.isRunning()).toBe(false);
  });
});
