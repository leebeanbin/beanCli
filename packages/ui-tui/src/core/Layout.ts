export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LayoutMode = 'compact' | 'split' | 'full';

export interface LayoutRegions {
  mode: LayoutMode;
  sidebar?: Region;
  main: Region;
  detail?: Region;
  statusBar: Region;
}

export class Layout {
  compute(cols: number, rows: number): LayoutRegions {
    const statusBar: Region = { x: 0, y: rows - 1, width: cols, height: 1 };

    if (cols < 80) {
      return {
        mode: 'compact',
        main: { x: 0, y: 1, width: cols, height: rows - 2 },
        statusBar,
      };
    }

    const sidebarWidth = Math.min(24, Math.floor(cols * 0.2));
    const sidebar: Region = { x: 0, y: 1, width: sidebarWidth, height: rows - 2 };

    if (cols >= 120) {
      const detailWidth = Math.min(30, Math.floor(cols * 0.25));
      const mainWidth = cols - sidebarWidth - detailWidth - 2;
      return {
        mode: 'full',
        sidebar,
        main: { x: sidebarWidth + 1, y: 1, width: mainWidth, height: rows - 2 },
        detail: { x: cols - detailWidth, y: 1, width: detailWidth, height: rows - 2 },
        statusBar,
      };
    }

    return {
      mode: 'split',
      sidebar,
      main: { x: sidebarWidth + 1, y: 1, width: cols - sidebarWidth - 1, height: rows - 2 },
      statusBar,
    };
  }
}
