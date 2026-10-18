import { SolidarityReason } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { AMOUNT_MESSAGE, AMOUNT_PATTERN } from '../../common/money';

export class OpenCampaignDto {
  /** Ex. « Famille de Mamadou Bah ». */
  @IsString()
  @Length(2, 100)
  beneficiaryName!: string;

  /** Si le bénéficiaire est membre du groupe. */
  @IsOptional()
  @IsUUID()
  beneficiaryMembershipId?: string;

  /** Motif général : HEALTH (raison de santé), DEATH, DISASTER, OTHER. */
  @IsEnum(SolidarityReason)
  reasonCategory!: SolidarityReason;

  /**
   * Précision facultative, affichée à tous : jamais de diagnostic médical
   * (ex. « Hospitalisation à Donka », pas la maladie).
   */
  @IsOptional()
  @IsString()
  @Length(3, 120)
  reasonNote?: string;

  @Matches(AMOUNT_PATTERN, { message: AMOUNT_MESSAGE })
  targetAmount!: string;

  /** Montant suggéré par membre ; obligatoire si la collecte est obligatoire. */
  @IsOptional()
  @Matches(AMOUNT_PATTERN, { message: AMOUNT_MESSAGE })
  suggestedAmount?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La date doit être au format AAAA-MM-JJ.',
  })
  deadline!: string;

  /** RG-S4 : cotisation obligatoire si le règlement le prévoit (ex. décès). */
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;
}

export const CAMPAIGN_SURPLUS = ['SOLIDARITY_FUND', 'BENEFICIARY'] as const;

export class CloseCampaignDto {
  /** RG-S3 : l'excédent va au fonds de solidarité ou reste pour le bénéficiaire. */
  @IsIn(CAMPAIGN_SURPLUS)
  surplusTo!: (typeof CAMPAIGN_SURPLUS)[number];
}
