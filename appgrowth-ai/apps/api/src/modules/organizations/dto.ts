import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { AdProvider, AutonomyLevel } from '@prisma/client';

export class CreateOrgDto {
  @ApiProperty() @IsString() @Length(2, 120) name: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{2}$/) country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) timezone?: string;
}
export class UpdateOrgDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 120) name?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{2}$/) country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) timezone?: string;
}
export class BrandKitDto {
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(8) @Matches(/^#[0-9a-fA-F]{6}$/, { each: true }) colors?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) voice?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(8000) guidelines?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(200, { each: true }) bannedClaims?: string[];
}
export class InviteDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty({ enum: ['admin', 'marketer', 'analyst', 'viewer'] }) @IsIn(['admin', 'marketer', 'analyst', 'viewer']) role: string;
}
export class ChangeRoleDto {
  @ApiProperty({ enum: ['owner', 'admin', 'marketer', 'analyst', 'viewer'] }) @IsIn(['owner', 'admin', 'marketer', 'analyst', 'viewer']) role: string;
}
export class PolicyDto {
  @ApiPropertyOptional({ enum: AutonomyLevel }) @IsOptional() @IsEnum(AutonomyLevel) autonomyLevel?: AutonomyLevel;
  @ApiPropertyOptional({ description: 'Major units, e.g. "5000.00"; null clears' }) @IsOptional() @Matches(/^\d{1,12}(\.\d{1,2})?$/) maxDailySpend?: string | null;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{1,12}(\.\d{1,2})?$/) maxMonthlySpend?: string | null;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{1,12}(\.\d{1,2})?$/) maxCampaignBudget?: string | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) maxBudgetIncreasePct?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) maxConcurrentCampaigns?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(50) reservePct?: number;
  @ApiPropertyOptional({ enum: AdProvider, isArray: true }) @IsOptional() @IsArray() @IsEnum(AdProvider, { each: true }) allowedProviders?: AdProvider[];
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @Min(1) @Max(10) autoPauseOnCpiMultiple?: number;
}
export class AutomationSwitchDto {
  @ApiProperty() @IsBoolean() enabled: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
