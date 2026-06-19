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
var RedisRuleService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisRuleService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
const uuid_1 = require("uuid");
const dayjs_1 = __importDefault(require("dayjs"));
const redis_module_1 = require("./redis.module");
const anonymization_types_1 = require("../common/types/anonymization.types");
const custom_exceptions_1 = require("../common/exceptions/custom.exceptions");
let RedisRuleService = RedisRuleService_1 = class RedisRuleService {
    constructor(redis) {
        this.redis = redis;
        this.logger = new common_1.Logger(RedisRuleService_1.name);
        this.ANONYMIZATION_RULES_KEY = 'anonymization:rules';
        this.ROUTING_TARGETS_KEY = 'routing:targets';
        this.HOSPITAL_RULE_INDEX_KEY = 'hospital:rule:index';
        this.HOSPITAL_ROUTING_INDEX_KEY = 'hospital:routing:index';
    }
    async getAnonymizationRule(hospitalId) {
        const indexKey = `${this.HOSPITAL_RULE_INDEX_KEY}:${hospitalId}`;
        const ruleIds = await this.retryRedis(() => this.redis.zrevrange(indexKey, 0, -1));
        for (const ruleId of ruleIds) {
            const ruleKey = `${this.ANONYMIZATION_RULES_KEY}:${ruleId}`;
            const ruleData = await this.retryRedis(() => this.redis.get(ruleKey));
            if (ruleData) {
                try {
                    const rule = JSON.parse(ruleData);
                    if (rule.enabled && rule.hospitalId === hospitalId) {
                        this.logger.debug(`Loaded anonymization rule ${rule.id} for hospital ${hospitalId}`);
                        return rule;
                    }
                }
                catch (error) {
                    this.logger.error(`Failed to parse rule ${ruleId}: ${error.message}`);
                }
            }
        }
        return this.getDefaultRule(hospitalId);
    }
    async saveAnonymizationRule(rule) {
        const ruleId = (0, uuid_1.v4)();
        const now = (0, dayjs_1.default)().toISOString();
        const fullRule = {
            ...rule,
            id: ruleId,
            createdAt: now,
            updatedAt: now,
        };
        const ruleKey = `${this.ANONYMIZATION_RULES_KEY}:${ruleId}`;
        await this.retryRedis(() => this.redis.set(ruleKey, JSON.stringify(fullRule)));
        const indexKey = `${this.HOSPITAL_RULE_INDEX_KEY}:${rule.hospitalId}`;
        await this.retryRedis(() => this.redis.zadd(indexKey, fullRule.priority, ruleId));
        this.logger.log(`Saved anonymization rule ${ruleId} for hospital ${rule.hospitalId}`);
        return fullRule;
    }
    async updateAnonymizationRule(ruleId, updates) {
        const ruleKey = `${this.ANONYMIZATION_RULES_KEY}:${ruleId}`;
        const existingData = await this.retryRedis(() => this.redis.get(ruleKey));
        if (!existingData) {
            throw new custom_exceptions_1.AnonymizationRuleException(`Rule not found: ${ruleId}`, ruleId);
        }
        const existing = JSON.parse(existingData);
        const updated = {
            ...existing,
            ...updates,
            id: ruleId,
            updatedAt: (0, dayjs_1.default)().toISOString(),
        };
        await this.retryRedis(() => this.redis.set(ruleKey, JSON.stringify(updated)));
        this.logger.log(`Updated anonymization rule ${ruleId}`);
        return updated;
    }
    async deleteAnonymizationRule(ruleId, hospitalId) {
        const ruleKey = `${this.ANONYMIZATION_RULES_KEY}:${ruleId}`;
        const indexKey = `${this.HOSPITAL_RULE_INDEX_KEY}:${hospitalId}`;
        const deleted = await this.retryRedis(() => this.redis.del(ruleKey));
        await this.retryRedis(() => this.redis.zrem(indexKey, ruleId));
        this.logger.log(`Deleted anonymization rule ${ruleId}`);
        return deleted > 0;
    }
    async getRoutingTarget(hospitalId, modality, sourceAeTitle) {
        const indexKey = `${this.HOSPITAL_ROUTING_INDEX_KEY}:${hospitalId}`;
        const targetIds = await this.retryRedis(() => this.redis.zrevrange(indexKey, 0, -1));
        const candidates = [];
        for (const targetId of targetIds) {
            const targetKey = `${this.ROUTING_TARGETS_KEY}:${targetId}`;
            const targetData = await this.retryRedis(() => this.redis.get(targetKey));
            if (targetData) {
                try {
                    const target = JSON.parse(targetData);
                    if (target.enabled && target.hospitalId === hospitalId) {
                        if (target.modalities && target.modalities.length > 0 && modality) {
                            if (!target.modalities.includes(modality)) {
                                continue;
                            }
                        }
                        if (target.sourceAeTitles && target.sourceAeTitles.length > 0 && sourceAeTitle) {
                            if (!target.sourceAeTitles.includes(sourceAeTitle)) {
                                continue;
                            }
                        }
                        candidates.push(target);
                    }
                }
                catch (error) {
                    this.logger.error(`Failed to parse routing target ${targetId}: ${error.message}`);
                }
            }
        }
        if (candidates.length > 0) {
            candidates.sort((a, b) => b.priority - a.priority);
            this.logger.debug(`Selected routing target ${candidates[0].id} (${candidates[0].targetName}) for hospital ${hospitalId}`);
            return candidates[0];
        }
        return null;
    }
    async getAllRoutingTargets(hospitalId) {
        const indexKey = `${this.HOSPITAL_ROUTING_INDEX_KEY}:${hospitalId}`;
        const targetIds = await this.retryRedis(() => this.redis.zrevrange(indexKey, 0, -1));
        const targets = [];
        for (const targetId of targetIds) {
            const targetKey = `${this.ROUTING_TARGETS_KEY}:${targetId}`;
            const targetData = await this.retryRedis(() => this.redis.get(targetKey));
            if (targetData) {
                try {
                    targets.push(JSON.parse(targetData));
                }
                catch (error) {
                    this.logger.error(`Failed to parse routing target ${targetId}: ${error.message}`);
                }
            }
        }
        return targets.sort((a, b) => b.priority - a.priority);
    }
    async saveRoutingTarget(target) {
        const targetId = (0, uuid_1.v4)();
        const fullTarget = {
            ...target,
            id: targetId,
        };
        const targetKey = `${this.ROUTING_TARGETS_KEY}:${targetId}`;
        await this.retryRedis(() => this.redis.set(targetKey, JSON.stringify(fullTarget)));
        const indexKey = `${this.HOSPITAL_ROUTING_INDEX_KEY}:${target.hospitalId}`;
        await this.retryRedis(() => this.redis.zadd(indexKey, fullTarget.priority, targetId));
        this.logger.log(`Saved routing target ${targetId} for hospital ${target.hospitalId}`);
        return fullTarget;
    }
    async deleteRoutingTarget(targetId, hospitalId) {
        const targetKey = `${this.ROUTING_TARGETS_KEY}:${targetId}`;
        const indexKey = `${this.HOSPITAL_ROUTING_INDEX_KEY}:${hospitalId}`;
        const deleted = await this.retryRedis(() => this.redis.del(targetKey));
        await this.retryRedis(() => this.redis.zrem(indexKey, targetId));
        this.logger.log(`Deleted routing target ${targetId}`);
        return deleted > 0;
    }
    getDefaultRule(hospitalId) {
        const tagRules = [
            { tagKey: '(0010,0010)', action: anonymization_types_1.AnonymizationActionType.REPLACE, replacementValue: 'Anonymous^Patient' },
            { tagKey: '(0010,0020)', action: anonymization_types_1.AnonymizationActionType.HASH, hashAlgorithm: 'sha256', hashSalt: 'dicom-anon' },
            { tagKey: '(0010,0030)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0010,0032)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0010,1010)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0010,1040)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0010,1050)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0010,1060)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0010,1080)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0010,1081)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0010,2150)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0010,2152)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0010,2154)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0010,2160)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0010,2180)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0008,0050)', action: anonymization_types_1.AnonymizationActionType.HASH, hashAlgorithm: 'sha256', hashSalt: 'accession' },
            { tagKey: '(0008,0090)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0008,1040)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0008,1050)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0008,1060)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0008,1070)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0008,0020)', action: anonymization_types_1.AnonymizationActionType.SHIFT_DATE, dateShiftDays: 0 },
            { tagKey: '(0008,0021)', action: anonymization_types_1.AnonymizationActionType.SHIFT_DATE, dateShiftDays: 0 },
            { tagKey: '(0008,0022)', action: anonymization_types_1.AnonymizationActionType.SHIFT_DATE, dateShiftDays: 0 },
            { tagKey: '(0008,0023)', action: anonymization_types_1.AnonymizationActionType.SHIFT_DATE, dateShiftDays: 0 },
            { tagKey: '(0008,0030)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0008,0031)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0010,1000)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0010,1001)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0010,1005)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0010,1090)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0010,2000)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0010,2110)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0010,21B0)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
            { tagKey: '(0010,4000)', action: anonymization_types_1.AnonymizationActionType.EMPTY },
        ];
        return {
            id: 'default-rule',
            hospitalId,
            ruleName: 'Default Basic De-identification Rule',
            description: 'DICOM PS3.15 E Basic Level of De-identification',
            priority: 0,
            enabled: true,
            createdAt: (0, dayjs_1.default)().toISOString(),
            updatedAt: (0, dayjs_1.default)().toISOString(),
            tagRules,
        };
    }
    async retryRedis(operation, maxRetries = 3) {
        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                if (attempt < maxRetries) {
                    const delay = attempt * 100;
                    this.logger.warn(`Redis operation retry ${attempt}/${maxRetries} after ${delay}ms: ${error.message}`);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
            }
        }
        throw lastError;
    }
};
exports.RedisRuleService = RedisRuleService;
exports.RedisRuleService = RedisRuleService = RedisRuleService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [ioredis_1.default])
], RedisRuleService);
//# sourceMappingURL=redis-rule.service.js.map