import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { NegociosModule } from './business/business.module';
import { ProductosModule } from './products/products.module';
import { CategoriasModule } from './categories/categories.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: config.get<string>('NODE_ENV') !== 'production' && !config.get<string>('VERCEL'),
        extra: { max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 },
      }),
    }),
    AuthModule,
    NegociosModule,
    ProductosModule,
    CategoriasModule,
  ],
})
export class AppModule {}
