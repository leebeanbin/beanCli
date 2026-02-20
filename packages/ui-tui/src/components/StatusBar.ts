import type { ITerminalCanvas } from '../core/TerminalCanvas.js';
import type { Region } from '../core/Layout.js';
import type { StreamMode, ExecutionMode, UserRole, Environment } from '@tfsdc/kernel';

export interface StatusBarProps {
  streamMode: StreamMode;
  executionMode: ExecutionMode;
  environment: Environment;
  role: UserRole;
  overloadWarning?: string | null;
}

export class StatusBar {
  render(canvas: ITerminalCanvas, region: Region, props: StatusBarProps): void {
    const modeBadge = props.streamMode === 'LIVE' ? '[LIVE]' : '[PAUSED]';
    const modeColor = props.streamMode === 'LIVE' ? 'green' : 'yellow';

    canvas.write(region.x, region.y, modeBadge, { color: modeColor, bold: true });

    const execLabel = this.getExecModeLabel(props.executionMode);
    canvas.write(
      region.x + modeBadge.length + 2,
      region.y,
      `Mode: ${execLabel}  Env: ${props.environment}  Role: ${props.role}`,
      { color: 'white' },
    );

    if (props.overloadWarning) {
      canvas.write(
        region.x + region.width - props.overloadWarning.length - 2,
        region.y,
        props.overloadWarning,
        { color: 'red', bold: true },
      );
    }
  }

  private getExecModeLabel(mode: ExecutionMode): string {
    switch (mode) {
      case 'AUTO': return 'AUTO';
      case 'CONFIRM': return 'CONFIRM';
      case 'MANUAL': return 'MANUAL';
    }
  }
}
