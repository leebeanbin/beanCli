// Entities
export { ChangeRequest } from './entities/ChangeRequest.js';
export type { CreateChangeRequestParams, ReconstituteChangeRequestParams } from './entities/ChangeRequest.js';
export { BackupSnapshot } from './entities/BackupSnapshot.js';

// Value Objects
export { ChangeId } from './value-objects/ChangeId.js';
export { SqlStatement } from './value-objects/SqlStatement.js';
export type { SqlAst, ISqlAstValidator } from './value-objects/SqlStatement.js';
export { RiskScore } from './value-objects/RiskScore.js';
export { ExecutionPolicy } from './value-objects/ExecutionPolicy.js';

// Domain Events
export { ChangeSubmitted } from './domain-events/ChangeSubmitted.js';
export { ChangeApproved } from './domain-events/ChangeApproved.js';
export { ChangeExecuted } from './domain-events/ChangeExecuted.js';
export { ChangeReverted } from './domain-events/ChangeReverted.js';

// Domain Services
export { RiskScorer } from './services/RiskScorer.js';
export { PolicyEvaluator, evaluatePolicy } from './services/PolicyEvaluator.js';

// Repository Interfaces
export type { IChangeRequestRepository } from './repositories/IChangeRequestRepository.js';
export type { IBackupSnapshotRepository } from './repositories/IBackupSnapshotRepository.js';
