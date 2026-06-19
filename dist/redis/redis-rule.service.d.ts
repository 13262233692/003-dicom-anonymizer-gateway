import Redis from 'ioredis';
import { AnonymizationRule, RoutingTarget } from '@common/types/anonymization.types';
export declare class RedisRuleService {
    private readonly redis;
    private readonly logger;
    private readonly ANONYMIZATION_RULES_KEY;
    private readonly ROUTING_TARGETS_KEY;
    private readonly HOSPITAL_RULE_INDEX_KEY;
    private readonly HOSPITAL_ROUTING_INDEX_KEY;
    constructor(redis: Redis);
    getAnonymizationRule(hospitalId: string): Promise<AnonymizationRule>;
    saveAnonymizationRule(rule: Omit<AnonymizationRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<AnonymizationRule>;
    updateAnonymizationRule(ruleId: string, updates: Partial<AnonymizationRule>): Promise<AnonymizationRule | null>;
    deleteAnonymizationRule(ruleId: string, hospitalId: string): Promise<boolean>;
    getRoutingTarget(hospitalId: string, modality?: string, sourceAeTitle?: string): Promise<RoutingTarget | null>;
    getAllRoutingTargets(hospitalId: string): Promise<RoutingTarget[]>;
    saveRoutingTarget(target: Omit<RoutingTarget, 'id'>): Promise<RoutingTarget>;
    deleteRoutingTarget(targetId: string, hospitalId: string): Promise<boolean>;
    private getDefaultRule;
    private retryRedis;
}
