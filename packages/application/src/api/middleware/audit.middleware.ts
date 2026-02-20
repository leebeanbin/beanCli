import type { IAuditWriter } from '../types.js';
import { randomUUID } from 'crypto';

export interface AuditableRequest {
  method: string;
  url: string;
  actor: string;
  correlationId?: string;
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function shouldAudit(method: string): boolean {
  return WRITE_METHODS.has(method);
}

export async function writeAuditLog(
  req: AuditableRequest,
  statusCode: number,
  auditWriter: IAuditWriter,
): Promise<void> {
  if (!shouldAudit(req.method)) return;

  await auditWriter.write({
    category: 'CHANGE',
    actor: req.actor,
    action: `${req.method}:${req.url}`,
    resource: req.url,
    result: statusCode < 400 ? 'SUCCESS' : 'FAILURE',
    correlationId: req.correlationId ?? randomUUID(),
  });
}
