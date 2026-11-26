import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { Platform } from '@prisma/client';
import { PageQuery } from '../../common/pagination';

export class AppTargetDto {
  @ApiProperty() @IsUUID() applicationId: string;
  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @IsString() @MaxLength(2000) instructions?: string;
}
export class StrategyRequestDto extends AppTargetDto { @ApiPropertyOptional({ example: '2026-12' }) @IsOptional() @Matches(/^\d{4}-\d{2}$/) month?: string; }
export class AgentRunDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() applicationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() campaignId?: string;
  @ApiPropertyOptional({ enum: Platform }) @IsOptional() @IsEnum(Platform) platform?: Platform;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) instructions?: string;
}
export class ExecQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() agentKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() applicationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'AWAITING_REVIEW']) status?: string;
}
export class DecideDto { @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) comment?: string; }

export class ProviderUpdateDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional({ description: 'Stored encrypted; send empty string to clear and fall back to the server environment' }) @IsOptional() @IsString() @MaxLength(500) apiKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) baseUrl?: string;
}
export class ModelDto {
  @ApiProperty() @IsString() @Length(2, 120) modelId: string;
  @ApiProperty({ enum: ['text', 'image', 'video'] }) @IsIn(['text', 'image', 'video']) purpose: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) inputCostPerMTok?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) outputCostPerMTok?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitCost?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}
export class AgentUpdateDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional({ description: 'Cron in UTC; empty clears' }) @IsOptional() @IsString() @MaxLength(60) schedule?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(900) timeoutSec?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(5) maxRetries?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) providerKey?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) modelId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() manualReview?: boolean;
}
