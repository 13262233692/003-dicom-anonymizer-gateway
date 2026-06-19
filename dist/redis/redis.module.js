"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisModule = exports.REDIS_CLIENT = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
const configuration_1 = __importDefault(require("../common/config/configuration"));
exports.REDIS_CLIENT = 'REDIS_CLIENT';
let RedisModule = class RedisModule {
    constructor(redisClient) {
        this.redisClient = redisClient;
    }
    onModuleInit() {
    }
    onModuleDestroy() {
        this.redisClient.quit();
    }
};
exports.RedisModule = RedisModule;
exports.RedisModule = RedisModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            {
                provide: exports.REDIS_CLIENT,
                useFactory: (config) => {
                    const logger = new common_1.Logger('RedisModule');
                    const client = new ioredis_1.default({
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
                inject: [configuration_1.default.KEY],
            },
        ],
        exports: [exports.REDIS_CLIENT],
    }),
    __param(0, (0, common_1.Inject)(exports.REDIS_CLIENT)),
    __metadata("design:paramtypes", [ioredis_1.default])
], RedisModule);
//# sourceMappingURL=redis.module.js.map