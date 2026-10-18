import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { AMOUNT_MESSAGE, AMOUNT_PATTERN } from '../../common/money';
import {
  MAX_GRACE_DAYS,
  PENALTY_MODES,
  type PenaltyMode,
} from '../domain/group-rules';

export class UpdateRulesDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_GRACE_DAYS)
  graceDays?: number;

  @IsOptional()
  @Matches(AMOUNT_PATTERN, { message: AMOUNT_MESSAGE })
  expenseApprovalThreshold?: string;

  /** RG-P2 : NONE, FIXED (montant) ou PERCENT (pourcentage de l'échéance). */
  @IsOptional()
  @IsIn(PENALTY_MODES)
  penaltyMode?: PenaltyMode;

  /** Montant de la pénalité (FIXED) ou pourcentage de 1 à 100 (PERCENT). */
  @IsOptional()
  @Matches(AMOUNT_PATTERN, { message: AMOUNT_MESSAGE })
  penaltyValue?: string;

  /** RG-P3 : nombre de retards qui déclenche une alerte au bureau. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  lateAlertThreshold?: number;
}
