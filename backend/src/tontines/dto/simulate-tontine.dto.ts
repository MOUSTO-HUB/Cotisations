import { IsIn, IsInt, Matches, Max, Min, ValidateIf } from 'class-validator';
import {
  MAX_SHARES,
  MIN_SHARES,
  PERIODICITIES,
  type Periodicity,
} from '../domain/tontine-schedule';

export class SimulateTontineDto {
  /** Montant par membre et par période, en chaîne pour ne pas perdre de précision (ex. "500000"). */
  @Matches(/^[1-9]\d{0,17}$/, {
    message: 'contributionAmount doit être un entier positif, en chaîne.',
  })
  contributionAmount!: string;

  @IsInt()
  @Min(MIN_SHARES)
  @Max(MAX_SHARES)
  shareCount!: number;

  @IsIn(PERIODICITIES)
  periodicity!: Periodicity;

  @ValidateIf((o: SimulateTontineDto) => o.periodicity === 'CUSTOM_DAYS')
  @IsInt()
  @Min(1)
  @Max(366)
  intervalDays?: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate doit être au format AAAA-MM-JJ.',
  })
  startDate!: string;
}
