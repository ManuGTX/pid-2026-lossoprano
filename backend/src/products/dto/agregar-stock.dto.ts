import { IsInt, Max, Min } from 'class-validator';

export class AgregarStockDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  cantidad: number;
}
