import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, ValidateNested } from 'class-validator';

export class AppleConnectDto {
  @ApiProperty() @IsString() @Matches(/^SEARCHADS\.[A-Za-z0-9-]+$/, { message: 'Client id looks like SEARCHADS.xxxx' }) clientId: string;
  @ApiProperty() @IsString() @Matches(/^SEARCHADS\.[A-Za-z0-9-]+$/, { message: 'Team id looks like SEARCHADS.xxxx' }) teamId: string;
  @ApiProperty() @IsString() @Length(8, 64) keyId: string;
}
export class AppLink { @ApiProperty() @IsUUID() applicationId: string; @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) externalAppId?: string; }
export class MapAppsDto { @ApiProperty({ type: [AppLink] }) @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => AppLink) links: AppLink[]; }
export class AutomationDto { @ApiProperty() @IsBoolean() enabled: boolean; }
