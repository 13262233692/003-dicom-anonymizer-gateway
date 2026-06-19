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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AnonymizationEngine_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnonymizationEngine = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const dayjs_1 = __importDefault(require("dayjs"));
const uuid_1 = require("uuid");
const anonymization_types_1 = require("../common/types/anonymization.types");
const dicom_binary_reconstructor_service_1 = require("../dicom/dicom-binary-reconstructor.service");
const dicom_binary_parser_service_1 = require("../dicom/dicom-binary-parser.service");
const custom_exceptions_1 = require("../common/exceptions/custom.exceptions");
const dicom_types_1 = require("../common/types/dicom.types");
let AnonymizationEngine = AnonymizationEngine_1 = class AnonymizationEngine {
    constructor(reconstructor, parser) {
        this.reconstructor = reconstructor;
        this.parser = parser;
        this.logger = new common_1.Logger(AnonymizationEngine_1.name);
    }
    async process(rawBuffer, rule, hospitalId, sourceAeTitle) {
        const traceId = (0, uuid_1.v4)();
        const startTime = Date.now();
        this.logger.log(`[${traceId}] Starting anonymization for hospital ${hospitalId}`);
        const parsed = this.parser.parse(rawBuffer);
        const context = {
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
            }
            catch (error) {
                this.logger.error(`[${traceId}] Error applying rule for tag ${tagRule.tagKey}: ${error.message}`);
            }
        }
        this.ensureUidsAnonymized(parsed, context);
        const anonymizedBuffer = this.reconstructor.reconstruct(parsed);
        const durationMs = Date.now() - startTime;
        this.logger.log(`[${traceId}] Anonymization completed: modified=${context.modifiedTags.length}, removed=${context.removedTags.length}, duration=${durationMs}ms`);
        return {
            traceId,
            hospitalId,
            originalSopInstanceUid: parsed.sopInstanceUid,
            anonymizedSopInstanceUid: this.reconstructor.getTagValueString(parsed, 0x0008, 0x0018) || parsed.sopInstanceUid,
            anonymizedBuffer,
            routingTarget: null,
            modifiedTags: context.modifiedTags,
            removedTags: context.removedTags,
            processingDurationMs: durationMs,
        };
    }
    applyTagRule(parsed, rule, context) {
        const { group, element } = (0, dicom_types_1.parseTagKey)(rule.tagKey);
        const tagKey = rule.tagKey;
        const tag = parsed.tags.get(tagKey);
        if (!tag) {
            return;
        }
        switch (rule.action) {
            case anonymization_types_1.AnonymizationActionType.REMOVE:
                if (this.reconstructor.removeTag(parsed, group, element)) {
                    context.removedTags.push(tagKey);
                    this.logger.debug(`[${context.traceId}] Removed tag ${tagKey}`);
                }
                break;
            case anonymization_types_1.AnonymizationActionType.EMPTY:
                this.reconstructor.updateTag(parsed, group, element, '');
                context.modifiedTags.push(tagKey);
                this.logger.debug(`[${context.traceId}] Emptied tag ${tagKey}`);
                break;
            case anonymization_types_1.AnonymizationActionType.REPLACE:
                if (rule.replacementValue !== undefined) {
                    this.reconstructor.updateTag(parsed, group, element, rule.replacementValue);
                    context.modifiedTags.push(tagKey);
                    this.logger.debug(`[${context.traceId}] Replaced tag ${tagKey} with '${rule.replacementValue}'`);
                }
                break;
            case anonymization_types_1.AnonymizationActionType.HASH:
                this.applyHashAction(parsed, group, element, rule, context);
                break;
            case anonymization_types_1.AnonymizationActionType.MASK:
                this.applyMaskAction(parsed, group, element, rule, context);
                break;
            case anonymization_types_1.AnonymizationActionType.SHIFT_DATE:
                this.applyDateShiftAction(parsed, group, element, rule, context);
                break;
            case anonymization_types_1.AnonymizationActionType.KEEP:
                break;
            default:
                throw new custom_exceptions_1.AnonymizationRuleException(`Unknown action type: ${rule.action}`, rule.tagKey);
        }
    }
    applyHashAction(parsed, group, element, rule, context) {
        const originalValue = this.reconstructor.getTagValueString(parsed, group, element);
        if (!originalValue)
            return;
        const algorithm = rule.hashAlgorithm || 'sha256';
        const salt = rule.hashSalt || context.traceId;
        const hashedValue = this.hashString(originalValue, salt, algorithm);
        if (group === 0x0010 && element === 0x0020) {
            context.patientIdMapping?.set(originalValue, hashedValue);
        }
        this.reconstructor.updateTag(parsed, group, element, hashedValue);
        context.modifiedTags.push(rule.tagKey);
        this.logger.debug(`[${context.traceId}] Hashed tag ${rule.tagKey} using ${algorithm}`);
    }
    applyMaskAction(parsed, group, element, rule, context) {
        const originalValue = this.reconstructor.getTagValueString(parsed, group, element);
        if (!originalValue)
            return;
        const pattern = rule.maskPattern || '***';
        let maskedValue;
        if (pattern === 'first_char') {
            maskedValue = originalValue.charAt(0) + '*'.repeat(Math.max(0, originalValue.length - 1));
        }
        else if (pattern === 'last_four') {
            maskedValue = '*'.repeat(Math.max(0, originalValue.length - 4)) + originalValue.slice(-4);
        }
        else if (pattern === 'id_card') {
            if (originalValue.length >= 15) {
                maskedValue = originalValue.slice(0, 6) + '********' + originalValue.slice(-4);
            }
            else {
                maskedValue = '*'.repeat(originalValue.length);
            }
        }
        else {
            maskedValue = pattern.repeat(Math.ceil(originalValue.length / pattern.length))
                .slice(0, originalValue.length);
        }
        this.reconstructor.updateTag(parsed, group, element, maskedValue);
        context.modifiedTags.push(rule.tagKey);
        this.logger.debug(`[${context.traceId}] Masked tag ${rule.tagKey}`);
    }
    applyDateShiftAction(parsed, group, element, rule, context) {
        const originalValue = this.reconstructor.getTagValueString(parsed, group, element);
        if (!originalValue)
            return;
        const shiftDays = rule.dateShiftDays ?? context.dateShiftDays ?? 0;
        if (/^\d{8}$/.test(originalValue)) {
            const shifted = this.shiftDate(originalValue, shiftDays);
            if (shifted) {
                this.reconstructor.updateTag(parsed, group, element, shifted);
                context.modifiedTags.push(rule.tagKey);
                this.logger.debug(`[${context.traceId}] Shifted date tag ${rule.tagKey} by ${shiftDays} days`);
            }
        }
        else if (/^\d{4}$/.test(originalValue)) {
            const year = parseInt(originalValue.slice(0, 4), 10);
            const shiftedYear = Math.max(1900, year + Math.floor(shiftDays / 365));
            this.reconstructor.updateTag(parsed, group, element, shiftedYear.toString());
            context.modifiedTags.push(rule.tagKey);
        }
    }
    ensureUidsAnonymized(parsed, context) {
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
    hashString(input, salt, algorithm) {
        const hash = (0, crypto_1.createHash)(algorithm);
        hash.update(salt + input);
        return hash.digest('hex').slice(0, 16).toUpperCase();
    }
    shiftDate(dateStr, days) {
        try {
            const year = parseInt(dateStr.slice(0, 4), 10);
            const month = parseInt(dateStr.slice(4, 6), 10);
            const day = parseInt(dateStr.slice(6, 8), 10);
            if (isNaN(year) || isNaN(month) || isNaN(day)) {
                return null;
            }
            const date = (0, dayjs_1.default)(`${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`);
            if (!date.isValid()) {
                return null;
            }
            const shifted = date.add(days, 'day');
            return shifted.format('YYYYMMDD');
        }
        catch {
            return null;
        }
    }
    generateDerivedUid(originalUid, traceId) {
        const hash = (0, crypto_1.createHash)('md5');
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
    calculateDateShiftDays(traceId, hospitalId) {
        const hash = (0, crypto_1.createHash)('md5');
        hash.update(traceId + hospitalId + 'date_shift_salt');
        const hex = hash.digest('hex');
        const num = parseInt(hex.slice(0, 8), 16);
        return -365 - (num % 365);
    }
    getRulePriority(rule) {
        const { group, element } = (0, dicom_types_1.parseTagKey)(rule.tagKey);
        if (group === 0x0002)
            return 100;
        if (group === 0x0010)
            return 10;
        if (group === 0x0008)
            return 20;
        if (group === 0x0020)
            return 30;
        if (rule.action === anonymization_types_1.AnonymizationActionType.REMOVE)
            return 5;
        return 50;
    }
};
exports.AnonymizationEngine = AnonymizationEngine;
exports.AnonymizationEngine = AnonymizationEngine = AnonymizationEngine_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [dicom_binary_reconstructor_service_1.DicomBinaryReconstructor,
        dicom_binary_parser_service_1.DicomBinaryParser])
], AnonymizationEngine);
//# sourceMappingURL=anonymization-engine.service.js.map