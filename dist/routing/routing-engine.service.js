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
var RoutingEngine_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoutingEngine = void 0;
const common_1 = require("@nestjs/common");
const configuration_1 = __importDefault(require("../common/config/configuration"));
const redis_rule_service_1 = require("../redis/redis-rule.service");
const dicom_scu_client_service_1 = require("../protocol/dicom-scu-client.service");
const dicom_binary_parser_service_1 = require("../dicom/dicom-binary-parser.service");
const dicom_pdu_types_1 = require("../protocol/dicom-pdu.types");
let RoutingEngine = RoutingEngine_1 = class RoutingEngine {
    constructor(config, redisRuleService, dicomScuClient, dicomParser) {
        this.config = config;
        this.redisRuleService = redisRuleService;
        this.dicomScuClient = dicomScuClient;
        this.dicomParser = dicomParser;
        this.logger = new common_1.Logger(RoutingEngine_1.name);
    }
    async resolveTarget(hospitalId, modality, sourceAeTitle) {
        this.logger.debug(`Resolving routing target for hospital=${hospitalId}, modality=${modality}, sourceAE=${sourceAeTitle}`);
        const target = await this.redisRuleService.getRoutingTarget(hospitalId, modality, sourceAeTitle);
        if (target) {
            return target;
        }
        this.logger.warn(`No custom routing target found for hospital ${hospitalId}, using default PACS`);
        const defaultTarget = {
            id: 'default-pacs',
            hospitalId,
            targetName: 'Default PACS',
            host: this.config.defaultPacs.host,
            port: this.config.defaultPacs.port,
            aeTitle: this.config.defaultPacs.aeTitle,
            priority: 0,
            enabled: true,
            description: 'Default fallback PACS server from configuration',
        };
        return defaultTarget;
    }
    async forwardToPacs(processingResult, target, sourceAeTitle) {
        const traceId = processingResult.traceId;
        const startTime = Date.now();
        this.logger.log(`[${traceId}] Forwarding to PACS ${target.aeTitle}@${target.host}:${target.port}`);
        const parsed = this.dicomParser.parse(processingResult.anonymizedBuffer);
        const transferContext = {
            sourceAeTitle,
            sourceHost: '0.0.0.0',
            sourcePort: this.config.dicomScp.port,
            destinationAeTitle: target.aeTitle,
            destinationHost: target.host,
            destinationPort: target.port,
            sopClassUid: parsed.sopClassUid,
            sopInstanceUid: processingResult.anonymizedSopInstanceUid,
            patientId: this.extractTagValue(parsed, 0x0010, 0x0020),
            studyInstanceUid: this.extractTagValue(parsed, 0x0020, 0x000d),
            seriesInstanceUid: this.extractTagValue(parsed, 0x0020, 0x000e),
            hospitalId: processingResult.hospitalId,
            modality: this.extractTagValue(parsed, 0x0008, 0x0060),
        };
        try {
            const status = await this.dicomScuClient.cStore(target.host, target.port, target.aeTitle, sourceAeTitle, parsed.sopClassUid, processingResult.anonymizedSopInstanceUid, processingResult.anonymizedBuffer, transferContext);
            const durationMs = Date.now() - startTime;
            const success = status === dicom_pdu_types_1.DimseStatus.SUCCESS || status === dicom_pdu_types_1.DimseStatus.WARNING;
            this.logger.log(`[${traceId}] C-STORE to PACS completed: status=0x${status.toString(16)}, duration=${durationMs}ms, success=${success}`);
            return {
                success,
                status,
                durationMs,
                transferContext,
            };
        }
        catch (error) {
            const durationMs = Date.now() - startTime;
            this.logger.error(`[${traceId}] C-STORE to PACS failed after ${durationMs}ms: ${error.message}`);
            return {
                success: false,
                status: dicom_pdu_types_1.DimseStatus.PROCESSING_FAILURE,
                durationMs,
                transferContext,
            };
        }
    }
    extractTagValue(parsed, group, element) {
        const key = `(${group.toString(16).padStart(4, '0').toUpperCase()},${element.toString(16).padStart(4, '0').toUpperCase()})`;
        const tag = parsed.tags.get(key);
        if (!tag)
            return '';
        if (typeof tag.value === 'string') {
            return tag.value.trim().replace(/\0/g, '');
        }
        if (Buffer.isBuffer(tag.value)) {
            return tag.value.toString('utf8').trim().replace(/\0/g, '');
        }
        return String(tag.value || '');
    }
};
exports.RoutingEngine = RoutingEngine;
exports.RoutingEngine = RoutingEngine = RoutingEngine_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(configuration_1.default.KEY)),
    __metadata("design:paramtypes", [void 0, redis_rule_service_1.RedisRuleService,
        dicom_scu_client_service_1.DicomScuClient,
        dicom_binary_parser_service_1.DicomBinaryParser])
], RoutingEngine);
//# sourceMappingURL=routing-engine.service.js.map