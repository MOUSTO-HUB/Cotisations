import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PERIODICITIES, type Periodicity } from '../../common/calendar';
import { AMOUNT_MESSAGE, AMOUNT_PATTERN } from '../../common/money';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'La date doit être au format AAAA-MM-JJ.';
/** Montant pouvant être nul (fonds affectés, subventions). */
const AMOUNT_OR_ZERO = /^(0|[1-9]\d{0,17})$/;

export class CreateProjectDto {
  /** Ex. « Puits du quartier Kaporo ». */
  @IsString()
  @Length(3, 120)
  title!: string;

  @IsString()
  @Length(3, 2000)
  description!: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  deadline?: string;
}

export class BudgetLineDto {
  /** Ex. « Ciment », « Main-d'œuvre », « Transport », « Imprévus ». */
  @IsString()
  @Length(2, 100)
  label!: string;

  @Matches(AMOUNT_PATTERN, { message: AMOUNT_MESSAGE })
  amount!: string;
}

export class SetBudgetDto {
  @ValidateNested({ each: true })
  @Type(() => BudgetLineDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  lines!: BudgetLineDto[];

  /** Fonds déjà en caisse affectés au projet (à déduire de l'objectif). */
  @IsOptional()
  @Matches(AMOUNT_OR_ZERO, { message: AMOUNT_MESSAGE })
  allocatedFunds?: string;

  /** Subventions ou dons annoncés (à déduire de l'objectif). */
  @IsOptional()
  @Matches(AMOUNT_OR_ZERO, { message: AMOUNT_MESSAGE })
  subsidies?: string;
}

export const COLLECTION_MODES = ['PER_MEMBER', 'FREE'] as const;

export class OpenCollectionDto {
  /** PER_MEMBER : une part par membre ; FREE : contributions libres (dons). */
  @IsIn(COLLECTION_MODES)
  mode!: (typeof COLLECTION_MODES)[number];

  /** Part par membre ; par défaut objectif ÷ nombre de membres actifs. */
  @IsOptional()
  @Matches(AMOUNT_PATTERN, { message: AMOUNT_MESSAGE })
  amountPerMember?: string;

  /** Nombre de versements (ex. 3 versements mensuels). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  installments?: number;

  @IsOptional()
  @IsIn(PERIODICITIES)
  periodicity?: Periodicity;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(366)
  intervalDays?: number;

  /** Date du premier versement (obligatoire en mode PER_MEMBER). */
  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  firstDueDate?: string;

  /** Membres concernés ; par défaut tous les membres actifs. */
  @IsOptional()
  @IsUUID('all', { each: true })
  @ArrayMinSize(1)
  membershipIds?: string[];
}

export class ProjectUpdateDto {
  /** Ex. « Fondations terminées ». */
  @IsString()
  @Length(2, 120)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  note?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  photoUrl?: string;
}

export const SURPLUS_DESTINATIONS = ['GENERAL', 'KEEP'] as const;

export class CompleteProjectDto {
  /** RG-D4 : par défaut, le reliquat retourne à la caisse générale. */
  @IsOptional()
  @IsIn(SURPLUS_DESTINATIONS)
  surplus?: (typeof SURPLUS_DESTINATIONS)[number];
}
