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
const dicom_stream_parser_1 = require("./dicom/dicom-stream-parser");
const redis_rule_service_1 = require("./redis/redis-rule.service");
const routing_engine_service_1 = require("./routing/routing-engine.service");
const audit_logger_service_1 = require("./audit/audit-logger.service");
const patient_state_service_1 = require("./hl7/patient-state.service");
const mllp_server_service_1 = require("./hl7/mllp-server.service");
const anonymization_types_1 = require("./common/types/anonymization.types");
const uuid_1 = require("uuid");
const stream_1 = require("stream");
class BufferedReplayStream extends stream_1.Readable {
    constructor(preBuffer, source) {
        super();
        this.preBuffer = preBuffer;
        this.source = source;
        this.bufferIndex = 0;
        this.sourceEnded = false;
        this.sourceFlowing = false;
    }
    _read() {
        if (this.bufferIndex < this.preBuffer.length) {
            const chunk = this.preBuffer[this.bufferIndex++];
            this.push(chunk);
            return;
        }
        if (this.sourceEnded) {
            this.push(null);
            return;
        }
        if (!this.sourceFlowing) {
            this.sourceFlowing = true;
            this.setupSourceListeners();
        }
        let chunk;
        while ((chunk = this.source.read()) !== null) {
            if (!this.push(chunk)) {
                return;
            }
        }
    }
    setupSourceListeners() {
        this.source.on('end', () => {
            this.sourceEnded = true;
            if (this.bufferIndex >= this.preBuffer.length) {
                this.push(null);
            }
        });
        this.source.on('error', (error) => {
            this.destroy(error);
        });
        this.source.on('readable', () => {
            this._read();
        });
    }
}
let GatewayCoordinator = GatewayCoordinator_1 = class GatewayCoordinator {
    constructor(dicomScpServer, dicomParser, anonymizationEngine, streamingAnonymizationEngine, redisRuleService, routingEngine, auditLogger, patientStateService, mllpServer) {
        this.dicomScpServer = dicomScpServer;
        this.dicomParser = dicomParser;
        this.anonymizationEngine = anonymizationEngine;
        this.streamingAnonymizationEngine = streamingAnonymizationEngine;
        this.redisRuleService = redisRuleService;
        this.routingEngine = routingEngine;
        this.auditLogger = auditLogger;
        this.patientStateService = patientStateService;
        this.mllpServer = mllpServer;
        this.logger = new common_1.Logger(GatewayCoordinator_1.name);
        this.MAX_PREBUFFER_SIZE = 64 * 1024 * 1024;
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
        this.logger.log('Gateway Coordinator initializing HL7 message subscription');
        this.mllpServer.messages$.subscribe({
            next: (message) => {
                this.handleHl7Message(message).catch((error) => {
                    this.logger.error(`Unhandled error in HL7 message processing: ${error.message}`);
                });
            },
            error: (error) => {
                this.logger.error(`HL7 message stream error: ${error.message}`);
            },
        });
        const memInfo = this.streamingAnonymizationEngine.getMemoryUsageInfo();
        this.logger.log(`Streaming pipeline configured: maxTagValueInMemory=${memInfo.maxTagValueInMemory}, ` +
            `expectedMemoryPerStream=${memInfo.expectedMemoryPerStream}`);
        this.logger.log(`MLLP server status: listening=${this.mllpServer.isListening()}, ` +
            `connections=${this.mllpServer.getConnectionCount()}`);
    }
    async handleHl7Message(message) {
        const traceId = (0, uuid_1.v4)();
        try {
            const patientState = await this.patientStateService.processHl7Message(message);
            this.logger.log(`[${traceId}] HL7 message processed: type=${message.messageTypeFull}, ` +
                `patientId=${message.pid.patientId}, ` +
                `status=${patientState.patientAccountStatus}, ` +
                `sensitivity=${patientState.sensitivityLevel}`);
            await this.auditLogger.log({
                eventType: anonymization_types_1.AuditEventType.ANONYMIZATION_STARTED,
                traceId,
                hospitalId: message.hospitalId,
                patientId: message.pid.patientId,
                status: 'success',
                additionalData: {
                    hl7MessageType: message.messageTypeFull,
                    messageControlId: message.messageControlId,
                    patientAccountStatus: patientState.patientAccountStatus,
                    sensitivityLevel: patientState.sensitivityLevel,
                    source: 'hl7_mllp',
                },
            });
        }
        catch (error) {
            this.logger.error(`[${traceId}] Failed to process HL7 message: ${error.message}`);
            await this.auditLogger.log({
                eventType: anonymization_types_1.AuditEventType.ERROR_OCCURRED,
                traceId,
                patientId: message.pid?.patientId,
                status: 'failed',
                errorMessage: error.message,
                errorStack: error.stack,
                additionalData: {
                    hl7MessageType: message.messageTypeFull,
                    source: 'hl7_mllp',
                },
            });
        }
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
            const anonymizationRule = await this.redisRuleService.getAnonymizationRule(hospitalId);
            const { outputStream, streamResultPromise, patientState, sensitivityLevel } = await this.createSmartAnonymizationStream(request.dataSetStream, anonymizationRule, hospitalId, request.association.callingAeTitle, traceId);
            const streamResult = await streamResultPromise;
            this.logger.debug(`[${traceId}] Stream metadata ready: modified=${streamResult.modifiedTags.length}, ` +
                `removed=${streamResult.removedTags.length}, ` +
                `pixelData=${(streamResult.pixelDataBytesProcessed / 1024 / 1024).toFixed(2)}MB, ` +
                `sensitivity=${sensitivityLevel}`);
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
                    patientSensitivityLevel: sensitivityLevel,
                    patientAccountStatus: patientState?.patientAccountStatus,
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
            const transferResult = await this.routingEngine.forwardStreamToPacs(outputStream, streamResult, routingTarget, request.association.calledAeTitle, hospitalId, traceId);
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
                        patientSensitivityLevel: sensitivityLevel,
                    },
                });
                this.logger.log(`[${traceId}] End-to-end streaming pipeline completed successfully. ` +
                    `Total duration: ${totalDuration}ms, ` +
                    `Pixel data: ${(streamResult.pixelDataBytesProcessed / 1024 / 1024).toFixed(2)}MB, ` +
                    `Tags modified: ${streamResult.modifiedTags.length}, ` +
                    `Tags removed: ${streamResult.removedTags.length}, ` +
                    `Sensitivity: ${sensitivityLevel}`);
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
                        patientSensitivityLevel: sensitivityLevel,
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
    createSmartAnonymizationStream(sourceStream, baseRule, hospitalId, sourceAeTitle, traceId) {
        return new Promise((resolve, reject) => {
            const preBuffer = [];
            let preBufferSize = 0;
            let patientId = null;
            let metadataReady = false;
            let errorOccurred = false;
            const preParser = new dicom_stream_parser_1.DicomStreamParser();
            preParser.on('tag', (event) => {
                if (event.group === 0x0010 && event.element === 0x0020 && event.value) {
                    patientId = String(event.value).trim().replace(/\0/g, '');
                    this.logger.debug(`[${traceId}] Found patient ID in stream: ${patientId}`);
                }
            });
            const finalize = async () => {
                if (metadataReady || errorOccurred)
                    return;
                metadataReady = true;
                try {
                    const result = await this.setupEnhancedStream(preBuffer, sourceStream, baseRule, hospitalId, sourceAeTitle, traceId, patientId);
                    resolve(result);
                }
                catch (error) {
                    errorOccurred = true;
                    reject(error);
                }
            };
            preParser.on('pixelDataStart', () => {
                this.logger.debug(`[${traceId}] Pixel data start detected, switching to enhanced stream`);
                finalize();
            });
            preParser.on('parseComplete', () => {
                this.logger.debug(`[${traceId}] Parse complete (no pixel data), finalizing stream`);
                finalize();
            });
            preParser.on('error', (error) => {
                if (!errorOccurred) {
                    errorOccurred = true;
                    this.logger.error(`[${traceId}] Pre-parser error: ${error.message}`);
                    reject(error);
                }
            });
            sourceStream.on('readable', () => {
                if (metadataReady || errorOccurred)
                    return;
                let chunk;
                while ((chunk = sourceStream.read()) !== null) {
                    if (metadataReady || errorOccurred) {
                        sourceStream.unshift(chunk);
                        break;
                    }
                    preBuffer.push(chunk);
                    preBufferSize += chunk.length;
                    try {
                        preParser.write(chunk);
                    }
                    catch (error) {
                        if (!errorOccurred) {
                            errorOccurred = true;
                            reject(error);
                        }
                        return;
                    }
                    if (preBufferSize > this.MAX_PREBUFFER_SIZE) {
                        this.logger.warn(`[${traceId}] Pre-buffer exceeded max size (${this.MAX_PREBUFFER_SIZE} bytes), ` +
                            `falling back to base rules`);
                        finalize();
                        break;
                    }
                }
            });
            sourceStream.on('end', () => {
                if (!metadataReady && !errorOccurred) {
                    preParser.end();
                    finalize();
                }
            });
            sourceStream.on('error', (error) => {
                if (!errorOccurred) {
                    errorOccurred = true;
                    reject(error);
                }
            });
        });
    }
    async setupEnhancedStream(preBuffer, sourceStream, baseRule, hospitalId, sourceAeTitle, traceId, patientId) {
        let patientState = null;
        let sensitivityLevel = 'normal';
        if (patientId) {
            patientState = await this.patientStateService.getPatientState(patientId, hospitalId);
            if (patientState) {
                sensitivityLevel = patientState.sensitivityLevel || 'normal';
                this.logger.debug(`[${traceId}] Patient state loaded: sensitivity=${sensitivityLevel}, ` +
                    `status=${patientState.patientAccountStatus}`);
            }
            else {
                this.logger.debug(`[${traceId}] No patient state found for ${patientId}, using base rules`);
            }
        }
        const { stream: anonymizationStream, resultPromise: streamResultPromise, } = this.streamingAnonymizationEngine.createAnonymizationStream(baseRule, hospitalId, sourceAeTitle, patientState);
        const replayStream = new BufferedReplayStream(preBuffer, sourceStream);
        replayStream.pipe(anonymizationStream);
        return {
            outputStream: anonymizationStream,
            streamResultPromise,
            patientState,
            sensitivityLevel,
        };
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
        audit_logger_service_1.AuditLoggerService,
        patient_state_service_1.PatientStateService,
        mllp_server_service_1.MllpServerService])
], GatewayCoordinator);
//# sourceMappingURL=gateway-coordinator.service.js.map