import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';
import { ParsedDicomObject } from '@common/types/dicom.types';
import {
  AnonymizationRule,
  TagRule,
  AnonymizationActionType,
  ProcessingResult,
} from '@common/types/anonymization.types';
import { DicomBinaryReconstructor } from '@dicom/dicom-binary-reconstructor.service';
import { DicomBinaryParser } from '@dicom/dicom-binary-parser.service';
import { AnonymizationRuleException } from '@common/exceptions/custom.exceptions';
import { parseTagKey } from '@common/types/dicom.types';
import { DicomTagVR } from '@common/types/dicom.types';

export interface AnonymizationContext {
  traceId: string;
  hospitalId: string;
  sourceAeTitle: string;
  originalPatientId?: string;
  originalPatientName?: string;
  modifiedTags: string[];
  removedTags: string[];
  patientIdMapping?: Map<string, string>;
  dateShiftDays?: number;
  startTime: number;
}

@Injectable()
export class AnonymizationEngine {
  private readonly logger = new Logger(AnonymizationEngine.name);

  constructor(
    private readonly reconstructor: DicomBinaryReconstructor,
    private readonly parser: DicomBinaryParser,
  ) {}

  public async process(
    rawBuffer: Buffer,
    rule: AnonymizationRule,
    hospitalId: string,
    sourceAeTitle: string,
  ): Promise<ProcessingResult> {
    const traceId = uuidv4();
    const startTime = Date.now();

    this.logger.log(`[${traceId}] Starting anonymization for hospital ${hospitalId}`);

    const parsed = this.parser.parse(rawBuffer);
    const context: AnonymizationContext = {
      traceId,
      hospitalId,
      sourceAeTitle,
      modifiedTags: [],
      removedTags: [],
      patientIdMapping: new Map(),
      dateShiftDays: this.calculateDateShiftDays(traceId, hospitalId),
      startTime,
    };

    context.originalPatientId = this.reconstructor.getTagValueString(parsed, 0x0010, 0x0020);
    context.originalPatientName = this.reconstructor.getTagValueString(parsed, 0x0010, 0x0010);

    const sortedRules = [...rule.tagRules].sort((a, b) => {
      return this.getRulePriority(a) - this.getRulePriority(b);
    });

    for (const tagRule of sortedRules) {
      try {
        this.applyTagRule(parsed, tagRule, context);
      } catch (error) {
        this.logger.error(
          `[${traceId}] Error applying rule for tag ${tagRule.tagKey}: ${error.message}`,
        );
      }
    }

    this.ensureUidsAnonymized(parsed, context);

    const anonymizedBuffer = this.reconstructor.reconstruct(parsed);

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `[${traceId}] Anonymization completed: modified=${context.modifiedTags.length}, removed=${context.removedTags.length}, duration=${durationMs}ms`,
    );

