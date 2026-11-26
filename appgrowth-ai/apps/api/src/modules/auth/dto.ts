import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

const STRONG = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,128}$/;
const STRONG_MSG = 'Password must be 10–128 characters with upper and lower case letters and a number';

export class RegisterDto {
  @ApiProperty() @IsString() @Length(2, 80) name: string;
  @ApiProperty() @IsEmail() @MaxLength(254) email: string;
  @ApiProperty() @IsString() @Matches(STRONG, { message: STRONG_MSG }) password: string;
  @ApiProperty() @IsString() @Length(2, 120) organizationName: string;
}
export class LoginDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MaxLength(128) password: string;
  @ApiProperty({ required: false, description: '6-digit TOTP when MFA is enabled' }) @IsOptional() @IsString() @Length(6, 6) mfaCode?: string;
}
export class RefreshDto {
  @ApiProperty({ required: false, description: 'API clients send the refresh token here; the web app uses the cookie' }) @IsOptional() @IsString() refreshToken?: string;
}
export class ForgotDto { @ApiProperty() @IsEmail() email: string; }
export class ResetDto {
  @ApiProperty() @IsString() @Length(20, 200) token: string;
  @ApiProperty() @IsString() @Matches(STRONG, { message: STRONG_MSG }) password: string;
}
export class MfaCodeDto { @ApiProperty() @IsString() @Matches(/^\d{6}$/) code: string; }
export class AcceptInviteDto {
  @ApiProperty() @IsString() @Length(20, 200) token: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @Length(2, 80) name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @Matches(STRONG, { message: STRONG_MSG }) password?: string;
}
