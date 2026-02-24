import type { ITerminalCanvas } from '../core/TerminalCanvas.js';
import { getTheme } from '../core/Theme.js';

export interface SceneTab {
  key: string;
  label: string;
  icon: string;
}

const DEFAULT_SCENES: SceneTab[] = [
  { key: 'explore',  label: 'EXPLORE',   icon: '=' },
  { key: 'monitor',  label: 'MONITOR',   icon: '*' },
  { key: 'audit',    label: 'AUDIT',     icon: '#' },
  { key: 'recovery', label: 'RECOVERY',  icon: '!' },
  { key: 'indexlab', label: 'INDEX LAB', icon: '+' },
  { key: 'aichat',   label: 'AI CHAT',   icon: '~' },
];

export class SceneTabBar {
  private readonly scenes: SceneTab[];
  private activeKey = 'explore';

  constructor(scenes?: SceneTab[]) {
    this.scenes = scenes ?? DEFAULT_SCENES;
  }

  setActive(key: string): void {
    this.activeKey = key;
  }

  render(canvas: ITerminalCanvas, y: number): void {
    const { cols } = canvas.getSize();
    const t = getTheme();

    // Arrow for active tab
    const arrow = '>';

    let x = 0;
    for (let i = 0; i < this.scenes.length; i++) {
      const scene = this.scenes[i];
      const isActive = scene.key === this.activeKey;

      if (i > 0) {
        canvas.write(x, y, ' │ ', t.s.borderDim);
        x += 3;
      } else {
        canvas.write(x, y, ' ', t.s.borderDim);
        x += 1;
      }

      const num = `${i + 1}`;

      if (isActive) {
        canvas.write(x, y, arrow + ' ', t.s.accent);
        x += 2;
        canvas.write(x, y, `${num}:${scene.label}`, t.s.tabActive);
        x += num.length + 1 + scene.label.length;
      } else {
        canvas.write(x, y, `${num}:${scene.label}`, t.s.tabInactive);
        x += num.length + 1 + scene.label.length;
      }
    }

    // Fill to edge with a soft separator line
    if (x < cols) {
      canvas.write(x, y, ' ' + '─'.repeat(Math.max(0, cols - x - 1)), t.s.borderDim);
    }
  }
}
