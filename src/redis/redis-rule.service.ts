import { Injectable, Logger, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import { REDIS_CLIENT } from './redis.module';
import { AnonymizationRule, RoutingTarget, AnonymizationActionType, TagRule } from '@common/types/anonymization.types';
import { AnonymizationRuleException } from '@common/exceptions/custom.exceptions';

@Injectable()
export class RedisRuleService {
  private readonly logger = new Logger(RedisRuleService.name);
  private readonly ANONYMIZATION_RULES_KEY = 'anonymization:rules';
  private readonly ROUTING_TARGETS_KEY = 'routing:targets';
  private readonly HOSPITAL_RULE_INDEX_KEY = 'hospital:rule:index';
  private readonly HOSPITAL_ROUTING_INDEX_KEY = 'hospital:routing:index';

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  public async getAnonymizationRule(hospitalId: string): Promise<AnonymizationRule> {
    const indexKey = `${this.HOSPITAL_RULE_INDEX_KEY}:${hospitalId}`;
    const ruleIds = await this.retryRedis(() => this.redis.zrevrange(indexKey, 0, -1));

    for (const ruleId of ruleIds) {
      const ruleKey = `${this.ANONYMIZATION_RULES_KEY}:${ruleId}`;
      const ruleData = await this.retryRedis(() => this.redis.get(ruleKey));
      if (ruleData) {
        try {
          const rule: AnonymizationRule = JSON.parse(ruleData);
          if (rule.enabled && rule.hospitalId === hospitalId) {
            this.logger.debug(`Loaded anonymization rule ${rule.id} for hospital ${hospitalId}`);
            return rule;
          }
        } catch (error) {
          this.logger.error(`Failed to parse rule ${ruleId}: ${error.message}`);
        }
      }
    }

    return this.getDefaultRule(hospitalId);
  }

  public async saveAnonymizationRule(rule: Omit<AnonymizationRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<AnonymizationRule> {
    const ruleId = uuidv4();
    const now = dayjs().toISOString();
    const fullRule: AnonymizationRule = {
      ...rule,
      id: ruleId,
      createdAt: now,
      updatedAt: now,
    };

    const ruleKey = `${this.ANONYMIZATION_RULES_KEY}:${ruleId}`;
    await this.retryRedis(() =>
      this.redis.set(ruleKey, JSON.stringify(fullRule)),
    );

    const indexKey = `${this.HOSPITAL_RULE_INDEX_KEY}:${rule.hospitalId}`;
    await this.retryRedis(() =>
      this.redis.zadd(indexKey, fullRule.priority, ruleId),
    );

    this.logger.log(`Saved anonymization rule ${ruleId} for hospital ${rule.hospitalId}`);
    return fullRule;
  }

  public async updateAnonymizationRule(ruleId: string, updates: Partial<AnonymizationRule>): Promise<AnonymizationRule | null> {
    const ruleKey = `${this.ANONYMIZATION_RULES_KEY}:${ruleId}`;
    const existingData = await this.retryRedis(() => this.redis.get(ruleKey));

    if (!existingData) {
      throw new AnonymizationRuleException(`Rule not found: ${ruleId}`, ruleId);
    }

    const existing: AnonymizationRule = JSON.parse(existingData);
    const updated: AnonymizationRule = {
      ...existing,
      ...updates,
      id: ruleId,
      updatedAt: dayjs().toISOString(),
    };

    await this.retryRedis(() => this.redis.set(ruleKey, JSON.stringify(updated)));
    this.logger.log(`Updated anonymization rule ${ruleId}`);
    return updated;
  }

  public async deleteAnonymizationRule(ruleId: string, hospitalId: string): Promise<boolean> {
    const ruleKey = `${this.ANONYMIZATION_RULES_KEY}:${ruleId}`;
    const indexKey = `${this.HOSPITAL_RULE_INDEX_KEY}:${hospitalId}`;

    const deleted = await this.retryRedis(() => this.redis.del(ruleKey));
    await this.retryRedis(() => this.redis.zrem(indexKey, ruleId));

    this.logger.log(`Deleted anonymization rule ${ruleId}`);
    return deleted > 0;
  }

  public async getRoutingTarget(hospitalId: string, modality?: string, sourceAeTitle?: string): Promise<RoutingTarget | null> {
    const indexKey = `${this.HOSPITAL_ROUTING_INDEX_KEY}:${hospitalId}`;
    const targetIds = await this.retryRedis(() => this.redis.zrevrange(indexKey, 0, -1));

    const candidates: RoutingTarget[] = [];

    for (const targetId of targetIds) {
      const targetKey = `${this.ROUTING_TARGETS_KEY}:${targetId}`;
      const targetData = await this.retryRedis(() => this.redis.get(targetKey));
      if (targetData) {
        try {
          const target: RoutingTarget = JSON.parse(targetData);
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
        } catch (error) {
          this.logger.error(`Failed to parse routing target ${targetId}: ${error.message}`);
        }
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.priority - a.priority);
      this.logger.debug(
        `Selected routing target ${candidates[0].id} (${candidates[0].targetName}) for hospital ${hospitalId}`,
      );
      return candidates[0];
    }

    return null;
  }

  public async getAllRoutingTargets(hospitalId: string): Promise<RoutingTarget[]> {
    const indexKey = `${this.HOSPITAL_ROUTING_INDEX_KEY}:${hospitalId}`;
    const targetIds = await this.retryRedis(() => this.redis.zrevrange(indexKey, 0, -1));

    const targets: RoutingTarget[] = [];
    for (const targetId of targetIds) {
      const targetKey = `${this.ROUTING_TARGETS_KEY}:${targetId}`;
      const targetData = await this.retryRedis(() => this.redis.get(targetKey));
      if (targetData) {
        try {
          targets.push(JSON.parse(targetData));
        } catch (error) {
          this.logger.error(`Failed to parse routing target ${targetId}: ${error.message}`);
        }
      }
    }

    return targets.sort((a, b) => b.priority - a.priority);
  }

  public async saveRoutingTarget(
    target: Omit<RoutingTarget, 'id'>,
  ): Promise<RoutingTarget> {
    const targetId = uuidv4();
    const fullTarget: RoutingTarget = {
      ...target,
      id: targetId,
    };

    const targetKey = `${this.ROUTING_TARGETS_KEY}:${targetId}`;
    await this.retryRedis(() =>
      this.redis.set(targetKey, JSON.stringify(fullTarget)),
    );

    const indexKey = `${this.HOSPITAL_ROUTING_INDEX_KEY}:${target.hospitalId}`;
    await this.retryRedis(() =>
      this.redis.zadd(indexKey, fullTarget.priority, targetId),
    );

    this.logger.log(`Saved routing target ${targetId} for hospital ${target.hospitalId}`);
    return fullTarget;
  }

  public async deleteRoutingTarget(targetId: string, hospitalId: string): Promise<boolean> {
    const targetKey = `${this.ROUTING_TARGETS_KEY}:${targetId}`;
    const indexKey = `${this.HOSPITAL_ROUTING_INDEX_KEY}:${hospitalId}`;

    const deleted = await this.retryRedis(() => this.redis.del(targetKey));
    await this.retryRedis(() => this.redis.zrem(indexKey, targetId));

    this.logger.log(`Deleted routing target ${targetId}`);
    return deleted > 0;
  }

  private getDefaultRule(hospitalId: string): AnonymizationRule {
    const tagRules: TagRule[] = [
      { tagKey: '(0010,0010)', action: AnonymizationActionType.REPLACE, replacementValue: 'Anonymous^Patient' },
      { tagKey: '(0010,0020)', action: AnonymizationActionType.HASH, hashAlgorithm: 'sha256', hashSalt: 'dicom-anon' },
      { tagKey: '(0010,0030)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0010,0032)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0010,1010)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0010,1040)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0010,1050)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0010,1060)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0010,1080)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0010,1081)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0010,2150)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0010,2152)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0010,2154)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0010,2160)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0010,2180)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0008,0050)', action: AnonymizationActionType.HASH, hashAlgorithm: 'sha256', hashSalt: 'accession' },
      { tagKey: '(0008,0090)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0008,1040)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0008,1050)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0008,1060)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0008,1070)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0008,0020)', action: AnonymizationActionType.SHIFT_DATE, dateShiftDays: 0 },
      { tagKey: '(0008,0021)', action: AnonymizationActionType.SHIFT_DATE, dateShiftDays: 0 },
      { tagKey: '(0008,0022)', action: AnonymizationActionType.SHIFT_DATE, dateShiftDays: 0 },
      { tagKey: '(0008,0023)', action: AnonymizationActionType.SHIFT_DATE, dateShiftDays: 0 },
      { tagKey: '(0008,0030)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0008,0031)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0010,1000)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0010,1001)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0010,1005)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0010,1090)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0010,2000)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0010,2110)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0010,21B0)', action: AnonymizationActionType.EMPTY },
      { tagKey: '(0010,4000)', action: AnonymizationActionType.EMPTY },
    ];
    return {
      id: 'default-rule',
      hospitalId,
      ruleName: 'Default Basic De-identification Rule',
      description: 'DICOM PS3.15 E Basic Level of De-identification',
      priority: 0,
      enabled: true,
      createdAt: dayjs().toISOString(),
      updatedAt: dayjs().toISOString(),
      tagRules,
    };
  }

  private async retryRedis<T>(operation: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries) {
          const delay = attempt * 100;
          this.logger.warn(`Redis operation retry ${attempt}/${maxRetries} after ${delay}ms: ${error.message}`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }
}
