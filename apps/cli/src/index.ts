import {
  RenderLoop,
  TerminalCanvas,
  EventBus,
  Layout,
  AppState,
  ViewportState,
  OptimisticPatchManager,
  ExploreScene,
  MonitorScene,
  AuditScene,
  RecoveryScene,
  IndexLabScene,
  TuiWsClient,
} from '@tfsdc/ui-tui';
import type { IScene, IWsTransport } from '@tfsdc/ui-tui';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const WS_URL = process.env.WS_URL ?? 'ws://localhost:3000/ws';

async function main() {
  const appState = new AppState();
  const viewportState = new ViewportState();
  const eventBus = new EventBus();
  const layout = new Layout();

  const canvas = new TerminalCanvas(process.stdout as unknown as { write: (d: string) => void; columns?: number; rows?: number });

  const scenes: Record<string, IScene> = {};
  scenes.explore = new ExploreScene(viewportState);
  scenes.monitor = new MonitorScene(appState);
  scenes.audit = new AuditScene();
  scenes.recovery = new RecoveryScene();
  scenes.indexlab = new IndexLabScene();

  const currentScene = scenes.explore;
  const renderLoop = new RenderLoop(canvas, currentScene);

  const patchManager = new OptimisticPatchManager(
    renderLoop,
    {
      reloadViewport: (table) => console.log(`[tui] Reload viewport: ${table}`),
      refetchRows: (table, pks) => console.log(`[tui] Refetch ${pks.length} rows in ${table}`),
    },
  );

  const sceneNames = ['explore', 'monitor', 'audit', 'recovery', 'indexlab'];
  let sceneIndex = 0;

  if (process.stdin.setRawMode) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');

    process.stdin.on('data', (key: string) => {
      if (key === '\u0003') { // Ctrl+C
        renderLoop.stop();
        canvas.clear();
        process.exit(0);
      }

      if (key === '\t') { // Tab to switch scenes
        sceneIndex = (sceneIndex + 1) % sceneNames.length;
        const name = sceneNames[sceneIndex];
        appState.setScene(name);
        renderLoop.setScene(scenes[name]);
        renderLoop.markDirty();
        return;
      }

      if (key === ' ') { // Space to toggle LIVE/PAUSED
        appState.toggleStreamMode();
        renderLoop.markDirty();
        return;
      }

      const scene = scenes[appState.currentScene];
      if (key === '\u001b[A') scene.onKeyPress('up');
      else if (key === '\u001b[B') scene.onKeyPress('down');
      else scene.onKeyPress(key);

      renderLoop.markDirty();
    });
  }

  process.stdout.on('resize', () => {
    const { columns = 80, rows = 24 } = process.stdout;
    (canvas as TerminalCanvas).updateSize(columns, rows);
    renderLoop.markDirty();
  });

  renderLoop.markDirty();
  renderLoop.start();

  console.log(`[tui] Started. Tab=switch scene, Space=LIVE/PAUSED, Ctrl+C=quit`);
  console.log(`[tui] Connecting to ${WS_URL}...`);
}

main().catch((err) => {
  console.error('[tui] Fatal error:', err);
  process.exit(1);
});
