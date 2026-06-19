"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var DicomScuClient_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DicomScuClient = void 0;
const common_1 = require("@nestjs/common");
const net = __importStar(require("net"));
const configuration_1 = __importDefault(require("../common/config/configuration"));
const dicom_pdu_codec_service_1 = require("./dicom-pdu-codec.service");
const dimse_codec_service_1 = require("./dimse-codec.service");
const dicom_pdu_types_1 = require("./dicom-pdu.types");
const dicom_types_1 = require("../common/types/dicom.types");
const custom_exceptions_1 = require("../common/exceptions/custom.exceptions");
let DicomScuClient = DicomScuClient_1 = class DicomScuClient {
    constructor(config, pduCodec, dimseCodec) {
        this.config = config;
        this.pduCodec = pduCodec;
        this.dimseCodec = dimseCodec;
        this.logger = new common_1.Logger(DicomScuClient_1.name);
    }
    async cStore(targetHost, targetPort, targetAeTitle, sourceAeTitle, sopClassUid, sopInstanceUid, dicomData, context) {
        const traceId = context?.studyInstanceUid || sopInstanceUid;
        this.logger.log(`[${traceId}] Initiating C-STORE to ${targetAeTitle}@${targetHost}:${targetPort} for SOP=${sopInstanceUid}`);
        return new Promise((resolve, reject) => {
            const socket = new net.Socket();
            const timeout = this.config.dicomScp.requestTimeout;
            const cleanup = () => {
                try {
                    socket.destroy();
                }
                catch (_e) {
                }
            };
            const timer = setTimeout(() => {
                cleanup();
                reject(new custom_exceptions_1.DicomNetworkException('C-STORE timeout', targetAeTitle));
            }, timeout);
            let associationEstablished = false;
            let receiveBuffer = Buffer.alloc(0);
            let storeCompleted = false;
            let currentContextId = 0;
            socket.on('connect', () => {
                this.logger.debug(`[${traceId}] TCP connected to ${targetHost}:${targetPort}`);
                this.sendAssociateRq(socket, sourceAeTitle, targetAeTitle, sopClassUid);
            });
            socket.on('data', (data) => {
                receiveBuffer = Buffer.concat([receiveBuffer, data]);
                while (receiveBuffer.length >= 6) {
                    const pduType = receiveBuffer.readUInt8(0);
                    const pduLength = receiveBuffer.readUInt32BE(2);
                    const totalSize = 6 + pduLength;
                    if (receiveBuffer.length < totalSize)
                        break;
                    const pduData = Buffer.from(receiveBuffer.subarray(0, totalSize));
                    receiveBuffer = Buffer.from(receiveBuffer.subarray(totalSize));
                    try {
                        const pdu = this.pduCodec.decode(pduData);
                        switch (pdu.type) {
                            case dicom_pdu_types_1.PduType.A_ASSOCIATE_AC:
                                this.logger.debug(`[${traceId}] Association accepted`);
                                associationEstablished = true;
                                const acPdu = pdu;
                                const acceptedCtx = (acPdu.presentationContexts || []).find((c) => c.result === 0);
                                if (acceptedCtx) {
                                    currentContextId = acceptedCtx.id;
                                }
                                else {
                                    currentContextId = 1;
                                }
                                this.sendCStore(socket, currentContextId, sopClassUid, sopInstanceUid, dicomData, acPdu.maxLength || 16384);
                                break;
                            case dicom_pdu_types_1.PduType.A_ASSOCIATE_RJ:
                                clearTimeout(timer);
                                cleanup();
                                reject(new custom_exceptions_1.DicomNetworkException('Association rejected', targetAeTitle));
                                return;
                            case dicom_pdu_types_1.PduType.P_DATA_TF: {
                                const pdvItems = pdu.pdvItems || [];
                                for (const pdv of pdvItems) {
                                    if (pdv.command && pdv.last && !storeCompleted) {
                                        try {
                                            const response = this.dimseCodec.decodeCommand(pdv.data);
                                            if (response.commandField === dicom_pdu_types_1.CommandField.C_STORE_RSP) {
                                                storeCompleted = true;
                                                this.logger.log(`[${traceId}] C-STORE completed with status: 0x${response.status.toString(16)}`);
                                                this.sendReleaseRq(socket);
                                                clearTimeout(timer);
                                                resolve(response.status);
                                            }
                                        }
                                        catch (e) {
                                            this.logger.error(`[${traceId}] Error parsing response: ${e.message}`);
                                        }
                                    }
                                }
                                break;
                            }
                            case dicom_pdu_types_1.PduType.A_RELEASE_RP:
                                this.logger.debug(`[${traceId}] Release confirmed`);
                                clearTimeout(timer);
                                cleanup();
                                if (!storeCompleted) {
                                    resolve(dicom_pdu_types_1.DimseStatus.SUCCESS);
                                }
                                return;
                            case dicom_pdu_types_1.PduType.A_ABORT:
                                clearTimeout(timer);
                                cleanup();
                                reject(new custom_exceptions_1.DicomNetworkException('Association aborted', targetAeTitle));
                                return;
                            default:
                                break;
                        }
                    }
                    catch (error) {
                        this.logger.error(`[${traceId}] PDU decode error: ${error.message}`);
                    }
                }
            });
            socket.on('error', (error) => {
                clearTimeout(timer);
                cleanup();
                reject(new custom_exceptions_1.DicomNetworkException(`Socket error: ${error.message}`, targetAeTitle, error));
            });
            socket.on('close', () => {
                clearTimeout(timer);
                if (!storeCompleted) {
                    reject(new custom_exceptions_1.DicomNetworkException('Connection closed before C-STORE completed', targetAeTitle));
                }
            });
            socket.connect(targetPort, targetHost);
        });
    }
    async cStoreStream(targetHost, targetPort, targetAeTitle, sourceAeTitle, sopClassUid, sopInstanceUid, dataSetStream, context) {
        const traceId = context?.studyInstanceUid || sopInstanceUid;
        this.logger.log(`[${traceId}] Initiating streaming C-STORE to ${targetAeTitle}@${targetHost}:${targetPort} for SOP=${sopInstanceUid}`);
        return new Promise((resolve, reject) => {
            const socket = new net.Socket();
            const timeout = this.config.dicomScp.requestTimeout;
            const cleanup = () => {
                try {
                    dataSetStream.destroy();
                }
                catch (_e) {
                }
                try {
                    socket.destroy();
                }
                catch (_e) {
                }
            };
            const timer = setTimeout(() => {
                cleanup();
                reject(new custom_exceptions_1.DicomNetworkException('C-STORE timeout', targetAeTitle));
            }, timeout);
            let associationEstablished = false;
            let receiveBuffer = Buffer.alloc(0);
            let storeCompleted = false;
            let currentContextId = 0;
            let maxPduLength = 16384;
            let dataSetStarted = false;
            let dataSetFinished = false;
            const startStreaming = () => {
                if (dataSetStarted)
                    return;
                dataSetStarted = true;
                this.logger.debug(`[${traceId}] Starting data set streaming`);
                let pendingBuffer = Buffer.alloc(0);
                const chunkSize = Math.min(maxPduLength - 12, 16000);
                const sendDataPdu = (data, isLast) => {
                    const pdvItem = {
                        presentationContextId: currentContextId,
                        command: false,
                        last: isLast,
                        data,
                    };
                    const pduBuf = this.pduCodec.encode({
                        type: dicom_pdu_types_1.PduType.P_DATA_TF,
                        pdvItems: [pdvItem],
                    });
                    socket.write(pduBuf);
                };
                const flushBuffer = (isLast) => {
                    while (pendingBuffer.length > 0) {
                        const toSend = pendingBuffer.slice(0, chunkSize);
                        pendingBuffer = pendingBuffer.slice(toSend.length);
                        const isLastChunk = isLast && pendingBuffer.length === 0;
                        sendDataPdu(toSend, isLastChunk);
                    }
                    if (isLast && pendingBuffer.length === 0) {
                        sendDataPdu(Buffer.alloc(0), true);
                    }
                };
                dataSetStream.on('data', (chunk) => {
                    pendingBuffer = Buffer.concat([pendingBuffer, chunk]);
                    if (pendingBuffer.length >= chunkSize) {
                        flushBuffer(false);
                    }
                });
                dataSetStream.on('end', () => {
                    this.logger.debug(`[${traceId}] Data set stream ended`);
                    dataSetFinished = true;
                    flushBuffer(true);
                });
                dataSetStream.on('error', (error) => {
                    this.logger.error(`[${traceId}] Data set stream error: ${error.message}`);
                    clearTimeout(timer);
                    cleanup();
                    reject(error);
                });
            };
            socket.on('connect', () => {
                this.logger.debug(`[${traceId}] TCP connected to ${targetHost}:${targetPort}`);
                this.sendAssociateRq(socket, sourceAeTitle, targetAeTitle, sopClassUid);
            });
            socket.on('data', (data) => {
                receiveBuffer = Buffer.concat([receiveBuffer, data]);
                while (receiveBuffer.length >= 6) {
                    const pduType = receiveBuffer.readUInt8(0);
                    const pduLength = receiveBuffer.readUInt32BE(2);
                    const totalSize = 6 + pduLength;
                    if (receiveBuffer.length < totalSize)
                        break;
                    const pduData = Buffer.from(receiveBuffer.subarray(0, totalSize));
                    receiveBuffer = Buffer.from(receiveBuffer.subarray(totalSize));
                    try {
                        const pdu = this.pduCodec.decode(pduData);
                        switch (pdu.type) {
                            case dicom_pdu_types_1.PduType.A_ASSOCIATE_AC:
                                this.logger.debug(`[${traceId}] Association accepted`);
                                associationEstablished = true;
                                const acPdu = pdu;
                                const acceptedCtx = (acPdu.presentationContexts || []).find((c) => c.result === 0);
                                if (acceptedCtx) {
                                    currentContextId = acceptedCtx.id;
                                }
                                else {
                                    currentContextId = 1;
                                }
                                maxPduLength = acPdu.maxLength || 16384;
                                this.sendCStoreCommandOnly(socket, currentContextId, sopClassUid, sopInstanceUid);
                                startStreaming();
                                break;
                            case dicom_pdu_types_1.PduType.A_ASSOCIATE_RJ:
                                clearTimeout(timer);
                                cleanup();
                                reject(new custom_exceptions_1.DicomNetworkException('Association rejected', targetAeTitle));
                                return;
                            case dicom_pdu_types_1.PduType.P_DATA_TF: {
                                const pdvItems = pdu.pdvItems || [];
                                for (const pdv of pdvItems) {
                                    if (pdv.command && pdv.last && !storeCompleted) {
                                        try {
                                            const response = this.dimseCodec.decodeCommand(pdv.data);
                                            if (response.commandField === dicom_pdu_types_1.CommandField.C_STORE_RSP) {
                                                storeCompleted = true;
                                                this.logger.log(`[${traceId}] Streaming C-STORE completed with status: 0x${response.status.toString(16)}`);
                                                this.sendReleaseRq(socket);
                                                clearTimeout(timer);
                                                resolve(response.status);
                                            }
                                        }
                                        catch (e) {
                                            this.logger.error(`[${traceId}] Error parsing response: ${e.message}`);
                                        }
                                    }
                                }
                                break;
                            }
                            case dicom_pdu_types_1.PduType.A_RELEASE_RP:
                                this.logger.debug(`[${traceId}] Release confirmed`);
                                clearTimeout(timer);
                                cleanup();
                                if (!storeCompleted) {
                                    resolve(dicom_pdu_types_1.DimseStatus.SUCCESS);
                                }
                                return;
                            case dicom_pdu_types_1.PduType.A_ABORT:
                                clearTimeout(timer);
                                cleanup();
                                reject(new custom_exceptions_1.DicomNetworkException('Association aborted', targetAeTitle));
                                return;
                            default:
                                break;
                        }
                    }
                    catch (error) {
                        this.logger.error(`[${traceId}] PDU decode error: ${error.message}`);
                    }
                }
            });
            socket.on('error', (error) => {
                clearTimeout(timer);
                cleanup();
                reject(new custom_exceptions_1.DicomNetworkException(`Socket error: ${error.message}`, targetAeTitle, error));
            });
            socket.on('close', () => {
                clearTimeout(timer);
                if (!storeCompleted) {
                    reject(new custom_exceptions_1.DicomNetworkException('Connection closed before C-STORE completed', targetAeTitle));
                }
            });
            socket.connect(targetPort, targetHost);
        });
    }
    sendAssociateRq(socket, sourceAeTitle, targetAeTitle, sopClassUid) {
        const maxPdu = 16384;
        const variableItems = [];
        const appCtx = '1.2.840.10008.3.1.1.1';
        const appCtxBuf = Buffer.alloc(4 + appCtx.length);
        appCtxBuf.writeUInt8(0x10, 0);
        appCtxBuf.writeUInt16BE(appCtx.length, 2);
        appCtxBuf.write(appCtx, 4, 'ascii');
        variableItems.push(appCtxBuf);
        const presentationContexts = [
            {
                id: 1,
                abstractSyntax: sopClassUid,
                transferSyntaxes: ['1.2.840.10008.1.2.1', '1.2.840.10008.1.2'],
            },
        ];
        for (const pc of presentationContexts) {
            const absSynBuf = Buffer.alloc(4 + pc.abstractSyntax.length);
            absSynBuf.writeUInt8(0x30, 0);
            absSynBuf.writeUInt16BE(pc.abstractSyntax.length, 2);
            absSynBuf.write(pc.abstractSyntax, 4, 'ascii');
            const tsBuffers = [];
            for (const ts of pc.transferSyntaxes) {
                const tsBuf = Buffer.alloc(4 + ts.length);
                tsBuf.writeUInt8(0x40, 0);
                tsBuf.writeUInt16BE(ts.length, 2);
                tsBuf.write(ts, 4, 'ascii');
                tsBuffers.push(tsBuf);
            }
            const pcContentLen = 4 + absSynBuf.length + tsBuffers.reduce((s, b) => s + b.length, 0);
            const pcBuf = Buffer.alloc(4 + pcContentLen);
            pcBuf.writeUInt8(0x20, 0);
            pcBuf.writeUInt16BE(pcContentLen, 2);
            pcBuf.writeUInt8(pc.id, 4);
            let offset = 8;
            absSynBuf.copy(pcBuf, offset);
            offset += absSynBuf.length;
            for (const tsBuf of tsBuffers) {
                tsBuf.copy(pcBuf, offset);
                offset += tsBuf.length;
            }
            variableItems.push(pcBuf);
        }
        const maxPduBuf = Buffer.alloc(8);
        maxPduBuf.writeUInt8(0x51, 0);
        maxPduBuf.writeUInt16BE(4, 2);
        maxPduBuf.writeUInt32BE(maxPdu, 4);
        const userInfoMaxPdu = Buffer.alloc(4 + maxPduBuf.length);
        userInfoMaxPdu.writeUInt8(0x50, 0);
        userInfoMaxPdu.writeUInt16BE(maxPduBuf.length, 2);
        maxPduBuf.copy(userInfoMaxPdu, 4);
        variableItems.push(userInfoMaxPdu);
        const implClassUid = '1.2.276.0.7230010.3.0.3.6.2';
        const implClassBuf = Buffer.alloc(4 + implClassUid.length);
        implClassBuf.writeUInt8(0x52, 0);
        implClassBuf.writeUInt16BE(implClassUid.length, 2);
        implClassBuf.write(implClassUid, 4, 'ascii');
        const userInfoClass = Buffer.alloc(4 + implClassBuf.length);
        userInfoClass.writeUInt8(0x50, 0);
        userInfoClass.writeUInt16BE(implClassBuf.length, 2);
        implClassBuf.copy(userInfoClass, 4);
        variableItems.push(userInfoClass);
        const implVerName = 'ANON_GW_1_0';
        const implVerBuf = Buffer.alloc(4 + implVerName.length);
        implVerBuf.writeUInt8(0x55, 0);
        implVerBuf.writeUInt16BE(implVerName.length, 2);
        implVerBuf.write(implVerName, 4, 'ascii');
        const userInfoVer = Buffer.alloc(4 + implVerBuf.length);
        userInfoVer.writeUInt8(0x50, 0);
        userInfoVer.writeUInt16BE(implVerBuf.length, 2);
        implVerBuf.copy(userInfoVer, 4);
        variableItems.push(userInfoVer);
        const variableTotal = variableItems.reduce((s, b) => s + b.length, 0);
        const totalLength = 68 + variableTotal;
        const pdu = Buffer.alloc(6 + totalLength);
        pdu.writeUInt8(dicom_pdu_types_1.PduType.A_ASSOCIATE_RQ, 0);
        pdu.writeUInt32BE(totalLength, 2);
        pdu.writeUInt16BE(1, 6);
        pdu.write(targetAeTitle.padEnd(16, ' '), 10, 'ascii');
        pdu.write(sourceAeTitle.padEnd(16, ' '), 26, 'ascii');
        let offset = 74;
        for (const item of variableItems) {
            item.copy(pdu, offset);
            offset += item.length;
        }
        socket.write(pdu);
    }
    sendCStore(socket, presentationContextId, sopClassUid, sopInstanceUid, dataSet, maxPduLength) {
        const messageId = 1;
        const chunks = [];
        chunks.push(this.encodeTag(0x0000, 0x0000, dicom_types_1.DicomTagVR.UL, 0));
        chunks.push(this.encodeTag(0x0000, 0x0002, dicom_types_1.DicomTagVR.UI, '1.2.840.10008.1.2'));
        chunks.push(this.encodeTag(0x0000, 0x0100, dicom_types_1.DicomTagVR.US, dicom_pdu_types_1.CommandField.C_STORE_RQ));
        chunks.push(this.encodeTag(0x0000, 0x0110, dicom_types_1.DicomTagVR.US, messageId));
        chunks.push(this.encodeTag(0x0000, 0x0700, dicom_types_1.DicomTagVR.US, 0));
        chunks.push(this.encodeTag(0x0000, 0x0800, dicom_types_1.DicomTagVR.US, 0x0000));
        chunks.push(this.encodeTag(0x0000, 0x0002, dicom_types_1.DicomTagVR.UI, sopClassUid));
        chunks.push(this.encodeTag(0x0000, 0x1000, dicom_types_1.DicomTagVR.UI, sopInstanceUid));
        chunks.push(this.encodeTag(0x0000, 0x0010, dicom_types_1.DicomTagVR.US, 0));
        const commandBuf = Buffer.concat(chunks);
        const totalLength = commandBuf.length - 8;
        commandBuf.writeUInt32LE(totalLength, 4);
        const pduChunks = this.pduCodec.encodePDataChunks(presentationContextId, commandBuf, dataSet, Math.min(maxPduLength, 16384));
        for (const chunk of pduChunks) {
            socket.write(chunk);
        }
    }
    sendCStoreCommandOnly(socket, presentationContextId, sopClassUid, sopInstanceUid) {
        const messageId = 1;
        const chunks = [];
        chunks.push(this.encodeTag(0x0000, 0x0000, dicom_types_1.DicomTagVR.UL, 0));
        chunks.push(this.encodeTag(0x0000, 0x0002, dicom_types_1.DicomTagVR.UI, '1.2.840.10008.1.2'));
        chunks.push(this.encodeTag(0x0000, 0x0100, dicom_types_1.DicomTagVR.US, dicom_pdu_types_1.CommandField.C_STORE_RQ));
        chunks.push(this.encodeTag(0x0000, 0x0110, dicom_types_1.DicomTagVR.US, messageId));
        chunks.push(this.encodeTag(0x0000, 0x0700, dicom_types_1.DicomTagVR.US, 0));
        chunks.push(this.encodeTag(0x0000, 0x0800, dicom_types_1.DicomTagVR.US, 0x0000));
        chunks.push(this.encodeTag(0x0000, 0x0002, dicom_types_1.DicomTagVR.UI, sopClassUid));
        chunks.push(this.encodeTag(0x0000, 0x1000, dicom_types_1.DicomTagVR.UI, sopInstanceUid));
        chunks.push(this.encodeTag(0x0000, 0x0010, dicom_types_1.DicomTagVR.US, 0));
        const commandBuf = Buffer.concat(chunks);
        const totalLength = commandBuf.length - 8;
        commandBuf.writeUInt32LE(totalLength, 4);
        const pdvItem = {
            presentationContextId,
            command: true,
            last: false,
            data: commandBuf,
        };
        const pduBuf = this.pduCodec.encode({
            type: dicom_pdu_types_1.PduType.P_DATA_TF,
            pdvItems: [pdvItem],
        });
        socket.write(pduBuf);
    }
    sendReleaseRq(socket) {
        const buf = Buffer.alloc(10);
        buf.writeUInt8(dicom_pdu_types_1.PduType.A_RELEASE_RQ, 0);
        buf.writeUInt32BE(4, 2);
        socket.write(buf);
    }
    encodeTag(group, element, vr, value) {
        const valueBuf = this.encodeValue(vr, value);
        const isLongVR = ['OB', 'OW', 'OF', 'SQ', 'UC', 'UR', 'UT', 'UN', 'OD', 'OL', 'OV'].includes(vr);
        let header;
        if (isLongVR) {
            header = Buffer.alloc(12);
            header.writeUInt16LE(group, 0);
            header.writeUInt16LE(element, 2);
            header.write(vr, 4, 'ascii');
            header.writeUInt32LE(valueBuf.length, 8);
        }
        else {
            header = Buffer.alloc(8);
            header.writeUInt16LE(group, 0);
            header.writeUInt16LE(element, 2);
            header.write(vr, 4, 'ascii');
            header.writeUInt16LE(valueBuf.length, 6);
        }
        return Buffer.concat([header, valueBuf]);
    }
    encodeValue(vr, value) {
        switch (vr) {
            case dicom_types_1.DicomTagVR.US: {
                const buf = Buffer.alloc(2);
                buf.writeUInt16LE(Number(value) || 0, 0);
                return buf;
            }
            case dicom_types_1.DicomTagVR.UL: {
                const buf = Buffer.alloc(4);
                buf.writeUInt32LE(Number(value) || 0, 0);
                return buf;
            }
            case dicom_types_1.DicomTagVR.UI:
            case dicom_types_1.DicomTagVR.AE:
            case dicom_types_1.DicomTagVR.CS: {
                let str = String(value || '');
                if (str.length % 2 !== 0)
                    str += ' ';
                return Buffer.from(str, 'ascii');
            }
            default:
                return Buffer.alloc(0);
        }
    }
};
exports.DicomScuClient = DicomScuClient;
exports.DicomScuClient = DicomScuClient = DicomScuClient_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(configuration_1.default.KEY)),
    __metadata("design:paramtypes", [void 0, dicom_pdu_codec_service_1.DicomPduCodec,
        dimse_codec_service_1.DimseCodec])
], DicomScuClient);
//# sourceMappingURL=dicom-scu-client.service.js.map