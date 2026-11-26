import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Max, Min } from 'class-validator';
import { AdProvider, ApprovalStatus, CreativeType } from '@prisma/client';
import { PageQuery } from '../../common/pagination';

const TEXT_TYPES = ['AD_COPY', 'HEADLINE', 'DESCRIPTION', 'VIDEO_SCRIPT', 'SOCIAL_POST', 'BANNER', 'SCREENSHOT_CONCEPT', 'IMAGE'] as const;
export class GenerateDto {
  @ApiProperty() @IsUUID() applicationId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() campaignId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) projectName?: string;
  @ApiProperty({ enum: AdProvider }) @IsEnum(AdProvider) channel: AdProvider;
  @ApiProperty({ enum: TEXT_TYPES, isArray: true }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @IsIn(TEXT_TYPES as unknown as string[], { each: true }) types: string[];
  @ApiPropertyOptional({ default: 3 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(6) variantsPerType?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) brief?: string;
  @ApiPropertyOptional({ example: 'en' }) @IsOptional() @IsString() @MaxLength(10) language?: string;
}
export class CreativeQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() applicationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() campaignId?: string;
  @ApiPropertyOptional({ enum: CreativeType }) @IsOptional() @IsEnum(CreativeType) type?: CreativeType;
  @ApiPropertyOptional({ enum: ApprovalStatus }) @IsOptional() @IsEnum(ApprovalStatus) approvalStatus?: ApprovalStatus;
}
export class EditDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) headline?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) body?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) call_to_action?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) image_prompt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(6000) video_script?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) title?: string;
}
export class DecisionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) comment?: string;
  @ApiPropertyOptional({ description: 'Required to approve a creative with policy flags' }) @IsOptional() @IsBoolean() acknowledgeFlags?: boolean;
}
export class MediaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) prompt?: string;
  @ApiPropertyOptional({ enum: ['1024x1024', '1080x1920', '1200x628'] }) @IsOptional() @IsIn(['1024x1024', '1080x1920', '1200x628']) size?: string;
}
