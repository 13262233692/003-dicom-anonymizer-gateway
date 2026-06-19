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
const dicom_pdu_types_1 = require("./protocol/dicom-pdu.types");
const dicom_binary_parser_service_1 = require("./dicom/dicom-binary-parser.service");
const anonymization_engine_service_1 = require("./anonymization/anonymization-engine.service");
const streaming_anonymization_engine_service_1 = require("./dicom/streaming-anonymization-engine.service");
const redis_rule_service_1 = require("./redis/redis-rule.service");
const routing_engine_service_1 = require("./routing/routing-engine.service");
const audit_logger_service_1 = require("./audit/audit-logger.service");
const anonymization_types_1 = require("./common/types/anonymization.types");
const uuid_1 = require("uuid");
let GatewayCoordinator = GatewayCoordinator_1 = class GatewayCoordinator {
    constructor(dicomScpServer, dicomParser, anonymizationEngine, streamingAnonymizationEngine, redisRuleService, routingEngine, auditLogger) {
        this.dicomScpServer = dicomScpServer;
        this.dicomParser = dicomParser;
        this.anonymizationEngine = anonymizationEngine;
        this.streamingAnonymizationEngine = streamingAnonymizationEngine;
        this.redisRuleService = redisRuleService;
        this.routingEngine = routingEngine;
        this.auditLogger = auditLogger;
        this.logger = new common_1.Logger(GatewayCoordinator_1.name);
    }
    onModuleInit() {
        this.logger.log('Gateway Coordinator initializing DICOM C-STORE streaming subscription');
        this.dicomScpServer.cStoreStreamRequests$.subscribe({
            next: (request) => {
                this.handleCStoreStreamRequest(request).catch((error) => {
                    this.logger.error(`Unhandled error in C-STORE streaming processing: ${error.message}`);
                    try {
                        request.respond(dicom_pdu_types_1.DimseStatus.PROCESSING_FAILURE);
                    }
                    catch (_e) {
                    }
                });
            },
            error: (error) => {
                this.logger.error(`C-STORE stream error: ${error.message}`);
            },
        });
        const memInfo = this.streamingAnonymizationEngine.getMemoryUsageInfo();
        this.logger.log(`Streaming pipeline configured: maxTagValueInMemory=${memInfo.maxTagValueInMemory}, ` +
            `expectedMemoryPerStream=${memInfo.expectedMemoryPerStream}`);
    }
    async handleCStoreStreamRequest(request) {
        const traceId = (0, uuid_1.v4)();
        const startTime = Date.now();
        this.logger.log(`[${traceId}] C-STORE streaming request received: ` +
            `CallingAE=${request.association.callingAeTitle}, ` +
            `SOPClass=${request.command.sopClassUid}, ` +
            `SOPInstance=${request.command.sopInstanceUid}`);
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
                processingMode: 'streaming-end-to-end',
            },
        });
        const hospitalId = this.resolveHospitalId(request.association.callingAeTitle);
        let responded = false;
        const respondWithStatus = (status) => {
            if (!responded) {
                responded = true;
                request.respond(status);
            }
        };
        try {
            this.logger.debug(`[${traceId}] Resolved hospital ID: ${hospitalId} (from AE Title)`);
            await this.auditLogger.log({
                eventType: anonymization_types_1.AuditEventType.ANONYMIZATION_STARTED,
                traceId,
                hospitalId,
                sourceAeTitle: request.association.callingAeTitle,
                sopClassUid: request.command.sopClassUid,
                sopInstanceUid: request.command.sopInstanceUid,
                status: 'processing',
                additionalData: {
                    processingMode: 'streaming-end-to-end',
                },
            });
            const anonymizationRule = await this.redisRuleService.getAnonymizationRule(hospitalId);
            const { stream: anonymizationStream, resultPromise: streamResultPromise, } = this.streamingAnonymizationEngine.createAnonymizationStream(anonymizationRule, hospitalId, request.association.callingAeTitle);
            request.dataSetStream.pipe(anonymizationStream);
            const streamResult = await streamResultPromise;
            this.logger.debug(`[${traceId}] Stream metadata ready: modified=${streamResult.modifiedTags.length}, ` +
                `removed=${streamResult.removedTags.length}, ` +
                `pixelData=${(streamResult.pixelDataBytesProcessed / 1024 / 1024).toFixed(2)}MB`);
            await this.auditLogger.log({
                eventType: anonymization_types_1.AuditEventType.ANONYMIZATION_COMPLETED,
                traceId,
                hospitalId,
                sourceAeTitle: request.association.callingAeTitle,
                sopClassUid: request.command.sopClassUid,
                sopInstanceUid: streamResult.anonymizedSopInstanceUid,
                patientId: streamResult.originalPatientId,
                anonymizedPatientId: streamResult.anonymizedPatientId,
                studyInstanceUid: streamResult.studyInstanceUid,
                seriesInstanceUid: streamResult.seriesInstanceUid,
                ruleId: anonymizationRule.id,
                ruleApplied: anonymizationRule.ruleName,
                tagsModified: streamResult.modifiedTags,
                tagsRemoved: streamResult.removedTags,
                durationMs: Date.now() - startTime,
                status: 'success',
                additionalData: {
                    processingMode: 'streaming-end-to-end',
                    pixelDataBytesProcessed: streamResult.pixelDataBytesProcessed,
                    totalTagsProcessed: streamResult.totalTagsProcessed,
                },
            });
            const routingTarget = await this.routingEngine.resolveTarget(hospitalId, streamResult.modality || undefined, request.association.callingAeTitle);
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
                sopInstanceUid: streamResult.anonymizedSopInstanceUid,
                routingTargetId: routingTarget.id,
                status: 'processing',
            });
            const transferResult = await this.routingEngine.forwardStreamToPacs(anonymizationStream, streamResult, routingTarget, request.association.calledAeTitle, hospitalId, traceId);
            const totalDuration = Date.now() - startTime;
            if (transferResult.success) {
                respondWithStatus(dicom_pdu_types_1.DimseStatus.SUCCESS);
                await this.auditLogger.log({
                    eventType: anonymization_types_1.AuditEventType.PACS_TRANSFER_COMPLETED,
                    traceId,
                    hospitalId,
                    destinationAeTitle: routingTarget.aeTitle,
                    sopClassUid: request.command.sopClassUid,
                    sopInstanceUid: streamResult.anonymizedSopInstanceUid,
                    anonymizedPatientId: streamResult.anonymizedPatientId,
                    studyInstanceUid: streamResult.studyInstanceUid,
                    seriesInstanceUid: streamResult.seriesInstanceUid,
                    routingTargetId: routingTarget.id,
                    durationMs: transferResult.durationMs,
                    status: 'success',
                    additionalData: {
                        totalDurationMs: totalDuration,
                        dicomStatus: transferResult.status,
                        processingMode: 'streaming-end-to-end',
                        pixelDataBytes: streamResult.pixelDataBytesProcessed,
                    },
                });
                this.logger.log(`[${traceId}] End-to-end streaming pipeline completed successfully. ` +
                    `Total duration: ${totalDuration}ms, ` +
                    `Pixel data: ${(streamResult.pixelDataBytesProcessed / 1024 / 1024).toFixed(2)}MB, ` +
                    `Tags modified: ${streamResult.modifiedTags.length}, ` +
                    `Tags removed: ${streamResult.removedTags.length}`);
            }
            else {
                respondWithStatus(transferResult.status);
                await this.auditLogger.log({
                    eventType: anonymization_types_1.AuditEventType.PACS_TRANSFER_FAILED,
                    traceId,
                    hospitalId,
                    destinationAeTitle: routingTarget.aeTitle,
                    sopClassUid: request.command.sopClassUid,
                    sopInstanceUid: streamResult.anonymizedSopInstanceUid,
                    routingTargetId: routingTarget.id,
                    durationMs: transferResult.durationMs,
                    status: 'failed',
                    errorMessage: `PACS C-STORE failed with status: 0x${transferResult.status.toString(16)}`,
                    additionalData: {
                        totalDurationMs: totalDuration,
                        processingMode: 'streaming-end-to-end',
                    },
                });
                this.logger.error(`[${traceId}] PACS transfer failed after ${totalDuration}ms. ` +
                    `Status: 0x${transferResult.status.toString(16)}`);
            }
        }
        catch (error) {
            const totalDuration = Date.now() - startTime;
            respondWithStatus(dicom_pdu_types_1.DimseStatus.PROCESSING_FAILURE);
            this.logger.error(`[${traceId}] Streaming processing pipeline failed after ${totalDuration}ms: ${error.message}`);
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
                    processingMode: 'streaming-end-to-end',
                },
            });
        }
    }
    resolveHospitalId(callingAeTitle) {
        if (callingAeTitle) {
            return callingAeTitle.trim().toLowerCase();
        }
        return 'default';
    }
};
exports.GatewayCoordinator = GatewayCoordinator;
exports.GatewayCoordinator = GatewayCoordinator = GatewayCoordinator_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [dicom_scp_server_service_1.DicomScpServer,
        dicom_binary_parser_service_1.DicomBinaryParser,
        anonymization_engine_service_1.AnonymizationEngine,
        streaming_anonymization_engine_service_1.StreamingAnonymizationEngine,
        redis_rule_service_1.RedisRuleService,
        routing_engine_service_1.RoutingEngine,
        audit_logger_service_1.AuditLoggerService])
], GatewayCoordinator);
//# sourceMappingURL=gateway-coordinator.service.js.map