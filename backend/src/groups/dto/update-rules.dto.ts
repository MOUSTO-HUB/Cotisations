import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { AMOUNT_MESSAGE, AMOUNT_PATTERN } from '../../common/money';
import { MAX_GRACE_DAYS } from '../domain/group-rules';

export class UpdateRulesDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_GRACE_DAYS)
  graceDays?: number;

  @IsOptional()
  @Matches(AMOUNT_PATTERN, { message: AMOUNT_MESSAGE })
  expenseApprovalThreshold?: string;
}
