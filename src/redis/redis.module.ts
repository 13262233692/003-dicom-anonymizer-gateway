import { Module, Global, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import configuration from '@common/config/configuration';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: ConfigType<typeof configuration>) => {
        const logger = new Logger('RedisModule');
        const client = new Redis({
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db,
          keyPrefix: config.redis.keyPrefix,
          lazyConnect: true,
          maxRetriesPerRequest: 3,
          enableReadyCheck: false,
          retryStrategy: (times) => {
            const delay = Math.min(times * 200, 2000);
            logger.warn(`Redis connection retry ${times}, delay ${delay}ms`);
            return delay;
          },
        });

        client.on('connect', () => {
          logger.log(`Redis connected to ${config.redis.host}:${config.redis.port}`);
        });

        client.on('error', (error) => {
          logger.error(`Redis error: ${error.message}`);
        });

        client.on('close', () => {
          logger.warn('Redis connection closed');
        });

        client.connect().catch((error) => {
          logger.error(`Failed to connect to Redis: ${error.message}`);
        });

        return client;
      },
      inject: [configuration.KEY],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis) {}

  onModuleInit() {
    // Connection handled in factory
  }

  onModuleDestroy() {
    this.redisClient.quit();
  }
}
