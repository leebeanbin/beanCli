// Core
export { RenderLoop } from './core/RenderLoop.js';
export { TerminalCanvas } from './core/TerminalCanvas.js';
export type { ITerminalCanvas, TextStyle } from './core/TerminalCanvas.js';
export { EventBus } from './core/EventBus.js';
export { Layout } from './core/Layout.js';
export type { Region, LayoutMode, LayoutRegions } from './core/Layout.js';
export type { IScene, SceneContext } from './core/IScene.js';
export { getTheme, setTheme, Icons } from './core/Theme.js';
export type { ThemePalette, ThemeStyles } from './core/Theme.js';

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
export { FilterBar } from './components/FilterBar.js';
export { HintBar } from './components/HintBar.js';
export { TabBar } from './components/TabBar.js';
export { SectionHeader } from './components/SectionHeader.js';
export { BoxBorder } from './components/BoxBorder.js';
export { SpinnerBadge } from './components/SpinnerBadge.js';
export { WelcomePanel } from './components/WelcomePanel.js';
export { CommandLine } from './components/CommandLine.js';
export type { CommandResult, CommandLineOptions, QueryResultData } from './components/CommandLine.js';
export { SceneTabBar } from './components/SceneTabBar.js';
export type { SceneTab } from './components/SceneTabBar.js';

// Scenes
export { ExploreScene } from './scenes/ExploreScene.js';
export type { EditCallbacks } from './scenes/ExploreScene.js';
export { MonitorScene } from './scenes/MonitorScene.js';
export { AuditScene } from './scenes/AuditScene.js';
export { RecoveryScene } from './scenes/RecoveryScene.js';
export { IndexLabScene } from './scenes/IndexLabScene.js';
export type { StreamHealthStat, IndexInfo, TableStatRow } from './scenes/IndexLabScene.js';
export { AiChatScene } from './scenes/AiChatScene.js';
export type { AiChatCallbacks, SqlExecResult } from './scenes/AiChatScene.js';
export { SplashScene } from './scenes/SplashScene.js';
export { TableSelectScene } from './scenes/TableSelectScene.js';
export type { TableMeta } from './scenes/TableSelectScene.js';
export { LoginScene } from './scenes/LoginScene.js';
export type { LoginResult } from './scenes/LoginScene.js';

// WS Client
export { TuiWsClient } from './ws/TuiWsClient.js';
export type { IWsTransport, TuiWsCallbacks } from './ws/TuiWsClient.js';
export { NodeWsTransport } from './ws/NodeWsTransport.js';
