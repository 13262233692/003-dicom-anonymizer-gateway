"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var StreamingAnonymizationEngine_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamingAnonymizationEngine = void 0;
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
const dicom_anonymization_stream_1 = require("./dicom-anonymization-stream");
const dicom_stream_parser_1 = require("./dicom-stream-parser");
let StreamingAnonymizationEngine = StreamingAnonymizationEngine_1 = class StreamingAnonymizationEngine {
    constructor() {
        this.logger = new common_1.Logger(StreamingAnonymizationEngine_1.name);
    }
    createAnonymizationStream(rule, hospitalId, sourceAeTitle) {
        const traceId = (0, uuid_1.v4)();
        this.logger.log(`[${traceId}] Creating streaming anonymization pipeline for hospital ${hospitalId}, source AE: ${sourceAeTitle}`);
        const stream = new dicom_anonymization_stream_1.DicomAnonymizationStream(rule.tagRules, {
            traceId,
            hospitalId,
        });
        const resultPromise = new Promise((resolve, reject) => {
            let resolved = false;
            stream.on('result', (result) => {
                if (!resolved) {
                    resolved = true;
                    this.logger.debug(`[${traceId}] Anonymization metadata ready: ` +
                        `modified=${result.modifiedTags.length}, ` +
                        `removed=${result.removedTags.length}, ` +
                        `pixelData=${(result.pixelDataBytesProcessed / 1024 / 1024).toFixed(2)}MB`);
                    resolve(result);
                }
            });
            stream.on('end', () => {
                if (!resolved) {
                    this.logger.warn(`[${traceId}] Stream ended without result event`);
                    resolve({
                        originalSopInstanceUid: '',
                        anonymizedSopInstanceUid: '',
                        originalPatientId: '',
                        anonymizedPatientId: '',
                        originalPatientName: '',
                        studyInstanceUid: '',
                        seriesInstanceUid: '',
                        sopClassUid: '',
                        modality: '',
                        modifiedTags: [],
                        removedTags: [],
                        pixelDataBytesProcessed: 0,
                        totalTagsProcessed: 0,
                    });
                }
            });
            stream.on('error', (error) => {
                if (!resolved) {
                    resolved = true;
                    this.logger.error(`[${traceId}] Anonymization stream error: ${error.message}`);
                    reject(error);
                }
            });
        });
        return {
            stream,
            resultPromise,
            traceId,
        };
    }
    async processBuffer(buffer, rule, hospitalId, sourceAeTitle) {
        const { stream, resultPromise, traceId } = this.createAnonymizationStream(rule, hospitalId, sourceAeTitle);
        const startTime = Date.now();
        const chunks = [];
        stream.on('data', (chunk) => {
            chunks.push(chunk);
        });
        return new Promise((resolve, reject) => {
            stream.on('end', async () => {
                try {
                    const metadata = await resultPromise;
                    const durationMs = Date.now() - startTime;
                    const anonymizedBuffer = Buffer.concat(chunks);
                    this.logger.log(`[${traceId}] Buffer anonymization completed: ` +
                        `${(anonymizedBuffer.length / 1024 / 1024).toFixed(2)}MB, ` +
                        `duration=${durationMs}ms`);
                    resolve({
                        traceId,
                        hospitalId,
                        originalSopInstanceUid: metadata.originalSopInstanceUid,
                        anonymizedSopInstanceUid: metadata.anonymizedSopInstanceUid,
                        anonymizedBuffer,
                        routingTarget: null,
                        modifiedTags: metadata.modifiedTags,
                        removedTags: metadata.removedTags,
                        processingDurationMs: durationMs,
                    });
                }
                catch (error) {
                    reject(error);
                }
            });
            stream.on('error', (error) => {
                reject(error);
            });
            stream.write(buffer);
            stream.end();
        });
    }
    parseMetadataOnly(buffer) {
        return new Promise((resolve, reject) => {
            const parser = new dicom_stream_parser_1.DicomStreamParser();
            const tags = new Map();
            parser.on('tag', (event) => {
                if (event.value !== null) {
                    tags.set(event.tagKey, {
                        group: event.group,
                        element: event.element,
                        vr: event.vr,
                        value: event.value,
                        length: event.length,
                        keyword: event.keyword,
                    });
                }
            });
            parser.on('pixelDataStart', () => {
                parser.end();
            });
            parser.on('parseComplete', () => {
                resolve(tags);
            });
            parser.on('error', (error) => {
                reject(error);
            });
            parser.end(buffer);
        });
    }
    getMemoryUsageInfo() {
        return {
            maxTagValueInMemory: '64 MB',
            streamHighWaterMark: '256 KB',
            expectedMemoryPerStream: '< 10 MB (metadata only, PixelData passthrough)',
        };
    }
};
exports.StreamingAnonymizationEngine = StreamingAnonymizationEngine;
exports.StreamingAnonymizationEngine = StreamingAnonymizationEngine = StreamingAnonymizationEngine_1 = __decorate([
    (0, common_1.Injectable)()
], StreamingAnonymizationEngine);
//# sourceMappingURL=streaming-anonymization-engine.service.js.map