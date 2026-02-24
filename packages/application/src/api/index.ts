// Types
export type {
  ClientMessage,
  ServerMessage,
  ChangeAppliedPayload,
  AuthContext,
  IAuditWriter,
  IJwtVerifier,
  IDbSession,
} from './types.js';

// Middleware
export { authenticate } from './middleware/auth.middleware.js';
export type { AuthResult } from './middleware/auth.middleware.js';
export { checkRole } from './middleware/rbac.middleware.js';
export type { RbacResult } from './middleware/rbac.middleware.js';
export { shouldAudit, writeAuditLog } from './middleware/audit.middleware.js';
export type { AuditableRequest } from './middleware/audit.middleware.js';

// WebSocket
export { WsConnectionManager, WS_OPEN } from './websocket/WsConnectionManager.js';
export type { IWebSocket, SseCallback } from './websocket/WsConnectionManager.js';
export { WsEventBroadcaster } from './websocket/WsEventBroadcaster.js';

// Routes
export { healthHandler } from './routes/health.routes.js';
export type { HealthDeps, HealthResponse } from './routes/health.routes.js';
export type { IChangeRouteHandler, CreateChangeInput, ChangeListQuery } from './routes/changes.routes.js';
export { ChangeRouteHandlerImpl } from './routes/ChangeRouteHandlerImpl.js';
export type { IApprovalRouteHandler } from './routes/approvals.routes.js';
export { ApprovalRouteHandlerImpl } from './routes/ApprovalRouteHandlerImpl.js';
export {
  isValidStateTable,
  listState,
  getStateById,
  updateStateField,
  deleteStateRow,
  insertStateRow,
  getStateSchema,
  StateValidationError,
} from './routes/state.routes.js';
export type { StateListQuery, FieldSchemaMeta } from './routes/state.routes.js';
export { listAuditLogs } from './routes/audit.routes.js';
export type { AuditListQuery } from './routes/audit.routes.js';
