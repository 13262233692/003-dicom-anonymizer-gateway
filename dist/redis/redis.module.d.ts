import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
export declare const REDIS_CLIENT = "REDIS_CLIENT";
export declare class RedisModule implements OnModuleInit, OnModuleDestroy {
    private readonly redisClient;
    constructor(redisClient: Redis);
    onModuleInit(): void;
    onModuleDestroy(): void;
}
