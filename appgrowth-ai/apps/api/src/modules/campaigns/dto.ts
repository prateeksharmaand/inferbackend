import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { AdProvider, CampaignStatus, Platform } from '@prisma/client';
import { PageQuery } from '../../common/pagination';

const MONEY = /^\d{1,10}(\.\d{1,2})?$/; const DATE = /^\d{4}-\d{2}-\d{2}$/;
export class CreateCampaignDto {
  @ApiProperty() @IsUUID() applicationId: string;
  @ApiProperty({ enum: AdProvider }) @IsEnum(AdProvider) provider: AdProvider;
  @ApiProperty({ enum: Platform }) @IsEnum(Platform) platform: Platform;
  @ApiPropertyOptional() @IsOptional() @IsUUID() connectedAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() strategyId?: string;
  @ApiProperty() @IsString() @Length(3, 120) name: string;
  @ApiPropertyOptional({ enum: ['installs', 'in_app_actions', 'value'] }) @IsOptional() @IsIn(['installs', 'in_app_actions', 'value']) objective?: 'installs' | 'in_app_actions' | 'value';
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(60) @Matches(/^[A-Z]{2}$/, { each: true }) countries: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @Matches(/^[a-z]{2,3}(-[A-Z]{2})?$/, { each: true }) languages?: string[];
  @ApiProperty({ example: '5000.00' }) @Matches(MONEY) dailyBudget: string;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY) monthlyBudget?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY) targetCpi?: string;
  @ApiProperty({ example: '2026-12-01' }) @Matches(DATE) startDate: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE) endDate?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(30) @IsUUID('all', { each: true }) creativeIds?: string[];
}
export class UpdateCampaignDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3, 120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() connectedAccountId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(60) @Matches(/^[A-Z]{2}$/, { each: true }) countries?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @Matches(/^[a-z]{2,3}(-[A-Z]{2})?$/, { each: true }) languages?: string[];
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY) dailyBudget?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY) monthlyBudget?: string | null;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY) targetCpi?: string | null;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE) startDate?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE) endDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() automationEnabled?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(30) @IsUUID('all', { each: true }) creativeIds?: string[];
}
export class CampaignQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() applicationId?: string;
  @ApiPropertyOptional({ enum: AdProvider }) @IsOptional() @IsEnum(AdProvider) provider?: AdProvider;
  @ApiPropertyOptional({ enum: Platform }) @IsOptional() @IsEnum(Platform) platform?: Platform;
  @ApiPropertyOptional({ enum: CampaignStatus }) @IsOptional() @IsEnum(CampaignStatus) status?: CampaignStatus;
}
export class ReasonDto { @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string; }
