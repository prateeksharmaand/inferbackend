import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class AndroidInput {
  @ApiPropertyOptional({ example: 'com.example.app' }) @IsOptional() @Matches(/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/, { message: 'Invalid Android package name' }) packageName?: string;
  @ApiPropertyOptional({ example: 'https://play.google.com/store/apps/details?id=com.example.app' }) @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) storeUrl?: string;
}
export class IosInput {
  @ApiPropertyOptional({ example: 'com.example.app' }) @IsOptional() @Matches(/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/, { message: 'Invalid iOS bundle identifier' }) bundleId?: string;
  @ApiPropertyOptional({ example: 'https://apps.apple.com/in/app/example/id1234567890' }) @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) storeUrl?: string;
}
export class CreateAppDto {
  @ApiProperty() @IsString() @Length(2, 120) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(8000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) targetAudience?: string;
  @ApiPropertyOptional({ default: 10000 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100_000_000) monthlyInstallTarget?: number;
  @ApiPropertyOptional({ description: 'Target cost per install in major units, e.g. "25.00"' }) @IsOptional() @Matches(/^\d{1,8}(\.\d{1,2})?$/) targetCpi?: string;
  @ApiPropertyOptional({ type: [String], example: ['IN', 'AE'] }) @IsOptional() @IsArray() @ArrayMaxSize(60) @Matches(/^[A-Z]{2}$/, { each: true }) countries?: string[];
  @ApiPropertyOptional({ type: [String], example: ['en', 'hi'] }) @IsOptional() @IsArray() @ArrayMaxSize(40) @Matches(/^[a-z]{2,3}(-[A-Z]{2})?$/, { each: true }) languages?: string[];
  @ApiPropertyOptional({ type: AndroidInput }) @IsOptional() @ValidateNested() @Type(() => AndroidInput) android?: AndroidInput;
  @ApiPropertyOptional({ type: IosInput }) @IsOptional() @ValidateNested() @Type(() => IosInput) ios?: IosInput;
  @ApiPropertyOptional({ default: true, description: 'Run the onboarding workflow (research, ASO, strategy) after creating' }) @IsOptional() @IsBoolean() runOnboarding?: boolean;
}
export class UpdateAppDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(8000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) targetAudience?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100_000_000) monthlyInstallTarget?: number;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{1,8}(\.\d{1,2})?$/) targetCpi?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(60) @Matches(/^[A-Z]{2}$/, { each: true }) countries?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(40) @Matches(/^[a-z]{2,3}(-[A-Z]{2})?$/, { each: true }) languages?: string[];
  @ApiPropertyOptional({ type: AndroidInput }) @IsOptional() @ValidateNested() @Type(() => AndroidInput) android?: AndroidInput;
  @ApiPropertyOptional({ type: IosInput }) @IsOptional() @ValidateNested() @Type(() => IosInput) ios?: IosInput;
  @ApiPropertyOptional({ enum: ['active', 'paused'] }) @IsOptional() @IsIn(['active', 'paused']) status?: 'active' | 'paused';
}
export class AppListQuery extends PageQuery {
  @ApiPropertyOptional({ enum: ['ANDROID', 'IOS'] }) @IsOptional() @IsIn(['ANDROID', 'IOS']) platform?: 'ANDROID' | 'IOS';
}
export class LookupDto { @ApiProperty() @IsUrl({ protocols: ['https'], require_protocol: true }) url: string; }
export class TargetDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(100_000_000) installs: number;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{1,8}(\.\d{1,2})?$/) targetCpi?: string;
}
export class PlayCredentialsDto { @ApiProperty({ description: 'Google service account JSON with access to this app in Play Console' }) @IsString() @Length(50, 20000) serviceAccountJson: string; }
export class AssetQuery { @ApiProperty({ enum: ['icon', 'screenshot', 'logo', 'video'] }) @IsIn(['icon', 'screenshot', 'logo', 'video']) kind: 'icon' | 'screenshot' | 'logo' | 'video'; }
