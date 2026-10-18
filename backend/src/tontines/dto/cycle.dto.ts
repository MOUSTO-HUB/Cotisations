import { Type } from 'class-transformer';
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
  ValidateNested,
} from 'class-validator';
import { AMOUNT_MESSAGE, AMOUNT_PATTERN } from '../../common/money';
import { PERIODICITIES, type Periodicity } from '../domain/tontine-schedule';
import { MAX_PARTS_PER_MEMBER } from '../domain/tontine-rounds';

export const ORDER_MODES = ['FIXED', 'DRAW'] as const;

export class CreateCycleDto {
  /** Ex. « Tontine du marché Madina 2027 ». */
  @IsString()
  @Length(2, 100)
  name!: string;

  /** Montant versé par part et par période. */
  @Matches(AMOUNT_PATTERN, { message: AMOUNT_MESSAGE })
  contributionAmount!: string;

  @IsIn(PERIODICITIES)
  periodicity!: Periodicity;

  @ValidateIf((o: CreateCycleDto) => o.periodicity === 'CUSTOM_DAYS')
  @IsInt()
  @Min(1)
  @Max(366)
  intervalDays?: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La date doit être au format AAAA-MM-JJ.',
  })
  startDate!: string;

  /** FIXED : ordre fixé par le président ; DRAW : tirage au sort (RG-T4). */
  @IsIn(ORDER_MODES)
  orderMode!: (typeof ORDER_MODES)[number];
}

export class ShareInputDto {
  @IsUUID()
  membershipId!: string;

  /** Nombre de parts détenues par ce membre (1 par défaut). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PARTS_PER_MEMBER)
  parts?: number;
}

export class SetSharesDto {
  @ValidateNested({ each: true })
  @Type(() => ShareInputDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  members!: ShareInputDto[];
}

export class SetOrderDto {
  /** Identifiants des parts, dans l'ordre où elles reçoivent le pot. */
  @IsUUID('all', { each: true })
  @ArrayMinSize(2)
  @ArrayMaxSize(100)
  shareIds!: string[];
}

export class RoundPaymentDto {
  @IsUUID()
  membershipId!: string;

  /** Par défaut : tout ce que le membre doit pour ce tour (toutes ses parts). */
  @IsOptional()
  @Matches(AMOUNT_PATTERN, { message: AMOUNT_MESSAGE })
  amount?: string;

  @IsString()
  @Length(8, 100)
  idempotencyKey!: string;
}

export class RequestSwapDto {
  /** Mon tour (dont je suis le bénéficiaire). */
  @IsInt()
  @Min(1)
  myRound!: number;

  /** Le tour que je voudrais prendre. */
  @IsInt()
  @Min(1)
  otherRound!: number;
}

export class DecideSwapDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';
}
