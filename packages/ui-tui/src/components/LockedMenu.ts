import type { ITerminalCanvas } from '../core/TerminalCanvas.js';
import type { UserRole } from '@tfsdc/kernel';

export interface MenuItem {
  label: string;
  key: string;
  requiredRoles: UserRole[];
}

export class LockedMenu {
  render(
    canvas: ITerminalCanvas,
    x: number,
    y: number,
    items: MenuItem[],
    role: UserRole,
    selectedIndex: number,
  ): void {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const allowed = item.requiredRoles.includes(role);
      const isSelected = i === selectedIndex;
      const prefix = isSelected ? '> ' : '  ';

      if (allowed) {
        canvas.write(x, y + i, `${prefix}${item.label}`, {
          color: isSelected ? 'cyan' : 'white',
          bold: isSelected,
        });
      } else {
        canvas.write(x, y + i, `${prefix}[LOCKED] ${item.label}`, {
          color: 'gray',
          dim: true,
        });
      }
    }
  }

  isAllowed(item: MenuItem, role: UserRole): boolean {
    return item.requiredRoles.includes(role);
  }
}
