import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PageQuery {
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 25, maximum: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}
export const paged = <T>(items: T[], total: number, q: { page: number; pageSize: number }) => ({
  items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
});
export const skipTake = (q: { page: number; pageSize: number }) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });
