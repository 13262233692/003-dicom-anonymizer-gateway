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
var DicomScpServer_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DicomScpServer = void 0;
const common_1 = require("@nestjs/common");
const net = __importStar(require("net"));
const stream_1 = require("stream");
const uuid_1 = require("uuid");
const configuration_1 = __importDefault(require("../common/config/configuration"));
const dicom_pdu_codec_service_1 = require("./dicom-pdu-codec.service");
const dimse_codec_service_1 = require("./dimse-codec.service");
const dicom_pdu_types_1 = require("./dicom-pdu.types");
const custom_exceptions_1 = require("../common/exceptions/custom.exceptions");
const rxjs_1 = require("rxjs");
let DicomScpServer = DicomScpServer_1 = class DicomScpServer {
    constructor(config, pduCodec, dimseCodec) {
        this.config = config;
        this.pduCodec = pduCodec;
        this.dimseCodec = dimseCodec;
        this.logger = new common_1.Logger(DicomScpServer_1.name);
        this.server = null;
        this.associations = new Map();
        this.cStoreRequestSubject = new rxjs_1.Subject();
        this.cStoreStreamRequestSubject = new rxjs_1.Subject();
    }
    get cStoreRequests$() {
        return this.cStoreRequestSubject.asObservable();
    }
    get cStoreStreamRequests$() {
        return this.cStoreStreamRequestSubject.asObservable();
    }
    onModuleInit() {
        this.startServer();
    }
    onModuleDestroy() {
        this.stopServer();
    }
    startServer() {
        const port = this.config.dicomScp.port;
        const aeTitle = this.config.dicomScp.aeTitle;
        this.server = net.createServer((socket) => {
            this.handleConnection(socket);
        });
        this.server.listen(port, () => {
            this.logger.log(`DICOM SCP Server listening on port ${port}, AE Title: ${aeTitle}`);
        });
        this.server.on('error', (error) => {
            this.logger.error(`DICOM SCP Server error: ${error.message}`);
        });
    }
    stopServer() {
        if (this.server) {
            this.server.close(() => {
                this.logger.log('DICOM SCP Server stopped');
            });
            this.associations.forEach((assoc) => {
                assoc.state = dicom_pdu_types_1.AssociationState.ABORTED;
            });
            this.associations.clear();
        }
    }
    handleConnection(socket) {
        const connectionId = (0, uuid_1.v4)();
        const callingHost = socket.remoteAddress || 'unknown';
        const callingPort = socket.remotePort || 0;
        this.logger.debug(`New connection from ${callingHost}:${callingPort} (ID: ${connectionId})`);
        socket.setTimeout(this.config.dicomScp.connectionTimeout);
        socket.setKeepAlive(true);
        let association = null;
        let receiveBuffer = Buffer.alloc(0);
        let commandBuffer = null;
        let dataSetBuffer = null;
        let currentPresentationContextId = 0;
        let isCollectingDataSet = false;
        let streamDataSet = null;
        let streamCommand = null;
        let streamContextId = 0;
        let isStreaming = false;
        socket.on('data', async (data) => {
            receiveBuffer = Buffer.concat([receiveBuffer, data]);
            while (receiveBuffer.length >= 6) {
                const pduType = receiveBuffer.readUInt8(0);
                const pduLength = receiveBuffer.readUInt32BE(2);
                const totalPduSize = 6 + pduLength;
                if (receiveBuffer.length < totalPduSize) {
                    break;
                }
                const pduData = Buffer.from(receiveBuffer.subarray(0, totalPduSize));
                receiveBuffer = Buffer.from(receiveBuffer.subarray(totalPduSize));
                try {
                    const pdu = this.pduCodec.decode(pduData);
                    switch (pdu.type) {
                        case dicom_pdu_types_1.PduType.A_ASSOCIATE_RQ:
                            association = await this.handleAssociateRq(socket, pdu, connectionId, callingHost, callingPort);
                            break;
                        case dicom_pdu_types_1.PduType.P_DATA_TF:
                            if (association) {
                                for (const pdv of pdu.pdvItems) {
                                    if (pdv.command) {
                                        if (pdv.last && !isCollectingDataSet && !isStreaming) {
                                            const cmdBuf = pdv.data;
                                            await this.handleDimseCommand(socket, association, pdv.presentationContextId, cmdBuf, null);
                                            commandBuffer = null;
                                        }
                                        else {
                                            commandBuffer = commandBuffer ? Buffer.concat([commandBuffer, pdv.data]) : pdv.data;
                                            if (pdv.last && commandBuffer) {
                                                const cmdBuf = commandBuffer;
                                                try {
                                                    const cmd = this.dimseCodec.decodeCommand(cmdBuf);
                                                    if (cmd.commandField === dicom_pdu_types_1.CommandField.C_STORE_RQ) {
                                                        isStreaming = true;
                                                        streamCommand = cmd;
                                                        streamContextId = pdv.presentationContextId;
                                                        streamDataSet = new stream_1.PassThrough();
                                                        const streamRequest = {
                                                            association,
                                                            presentationContextId: pdv.presentationContextId,
                                                            command: cmd,
                                                            dataSetStream: streamDataSet,
                                                            messageId: cmd.messageId,
                                                            respond: (status) => {
                                                                this.sendCStoreResponse(socket, association, pdv.presentationContextId, cmd.messageId, status, cmd.sopClassUid || '', cmd.sopInstanceUid || '');
                                                            },
                                                        };
                                                        this.cStoreStreamRequestSubject.next(streamRequest);
                                                        this.logger.debug(`Streaming C-STORE started: SOP=${cmd.sopInstanceUid}`);
                                                    }
                                                    else {
                                                        isCollectingDataSet = true;
                                                    }
                                                }
                                                catch (e) {
                                                    this.logger.error(`Error decoding command: ${e.message}`);
                                                    isCollectingDataSet = true;
                                                }
                                                commandBuffer = null;
                                            }
                                        }
                                    }
                                    else {
                                        if (isStreaming && streamDataSet) {
                                            streamDataSet.write(pdv.data);
                                            if (pdv.last) {
                                                streamDataSet.end();
                                                this.logger.debug(`Streaming C-STORE data set ended: SOP=${streamCommand?.sopInstanceUid}`);
                                                streamDataSet = null;
                                                isStreaming = false;
                                                streamCommand = null;
                                            }
                                        }
                                        else {
                                            dataSetBuffer = dataSetBuffer ? Buffer.concat([dataSetBuffer, pdv.data]) : pdv.data;
                                            currentPresentationContextId = pdv.presentationContextId;
                                            if (pdv.last) {
                                                if (commandBuffer) {
                                                    await this.handleDimseCommand(socket, association, currentPresentationContextId, commandBuffer, dataSetBuffer);
                                                }
                                                commandBuffer = null;
                                                dataSetBuffer = null;
                                                isCollectingDataSet = false;
                                            }
                                        }
                                    }
                                }
                            }
                            break;
                        case dicom_pdu_types_1.PduType.A_RELEASE_RQ:
                            if (association) {
                                this.handleReleaseRq(socket, association);
                            }
                            break;
                        case dicom_pdu_types_1.PduType.A_ABORT:
                            if (association) {
                                this.handleAbort(association, pdu);
                                socket.end();
                            }
                            break;
                        default:
                            break;
                    }
                }
                catch (error) {
                    this.logger.error(`Error processing PDU: ${error.message}`);
                    socket.end();
                }
            }
        });
        socket.on('timeout', () => {
            this.logger.warn(`Connection timeout for ${callingHost}:${callingPort}`);
            socket.end();
        });
        socket.on('error', (error) => {
            this.logger.error(`Socket error for ${callingHost}:${callingPort}: ${error.message}`);
            if (association) {
                association.state = dicom_pdu_types_1.AssociationState.ABORTED;
                this.associations.delete(association.id);
            }
        });
        socket.on('close', () => {
            this.logger.debug(`Connection closed from ${callingHost}:${callingPort}`);
            if (association) {
                this.associations.delete(association.id);
            }
        });
    }
    async handleAssociateRq(socket, pdu, connectionId, callingHost, callingPort) {
        this.logger.log(`Association request: Calling=${pdu.callingAeTitle}, Called=${pdu.calledAeTitle}`);
        if (pdu.calledAeTitle !== this.config.dicomScp.aeTitle) {
            this.logger.warn(`Association rejected: Unknown Called AE Title '${pdu.calledAeTitle}'`);
            const rejectPdu = {
                type: dicom_pdu_types_1.PduType.A_ASSOCIATE_RJ,
                result: 1,
                source: 1,
                reason: 3,
            };
            socket.write(this.pduCodec.encode(rejectPdu));
            socket.end();
            throw new custom_exceptions_1.DicomNetworkException(`Unknown Called AE Title: ${pdu.calledAeTitle}`, pdu.calledAeTitle);
        }
        const acceptedContexts = [];
        const presentationContexts = new Map();
        for (const ctx of pdu.presentationContexts) {
            const acceptedTransferSyntax = this.selectTransferSyntax(ctx.transferSyntaxes);
            if (acceptedTransferSyntax) {
                acceptedContexts.push({
                    id: ctx.id,
                    abstractSyntax: ctx.abstractSyntax,
                    transferSyntaxes: [],
                    result: 0,
                    acceptedTransferSyntax,
                });
                presentationContexts.set(ctx.id, {
                    ...ctx,
                    acceptedTransferSyntax,
                    result: 0,
                });
                this.logger.debug(`Accepted presentation context ${ctx.id}: ${ctx.abstractSyntax} -> ${acceptedTransferSyntax}`);
            }
            else {
                acceptedContexts.push({
                    id: ctx.id,
                    abstractSyntax: ctx.abstractSyntax,
                    transferSyntaxes: [],
                    result: 1,
                });
                this.logger.debug(`Rejected presentation context ${ctx.id}: ${ctx.abstractSyntax}`);
            }
        }
        const association = {
            id: connectionId,
            callingAeTitle: pdu.callingAeTitle,
            calledAeTitle: pdu.calledAeTitle,
            callingHost,
            callingPort,
            presentationContexts,
            maxReceivePduLength: pdu.maxLength,
            maxSendPduLength: 65536,
            acceptedAt: new Date(),
            state: dicom_pdu_types_1.AssociationState.ASSOCIATION_ESTABLISHED,
        };
        this.associations.set(connectionId, association);
        const acceptPdu = {
            type: dicom_pdu_types_1.PduType.A_ASSOCIATE_AC,
            callingAeTitle: pdu.callingAeTitle,
            calledAeTitle: pdu.calledAeTitle,
            applicationContext: pdu.applicationContext,
            presentationContexts: acceptedContexts,
            maxLength: association.maxSendPduLength,
            implementationClassUid: '1.2.276.0.7230010.3.0.3.6.2',
            implementationVersionName: 'ANON_GW_1_0',
        };
        socket.write(this.pduCodec.encode(acceptPdu));
        this.logger.log(`Association established with ${pdu.callingAeTitle}@${callingHost}:${callingPort}`);
        return association;
    }
    selectTransferSyntax(transferSyntaxes) {
        const preferredOrder = [
            '1.2.840.10008.1.2.1',
            '1.2.840.10008.1.2',
            '1.2.840.10008.1.2.2',
            '1.2.840.10008.1.2.99',
        ];
        for (const ts of preferredOrder) {
            if (transferSyntaxes.includes(ts)) {
                return ts;
            }
        }
        if (transferSyntaxes.length > 0) {
            return transferSyntaxes[0];
        }
        return null;
    }
    async handleDimseCommand(socket, association, presentationContextId, commandData, dataSet) {
        try {
            const command = this.dimseCodec.decodeCommand(commandData);
            switch (command.commandField) {
                case dicom_pdu_types_1.CommandField.C_ECHO_RQ:
                    this.logger.debug(`C-ECHO request from ${association.callingAeTitle}`);
                    this.sendCEchoResponse(socket, association, presentationContextId, command.messageId);
                    break;
                case dicom_pdu_types_1.CommandField.C_STORE_RQ: {
                    this.logger.debug(`C-STORE request: SOPClass=${command.sopClassUid}, SOPInstance=${command.sopInstanceUid}`);
                    if (!dataSet) {
                        this.sendCStoreResponse(socket, association, presentationContextId, command.messageId, dicom_pdu_types_1.DimseStatus.C_STORE_UNABLE_TO_PROCESS, command.sopClassUid || '', command.sopInstanceUid || '');
                        return;
                    }
                    const request = {
                        association,
                        presentationContextId,
                        command,
                        dataSet,
                    };
                    this.cStoreRequestSubject.next(request);
                    this.sendCStoreResponse(socket, association, presentationContextId, command.messageId, dicom_pdu_types_1.DimseStatus.SUCCESS, command.sopClassUid || '', command.sopInstanceUid || '');
                    break;
                }
                default:
                    this.logger.warn(`Unsupported DIMSE command: 0x${command.commandField.toString(16)}`);
                    break;
            }
        }
        catch (error) {
            this.logger.error(`Error handling DIMSE command: ${error.message}`);
        }
    }
    sendCStoreResponse(socket, association, presentationContextId, messageId, status, sopClassUid, sopInstanceUid) {
        const responseCommand = this.dimseCodec.encodeCStoreResponse(messageId, status, sopClassUid, sopInstanceUid);
        const chunks = this.pduCodec.encodePDataChunks(presentationContextId, responseCommand, null, Math.min(association.maxReceivePduLength, 16384));
        for (const chunk of chunks) {
            socket.write(chunk);
        }
    }
    sendCEchoResponse(socket, association, presentationContextId, messageId) {
        const responseCommand = this.dimseCodec.encodeCEchoResponse(messageId, dicom_pdu_types_1.DimseStatus.SUCCESS);
        const chunks = this.pduCodec.encodePDataChunks(presentationContextId, responseCommand, null, Math.min(association.maxReceivePduLength, 16384));
        for (const chunk of chunks) {
            socket.write(chunk);
        }
    }
    handleReleaseRq(socket, association) {
        this.logger.log(`Release request from ${association.callingAeTitle}`);
        association.state = dicom_pdu_types_1.AssociationState.AWAITING_RELEASE_RP;
        socket.write(this.pduCodec.encode({
            type: dicom_pdu_types_1.PduType.A_RELEASE_RP,
        }));
        association.state = dicom_pdu_types_1.AssociationState.RELEASED;
        this.logger.log(`Association released with ${association.callingAeTitle}`);
    }
    handleAbort(association, pdu) {
        this.logger.warn(`Association aborted by ${association.callingAeTitle}: source=${pdu.source}, reason=${pdu.reason}`);
        association.state = dicom_pdu_types_1.AssociationState.ABORTED;
        this.associations.delete(association.id);
    }
    getActiveAssociations() {
        return Array.from(this.associations.values()).filter((a) => a.state === dicom_pdu_types_1.AssociationState.ASSOCIATION_ESTABLISHED);
    }
};
exports.DicomScpServer = DicomScpServer;
exports.DicomScpServer = DicomScpServer = DicomScpServer_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(configuration_1.default.KEY)),
    __metadata("design:paramtypes", [void 0, dicom_pdu_codec_service_1.DicomPduCodec,
        dimse_codec_service_1.DimseCodec])
], DicomScpServer);
//# sourceMappingURL=dicom-scp-server.service.js.map