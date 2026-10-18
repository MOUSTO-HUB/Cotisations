import {
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateVoteDto {
  /** Ex. « Quel projet financer en priorité cette année ? » */
  @IsString()
  @Length(3, 300)
  question!: string;

  @IsString({ each: true })
  @Length(1, 100, { each: true })
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  options!: string[];

  /** Participation minimale, en % des membres actifs (50 par défaut). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  quorumPercent?: number;

  /** Date et heure de clôture (ISO 8601, ex. 2027-03-01T18:00:00Z). */
  @IsISO8601({ strict: true })
  closesAt!: string;
}

export class ProjectVoteDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  quorumPercent?: number;

  @IsISO8601({ strict: true })
  closesAt!: string;
}

export class CastBallotDto {
  /** Indice de l'option choisie (0 pour la première). */
  @IsInt()
  @Min(0)
  @Max(9)
  optionIndex!: number;
}
