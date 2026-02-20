// Core
export { RenderLoop } from './core/RenderLoop.js';
export { TerminalCanvas } from './core/TerminalCanvas.js';
export type { ITerminalCanvas, TextStyle } from './core/TerminalCanvas.js';
export { EventBus } from './core/EventBus.js';
export { Layout } from './core/Layout.js';
export type { Region, LayoutMode, LayoutRegions } from './core/Layout.js';
export type { IScene } from './core/IScene.js';

// Store
export { AppState } from './store/AppState.js';
export type { StreamStats } from './store/AppState.js';
export { ViewportState } from './store/ViewportState.js';
export type { ViewportRange } from './store/ViewportState.js';
export { OptimisticPatchManager } from './store/OptimisticPatch.js';
export type { OptimisticPatch, ChangeAppliedEvent, IViewportRefetcher, IDirtyMarker } from './store/OptimisticPatch.js';

// Components
export { Table } from './components/Table.js';
export type { TableColumn } from './components/Table.js';
export { StatusBar } from './components/StatusBar.js';
export type { StatusBarProps } from './components/StatusBar.js';
export { LockedMenu } from './components/LockedMenu.js';
export type { MenuItem } from './components/LockedMenu.js';

// Scenes
export { ExploreScene } from './scenes/ExploreScene.js';
export { MonitorScene } from './scenes/MonitorScene.js';
export { AuditScene } from './scenes/AuditScene.js';
export { RecoveryScene } from './scenes/RecoveryScene.js';
export { IndexLabScene } from './scenes/IndexLabScene.js';

// WS Client
export { TuiWsClient } from './ws/TuiWsClient.js';
export type { IWsTransport, TuiWsCallbacks } from './ws/TuiWsClient.js';