    return {
      traceId,
      hospitalId,
      originalSopInstanceUid: parsed.sopInstanceUid,
      anonymizedSopInstanceUid: this.reconstructor.getTagValueString(parsed, 0x0008, 0x0018) || parsed.sopInstanceUid,
      anonymizedBuffer,
      routingTarget: null as any,
      modifiedTags: context.modifiedTags,
      removedTags: context.removedTags,
      processingDurationMs: durationMs,
    };
  }

  private applyTagRule(
    parsed: ParsedDicomObject,
    rule: TagRule,
    context: AnonymizationContext,
  ): void {
    const { group, element } = parseTagKey(rule.tagKey);
    const tagKey = rule.tagKey;

    const tag = parsed.tags.get(tagKey);
    if (!tag) {
      return;
    }

    switch (rule.action) {
      case AnonymizationActionType.REMOVE:
        if (this.reconstructor.removeTag(parsed, group, element)) {
          context.removedTags.push(tagKey);
          this.logger.debug(`[${context.traceId}] Removed tag ${tagKey}`);
        }
        break;

      case AnonymizationActionType.EMPTY:
        this.reconstructor.updateTag(parsed, group, element, '');
        context.modifiedTags.push(tagKey);
        this.logger.debug(`[${context.traceId}] Emptied tag ${tagKey}`);
        break;

      case AnonymizationActionType.REPLACE:
        if (rule.replacementValue !== undefined) {
          this.reconstructor.updateTag(parsed, group, element, rule.replacementValue);
          context.modifiedTags.push(tagKey);
          this.logger.debug(
            `[${context.traceId}] Replaced tag ${tagKey} with '${rule.replacementValue}'`,
          );
        }
        break;

      case AnonymizationActionType.HASH:
        this.applyHashAction(parsed, group, element, rule, context);
        break;

      case AnonymizationActionType.MASK:
        this.applyMaskAction(parsed, group, element, rule, context);
        break;

      case AnonymizationActionType.SHIFT_DATE:
        this.applyDateShiftAction(parsed, group, element, rule, context);
        break;

      case AnonymizationActionType.KEEP:
        break;

      default:
        throw new AnonymizationRuleException(
          `Unknown action type: ${rule.action}`,
          rule.tagKey,
        );
    }
  }

  private applyHashAction(
    parsed: ParsedDicomObject,
    group: number,
    element: number,
    rule: TagRule,
    context: AnonymizationContext,
  ): void {
    const originalValue = this.reconstructor.getTagValueString(parsed, group, element);
    if (!originalValue) return;

    const algorithm = rule.hashAlgorithm || 'sha256';
    const salt = rule.hashSalt || context.traceId;
    const hashedValue = this.hashString(originalValue, salt, algorithm);

    if (group === 0x0010 && element === 0x0020) {
      context.patientIdMapping?.set(originalValue, hashedValue);
    }

    this.reconstructor.updateTag(parsed, group, element, hashedValue);
    context.modifiedTags.push(rule.tagKey);
    this.logger.debug(
      `[${context.traceId}] Hashed tag ${rule.tagKey} using ${algorithm}`,
    );
  }

  private applyMaskAction(
    parsed: ParsedDicomObject,
    group: number,
    element: number,
    rule: TagRule,
    context: AnonymizationContext,
  ): void {
    const originalValue = this.reconstructor.getTagValueString(parsed, group, element);
    if (!originalValue) return;

    const pattern = rule.maskPattern || '***';
    let maskedValue: string;

    if (pattern === 'first_char') {
      maskedValue = originalValue.charAt(0) + '*'.repeat(Math.max(0, originalValue.length - 1));
    } else if (pattern === 'last_four') {
      maskedValue = '*'.repeat(Math.max(0, originalValue.length - 4)) + originalValue.slice(-4);
    } else if (pattern === 'id_card') {
      if (originalValue.length >= 15) {
        maskedValue = originalValue.slice(0, 6) + '********' + originalValue.slice(-4);
      } else {
        maskedValue = '*'.repeat(originalValue.length);
      }
    } else {
      maskedValue = pattern.repeat(Math.ceil(originalValue.length / pattern.length))
        .slice(0, originalValue.length);
    }

    this.reconstructor.updateTag(parsed, group, element, maskedValue);
    context.modifiedTags.push(rule.tagKey);
    this.logger.debug(`[${context.traceId}] Masked tag ${rule.tagKey}`);
  }

  private applyDateShiftAction(
    parsed: ParsedDicomObject,
    group: number,
    element: number,
    rule: TagRule,
    context: AnonymizationContext,
  ): void {
    const originalValue = this.reconstructor.getTagValueString(parsed, group, element);
    if (!originalValue) return;

    const shiftDays = rule.dateShiftDays ?? context.dateShiftDays ?? 0;

    if (/^\d{8}$/.test(originalValue)) {
      const shifted = this.shiftDate(originalValue, shiftDays);
      if (shifted) {
        this.reconstructor.updateTag(parsed, group, element, shifted);
        context.modifiedTags.push(rule.tagKey);
        this.logger.debug(
          `[${context.traceId}] Shifted date tag ${rule.tagKey} by ${shiftDays} days`,
        );
      }
    } else if (/^\d{4}$/.test(originalValue)) {
      const year = parseInt(originalValue.slice(0, 4), 10);
      const shiftedYear = Math.max(1900, year + Math.floor(shiftDays / 365));
      this.reconstructor.updateTag(parsed, group, element, shiftedYear.toString());
      context.modifiedTags.push(rule.tagKey);
    }
  }

  private ensureUidsAnonymized(
    parsed: ParsedDicomObject,
    context: AnonymizationContext,
  ): void {
    const studyUid = this.reconstructor.getTagValueString(parsed, 0x0020, 0x000d);
    if (studyUid) {
      const newStudyUid = this.generateDerivedUid(studyUid, context.traceId);
      this.reconstructor.updateTag(parsed, 0x0020, 0x000d, newStudyUid);
      context.modifiedTags.push('(0020,000D)');
    }

    const seriesUid = this.reconstructor.getTagValueString(parsed, 0x0020, 0x000e);
    if (seriesUid) {
      const newSeriesUid = this.generateDerivedUid(seriesUid, context.traceId);
      this.reconstructor.updateTag(parsed, 0x0020, 0x000e, newSeriesUid);
      context.modifiedTags.push('(0020,000E)');
    }

    const sopInstanceUid = this.reconstructor.getTagValueString(parsed, 0x0008, 0x0018);
    if (sopInstanceUid) {
      const newSopUid = this.generateDerivedUid(sopInstanceUid, context.traceId);
      this.reconstructor.updateTag(parsed, 0x0008, 0x0018, newSopUid);
      context.modifiedTags.push('(0008,0018)');
    }

    const mediaStorageSopUid = this.reconstructor.getTagValueString(parsed, 0x0002, 0x0003);
    if (mediaStorageSopUid) {
      const newMediaUid = this.generateDerivedUid(mediaStorageSopUid, context.traceId);
      this.reconstructor.updateTag(parsed, 0x0002, 0x0003, newMediaUid);
      context.modifiedTags.push('(0002,0003)');
    }
  }

  private hashString(input: string, salt: string, algorithm: string): string {
    const hash = createHash(algorithm);
    hash.update(salt + input);
    return hash.digest('hex').slice(0, 16).toUpperCase();
  }

  private shiftDate(dateStr: string, days: number): string | null {
    try {
      const year = parseInt(dateStr.slice(0, 4), 10);
      const month = parseInt(dateStr.slice(4, 6), 10);
      const day = parseInt(dateStr.slice(6, 8), 10);

      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        return null;
      }

      const date = dayjs(`${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`);
      if (!date.isValid()) {
        return null;
      }

      const shifted = date.add(days, 'day');
      return shifted.format('YYYYMMDD');
    } catch {
      return null;
    }
  }

  private generateDerivedUid(originalUid: string, traceId: string): string {
    const hash = createHash('md5');
    hash.update(originalUid + traceId);
    const hex = hash.digest('hex');

    const prefix = '2.25.';
    let decimal = BigInt(0);
    for (let i = 0; i < hex.length; i++) {
      decimal = decimal * 16n + BigInt(parseInt(hex[i], 16));
    }

    const result = prefix + decimal.toString().slice(0, 50);
    return result;
  }

  private calculateDateShiftDays(traceId: string, hospitalId: string): number {
    const hash = createHash('md5');
    hash.update(traceId + hospitalId + 'date_shift_salt');
    const hex = hash.digest('hex');
    const num = parseInt(hex.slice(0, 8), 16);
    return -365 - (num % 365);
  }

  private getRulePriority(rule: TagRule): number {
    const { group, element } = parseTagKey(rule.tagKey);

    if (group === 0x0002) return 100;
    if (group === 0x0010) return 10;
    if (group === 0x0008) return 20;
    if (group === 0x0020) return 30;
    if (rule.action === AnonymizationActionType.REMOVE) return 5;
    return 50;
  }
}
