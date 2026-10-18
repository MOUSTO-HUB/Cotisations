import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { PERIODICITIES, type Periodicity } from '../../common/calendar';
import { AMOUNT_MESSAGE, AMOUNT_PATTERN } from '../../common/money';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'La date doit être au format AAAA-MM-JJ.';

export class CreatePlanDto {
  /** Ex. « Cotisation mensuelle 2027 », « Décès de Elhadj Bah ». */
  @IsString()
  @Length(2, 100)
  name!: string;

  /** Montant par membre et par échéance. */
  @Matches(AMOUNT_PATTERN, { message: AMOUNT_MESSAGE })
  amount!: string;

  /** Absent = cotisation ponctuelle (une seule échéance à startDate). */
  @IsOptional()
  @IsIn(PERIODICITIES)
  periodicity?: Periodicity;

  @ValidateIf((o: CreatePlanDto) => o.periodicity === 'CUSTOM_DAYS')
  @IsInt()
  @Min(1)
  @Max(366)
  intervalDays?: number;

  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  startDate!: string;

  /** Obligatoire pour une cotisation récurrente. */
  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  endDate?: string;

  /** Caisse qui reçoit l'argent ; par défaut la caisse générale. */
  @IsOptional()
  @IsUUID()
  cashboxId?: string;

  /** Membres concernés ; par défaut tous les membres actifs. */
  @IsOptional()
  @IsUUID('all', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  membershipIds?: string[];
}
