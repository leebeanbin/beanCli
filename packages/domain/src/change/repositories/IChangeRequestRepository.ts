import type { ChangeRequestStatus } from '@tfsdc/kernel';
import type { ChangeRequest } from '../entities/ChangeRequest.js';
import type { ChangeId } from '../value-objects/ChangeId.js';

export interface IChangeRequestRepository {
  save(changeRequest: ChangeRequest): Promise<void>;
  findById(id: ChangeId): Promise<ChangeRequest | null>;
  findByStatus(status: ChangeRequestStatus): Promise<ChangeRequest[]>;
  findPendingApproval(): Promise<ChangeRequest[]>;
}
