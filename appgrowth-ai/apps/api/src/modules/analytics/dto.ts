import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { AdProvider, Platform } from '@prisma/client';

export class AnalyticsQuery {
  @ApiPropertyOptional({ example: '2026-11-01' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @ApiPropertyOptional({ example: '2026-11-30' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() applicationId?: string;
  @ApiPropertyOptional({ enum: Platform }) @IsOptional() @IsEnum(Platform) platform?: Platform;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{2}$/) country?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() campaignId?: string;
  @ApiPropertyOptional({ enum: AdProvider, description: 'Acquisition channel' }) @IsOptional() @IsEnum(AdProvider) channel?: AdProvider;
}
