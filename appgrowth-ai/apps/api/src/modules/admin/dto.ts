import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class OrgListQuery extends PageQuery {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'SUSPENDED', 'CLOSED'] }) @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED', 'CLOSED']) status?: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
}
export class SuspendDto { @ApiProperty() @IsString() @Length(3, 500) reason: string; }
export class AuditQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @Type(() => Boolean) @IsBoolean() securityOnly?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) action?: string;
}
export class PlanUpdateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 60) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{1,10}(\.\d{1,2})?$/) price?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) trialDays?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) maxApps?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) maxMembers?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) maxAdAccounts?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) aiGenerationsMonth?: number;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{1,15}$/) aiTokensMonth?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublic?: boolean;
}
export class AssignPlanDto { @ApiProperty() @IsString() planKey: string; }
export class FlagDto { @ApiProperty() @IsBoolean() enabled: boolean; }
