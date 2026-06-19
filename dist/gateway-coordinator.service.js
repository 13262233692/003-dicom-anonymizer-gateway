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
var GatewayCoordinator_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayCoordinator = void 0;
const common_1 = require("@nestjs/common");
const dicom_scp_server_service_1 = require("./protocol/dicom-scp-server.service");
const dicom_binary_parser_service_1 = require("./dicom/dicom-binary-parser.service");
const anonymization_engine_service_1 = require("./anonymization/anonymization-engine.service");
const redis_rule_service_1 = require("./redis/redis-rule.service");
const routing_engine_service_1 = require("./routing/routing-engine.service");
const audit_logger_service_1 = require("./audit/audit-logger.service");
const anonymization_types_1 = require("./common/types/anonymization.types");
const uuid_1 = require("uuid");
let GatewayCoordinator = GatewayCoordinator_1 = class GatewayCoordinator {
    constructor(dicomScpServer, dicomParser, anonymizationEngine, redisRuleService, routingEngine, auditLogger) {
        this.dicomScpServer = dicomScpServer;
        this.dicomParser = dicomParser;
        this.anonymizationEngine = anonymizationEngine;
        this.redisRuleService = redisRuleService;
        this.routingEngine = routingEngine;
        this.auditLogger = auditLogger;
        this.logger = new common_1.Logger(GatewayCoordinator_1.name);
    }
    onModuleInit() {
        this.logger.log('Gateway Coordinator initializing DICOM C-STORE subscription');
        this.dicomScpServer.cStoreRequests$.subscribe({
            next: (request) => {
                this.handleCStoreRequest(request).catch((error) => {
                    this.logger.error(`Unhandled error in C-STORE processing: ${error.message}`);
                });
            },
            error: (error) => {
                this.logger.error(`C-STORE stream error: ${error.message}`);
            },
        });
    }
    async handleCStoreRequest(request) {
        const traceId = (0, uuid_1.v4)();
        const startTime = Date.now();
        this.logger.log(`[${traceId}] C-STORE received: CallingAE=${request.association.callingAeTitle}, ` +
            `SOPClass=${request.command.sopClassUid}, SOPInstance=${request.command.sopInstanceUid}`);
        await this.auditLogger.log({
            eventType: anonymization_types_1.AuditEventType.DICOM_RECEIVED,
            traceId,
            sourceAeTitle: request.association.callingAeTitle,
            sopClassUid: request.command.sopClassUid,
            sopInstanceUid: request.command.sopInstanceUid,
            status: 'success',
            additionalData: {
                callingHost: request.association.callingHost,
                callingPort: request.association.callingPort,
            },
        });
        let hospitalId = 'default';
        let parsedDicom = null;
        try {
            parsedDicom = this.dicomParser.parse(request.dataSet);
            const institutionName = this.getTagString(parsedDicom, 0x0008, 0x0080);
            hospitalId = this.resolveHospitalId(institutionName, request.association.callingAeTitle);
            this.logger.debug(`[${traceId}] Resolved hospital ID: ${hospitalId}`);
            const originalPatientId = this.getTagString(parsedDicom, 0x0010, 0x0020);
            const studyInstanceUid = this.getTagString(parsedDicom, 0x0020, 0x000d);
            const seriesInstanceUid = this.getTagString(parsedDicom, 0x0020, 0x000e);
            await this.auditLogger.log({
                eventType: anonymization_types_1.AuditEventType.ANONYMIZATION_STARTED,
                traceId,
                hospitalId,
                sourceAeTitle: request.association.callingAeTitle,
                sopClassUid: request.command.sopClassUid,
                sopInstanceUid: request.command.sopInstanceUid,
                patientId: originalPatientId,
                studyInstanceUid,
                seriesInstanceUid,
                status: 'processing',
            });
            const anonymizationRule = await this.redisRuleService.getAnonymizationRule(hospitalId);
            const processingResult = await this.anonymizationEngine.process(request.dataSet, anonymizationRule, hospitalId, request.association.callingAeTitle);
            const anonymizedPatientId = this.getTagString(this.dicomParser.parse(processingResult.anonymizedBuffer), 0x0010, 0x0020);
            await this.auditLogger.log({
                eventType: anonymization_types_1.AuditEventType.ANONYMIZATION_COMPLETED,
                traceId,
                hospitalId,
                sourceAeTitle: request.association.callingAeTitle,
                sopClassUid: request.command.sopClassUid,
                sopInstanceUid: processingResult.anonymizedSopInstanceUid,
                patientId: originalPatientId,
                anonymizedPatientId,
                studyInstanceUid,
                seriesInstanceUid,
                ruleId: anonymizationRule.id,
                ruleApplied: anonymizationRule.ruleName,
                tagsModified: processingResult.modifiedTags,
                tagsRemoved: processingResult.removedTags,
                durationMs: processingResult.processingDurationMs,
                status: 'success',
            });
            const modality = this.getTagString(parsedDicom, 0x0008, 0x0060);
            const routingTarget = await this.routingEngine.resolveTarget(hospitalId, modality || undefined, request.association.callingAeTitle);
            await this.auditLogger.log({
                eventType: anonymization_types_1.AuditEventType.ROUTING_DECIDED,
                traceId,
                hospitalId,
                destinationAeTitle: routingTarget.aeTitle,
                routingTargetId: routingTarget.id,
                status: 'success',
                additionalData: {
                    targetHost: routingTarget.host,
                    targetPort: routingTarget.port,
                    targetName: routingTarget.targetName,
                },
            });
            await this.auditLogger.log({
                eventType: anonymization_types_1.AuditEventType.PACS_TRANSFER_STARTED,
                traceId,
                hospitalId,
                destinationAeTitle: routingTarget.aeTitle,
                sopClassUid: request.command.sopClassUid,
                sopInstanceUid: processingResult.anonymizedSopInstanceUid,
                routingTargetId: routingTarget.id,
                status: 'processing',
            });
            processingResult.routingTarget = routingTarget;
            const transferResult = await this.routingEngine.forwardToPacs(processingResult, routingTarget, request.association.calledAeTitle);
            const totalDuration = Date.now() - startTime;
            if (transferResult.success) {
                await this.auditLogger.log({
                    eventType: anonymization_types_1.AuditEventType.PACS_TRANSFER_COMPLETED,
                    traceId,
                    hospitalId,
                    destinationAeTitle: routingTarget.aeTitle,
                    sopClassUid: request.command.sopClassUid,
                    sopInstanceUid: processingResult.anonymizedSopInstanceUid,
                    anonymizedPatientId,
                    studyInstanceUid,
                    seriesInstanceUid,
                    routingTargetId: routingTarget.id,
                    durationMs: transferResult.durationMs,
                    status: 'success',
                    additionalData: {
                        totalDurationMs: totalDuration,
                        dicomStatus: transferResult.status,
                    },
                });
                this.logger.log(`[${traceId}] Processing pipeline completed successfully. ` +
                    `Total duration: ${totalDuration}ms, Anonymization: ${processingResult.processingDurationMs}ms, ` +
                    `Transfer: ${transferResult.durationMs}ms`);
            }
            else {
                await this.auditLogger.log({
                    eventType: anonymization_types_1.AuditEventType.PACS_TRANSFER_FAILED,
                    traceId,
                    hospitalId,
                    destinationAeTitle: routingTarget.aeTitle,
                    sopClassUid: request.command.sopClassUid,
                    sopInstanceUid: processingResult.anonymizedSopInstanceUid,
                    routingTargetId: routingTarget.id,
                    durationMs: transferResult.durationMs,
                    status: 'failed',
                    errorMessage: `PACS C-STORE failed with status: 0x${transferResult.status.toString(16)}`,
                    additionalData: {
                        totalDurationMs: totalDuration,
                    },
                });
                this.logger.error(`[${traceId}] PACS transfer failed after ${totalDuration}ms. ` +
                    `Status: 0x${transferResult.status.toString(16)}`);
            }
        }
        catch (error) {
            const totalDuration = Date.now() - startTime;
            this.logger.error(`[${traceId}] Processing pipeline failed after ${totalDuration}ms: ${error.message}`);
            this.logger.debug(`[${traceId}] Error stack: ${error.stack}`);
            await this.auditLogger.log({
                eventType: anonymization_types_1.AuditEventType.ERROR_OCCURRED,
                traceId,
                hospitalId,
                sourceAeTitle: request.association.callingAeTitle,
                sopClassUid: request.command.sopClassUid,
                sopInstanceUid: request.command.sopInstanceUid,
                status: 'failed',
                durationMs: totalDuration,
                errorMessage: error.message,
                errorStack: error.stack,
                additionalData: {
                    errorType: error.constructor.name,
                },
            });
        }
    }
    resolveHospitalId(institutionName, callingAeTitle) {
        if (institutionName && institutionName.trim()) {
            const normalized = institutionName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
            if (normalized.length > 0) {
                return normalized;
            }
        }
        if (callingAeTitle) {
            return callingAeTitle.trim().toLowerCase();
        }
        return 'default';
    }
    getTagString(parsed, group, element) {
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
exports.GatewayCoordinator = GatewayCoordinator;
exports.GatewayCoordinator = GatewayCoordinator = GatewayCoordinator_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [dicom_scp_server_service_1.DicomScpServer,
        dicom_binary_parser_service_1.DicomBinaryParser,
        anonymization_engine_service_1.AnonymizationEngine,
        redis_rule_service_1.RedisRuleService,
        routing_engine_service_1.RoutingEngine,
        audit_logger_service_1.AuditLoggerService])
], GatewayCoordinator);
//# sourceMappingURL=gateway-coordinator.service.js.map