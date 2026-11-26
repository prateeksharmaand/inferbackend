import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsOptional, IsUUID, Matches, Max, Min, ValidateNested } from 'class-validator';
import { AdProvider, Platform } from '@prisma/client';

const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
export class AllocationDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() applicationId?: string;
  @ApiPropertyOptional({ enum: AdProvider }) @IsOptional() @IsEnum(AdProvider) provider?: AdProvider;
  @ApiPropertyOptional({ enum: Platform }) @IsOptional() @IsEnum(Platform) platform?: Platform;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{2}$/) country?: string;
  @ApiProperty({ example: '50000.00' }) @Matches(MONEY) limit: string;
}
export class CreateBudgetDto {
  @ApiProperty({ example: '2026-12' }) @Matches(/^\d{4}-\d{2}$/) month: string;
  @ApiProperty({ example: '300000.00' }) @Matches(MONEY) monthlyLimit: string;
  @ApiPropertyOptional({ example: '12000.00' }) @IsOptional() @Matches(MONEY) dailyLimit?: string;
  @ApiPropertyOptional({ type: [Number], example: [50, 75, 90] }) @IsOptional() @IsArray() @ArrayMaxSize(6) @Type(() => Number) @IsInt({ each: true }) @Min(1, { each: true }) @Max(100, { each: true }) alertThresholds?: number[];
  @ApiPropertyOptional({ type: [AllocationDto] }) @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => AllocationDto) allocations?: AllocationDto[];
}
export class UpdateBudgetDto {
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY) monthlyLimit?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY) dailyLimit?: string | null;
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() @ArrayMaxSize(6) @Type(() => Number) @IsInt({ each: true }) @Min(1, { each: true }) @Max(100, { each: true }) alertThresholds?: number[];
  @ApiPropertyOptional({ type: [AllocationDto] }) @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => AllocationDto) allocations?: AllocationDto[];
}
export class MonthQuery { @ApiPropertyOptional({ example: '2026-12' }) @IsOptional() @Matches(/^\d{4}-\d{2}$/) month?: string; }
