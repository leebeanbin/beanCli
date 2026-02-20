import type { SqlOperation, Environment, RiskLevel } from '@tfsdc/kernel';
import { RiskScore } from '../value-objects/RiskScore.js';
import type { SqlAst } from '../value-objects/SqlStatement.js';

const BASE_SCORES: Record<SqlOperation, number> = {
  SELECT: 0,
  INSERT: 20,
  UPDATE: 40,
  DELETE: 60,
};

export class RiskScorer {
  score(params: {
    ast: SqlAst;
    environment: Environment;
    affectedRowsEstimate: number;
  }): RiskScore {
    let points = BASE_SCORES[params.ast.operation] ?? 0;

    if (params.affectedRowsEstimate >= 1_000) points += 30;
    if (params.affectedRowsEstimate >= 10_000) points += 20;
    if (params.environment === 'PROD') points += 10;

    points = Math.min(100, Math.max(0, points));

    const level: RiskLevel = points <= 30 ? 'L0' : points <= 60 ? 'L1' : 'L2';

    return RiskScore.of(points, level, params.affectedRowsEstimate);
  }
}
