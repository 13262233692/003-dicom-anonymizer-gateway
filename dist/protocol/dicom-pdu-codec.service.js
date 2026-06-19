"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DicomPduCodec_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DicomPduCodec = void 0;
const common_1 = require("@nestjs/common");
const dicom_pdu_types_1 = require("./dicom-pdu.types");
const custom_exceptions_1 = require("../common/exceptions/custom.exceptions");
let DicomPduCodec = DicomPduCodec_1 = class DicomPduCodec {
    constructor() {
        this.logger = new common_1.Logger(DicomPduCodec_1.name);
    }
    decode(buffer) {
        if (buffer.length < 6) {
            throw new custom_exceptions_1.DicomParseException('PDU buffer too small');
        }
        const type = buffer.readUInt8(0);
        const length = buffer.readUInt32BE(2);
        switch (type) {
            case dicom_pdu_types_1.PduType.A_ASSOCIATE_RQ:
                return this.decodeAssociateRq(buffer, length);
            case dicom_pdu_types_1.PduType.A_ASSOCIATE_AC:
                return this.decodeAssociateAc(buffer, length);
            case dicom_pdu_types_1.PduType.A_ASSOCIATE_RJ:
                return this.decodeAssociateRj(buffer);
            case dicom_pdu_types_1.PduType.P_DATA_TF:
                return this.decodePDataTf(buffer, length);
            case dicom_pdu_types_1.PduType.A_RELEASE_RQ:
                return { type: dicom_pdu_types_1.PduType.A_RELEASE_RQ };
            case dicom_pdu_types_1.PduType.A_RELEASE_RP:
                return { type: dicom_pdu_types_1.PduType.A_RELEASE_RP };
            case dicom_pdu_types_1.PduType.A_ABORT:
                return this.decodeAbort(buffer);
            default:
                throw new custom_exceptions_1.DicomParseException(`Unknown PDU type: 0x${type.toString(16)}`);
        }
    }
    decodeAssociateRq(buffer, _length) {
        let offset = 6;
        const protocolVersion = buffer.readUInt16BE(offset);
        offset += 4;
        const calledAeTitle = buffer.toString('ascii', offset, offset + 16).trim();
        offset += 16;
        const callingAeTitle = buffer.toString('ascii', offset, offset + 16).trim();
        offset += 16;
        offset += 32;
        const presentationContexts = [];
        let applicationContext = '';
        let maxLength = 16384;
        let implementationClassUid = '';
        let implementationVersionName = '';
        while (offset < buffer.length) {
            const itemType = buffer.readUInt8(offset);
            const itemLength = buffer.readUInt16BE(offset + 2);
            offset += 4;
            switch (itemType) {
                case 0x10:
                    applicationContext = buffer.toString('ascii', offset, offset + itemLength).trim();
                    break;
                case 0x20: {
                    const ctxId = buffer.readUInt8(offset);
                    offset += 4;
                    const absSyntaxLen = buffer.readUInt16BE(offset + 2);
                    const abstractSyntax = buffer.toString('ascii', offset + 4, offset + 4 + absSyntaxLen).trim();
                    offset += 4 + absSyntaxLen;
                    const transferSyntaxes = [];
                    let tsOffset = offset;
                    while (tsOffset < offset + (itemLength - (4 + absSyntaxLen))) {
                        const tsType = buffer.readUInt8(tsOffset);
                        if (tsType === 0x40) {
                            const tsLen = buffer.readUInt16BE(tsOffset + 2);
                            transferSyntaxes.push(buffer.toString('ascii', tsOffset + 4, tsOffset + 4 + tsLen).trim());
                            tsOffset += 4 + tsLen;
                        }
                        else {
                            tsOffset += 2;
                            const skipLen = buffer.readUInt16BE(tsOffset);
                            tsOffset += 2 + skipLen;
                        }
                    }
                    presentationContexts.push({
                        id: ctxId,
                        abstractSyntax,
                        transferSyntaxes,
                    });
                    break;
                }
                case 0x50: {
                    const subItemType = buffer.readUInt8(offset);
                    if (subItemType === 0x51) {
                        maxLength = buffer.readUInt32BE(offset + 4);
                    }
                    else if (subItemType === 0x52) {
                        implementationClassUid = buffer.toString('ascii', offset + 4, offset + itemLength).trim();
                    }
                    else if (subItemType === 0x55) {
                        implementationVersionName = buffer.toString('ascii', offset + 4, offset + itemLength).trim();
                    }
                    break;
                }
                default:
                    break;
            }
            offset += itemLength;
        }
        return {
            type: dicom_pdu_types_1.PduType.A_ASSOCIATE_RQ,
            callingAeTitle,
            calledAeTitle,
            applicationContext,
            presentationContexts,
            maxLength,
            implementationClassUid,
            implementationVersionName,
        };
    }
    decodeAssociateAc(buffer, _length) {
        let offset = 6;
        offset += 4;
        const calledAeTitle = buffer.toString('ascii', offset, offset + 16).trim();
        offset += 16;
        const callingAeTitle = buffer.toString('ascii', offset, offset + 16).trim();
        offset += 48;
        const presentationContexts = [];
        let applicationContext = '';
        let maxLength = 16384;
        let implementationClassUid = '';
        let implementationVersionName = '';
        while (offset < buffer.length) {
            const itemType = buffer.readUInt8(offset);
            const itemLength = buffer.readUInt16BE(offset + 2);
            offset += 4;
            switch (itemType) {
                case 0x10:
                    applicationContext = buffer.toString('ascii', offset, offset + itemLength).trim();
                    break;
                case 0x21: {
                    const ctxId = buffer.readUInt8(offset);
                    const result = buffer.readUInt8(offset + 3);
                    let tsOffset = offset + 4;
                    const tsLen = buffer.readUInt16BE(tsOffset + 2);
                    const acceptedTransferSyntax = buffer.toString('ascii', tsOffset + 4, tsOffset + 4 + tsLen).trim();
                    presentationContexts.push({
                        id: ctxId,
                        abstractSyntax: '',
                        transferSyntaxes: [],
                        result,
                        acceptedTransferSyntax,
                    });
                    break;
                }
                case 0x50: {
                    const subItemType = buffer.readUInt8(offset);
                    if (subItemType === 0x51) {
                        maxLength = buffer.readUInt32BE(offset + 4);
                    }
                    else if (subItemType === 0x52) {
                        implementationClassUid = buffer.toString('ascii', offset + 4, offset + itemLength).trim();
                    }
                    else if (subItemType === 0x55) {
                        implementationVersionName = buffer.toString('ascii', offset + 4, offset + itemLength).trim();
                    }
                    break;
                }
                default:
                    break;
            }
            offset += itemLength;
        }
        return {
            type: dicom_pdu_types_1.PduType.A_ASSOCIATE_AC,
            callingAeTitle,
            calledAeTitle,
            applicationContext,
            presentationContexts,
            maxLength,
            implementationClassUid,
            implementationVersionName,
        };
    }
    decodeAssociateRj(buffer) {
        return {
            type: dicom_pdu_types_1.PduType.A_ASSOCIATE_RJ,
            result: buffer.readUInt8(8),
            source: buffer.readUInt8(9),
            reason: buffer.readUInt8(10),
        };
    }
    decodePDataTf(buffer, length) {
        const pdvItems = [];
        let offset = 6;
        const endOffset = offset + length;
        while (offset < endOffset) {
            const pdvLength = buffer.readUInt32BE(offset);
            offset += 4;
            const contextId = buffer.readUInt8(offset);
            const flags = buffer.readUInt8(offset + pdvLength - 1);
            const command = (flags & 0x01) === 0x01;
            const last = (flags & 0x02) === 0x02;
            const data = Buffer.from(buffer.subarray(offset + 1, offset + pdvLength - 1));
            pdvItems.push({
                presentationContextId: contextId,
                command,
                last,
                data,
            });
            offset += pdvLength;
        }
        return {
            type: dicom_pdu_types_1.PduType.P_DATA_TF,
            pdvItems,
        };
    }
    decodeAbort(buffer) {
        return {
            type: dicom_pdu_types_1.PduType.A_ABORT,
            source: buffer.readUInt8(8),
            reason: buffer.readUInt8(10),
        };
    }
    encode(pdu) {
        switch (pdu.type) {
            case dicom_pdu_types_1.PduType.A_ASSOCIATE_AC:
                return this.encodeAssociateAc(pdu);
            case dicom_pdu_types_1.PduType.A_ASSOCIATE_RJ:
                return this.encodeAssociateRj(pdu);
            case dicom_pdu_types_1.PduType.P_DATA_TF:
                return this.encodePDataTf(pdu);
            case dicom_pdu_types_1.PduType.A_RELEASE_RP:
                return this.encodeReleaseRp();
            case dicom_pdu_types_1.PduType.A_ABORT:
                return this.encodeAbort(pdu);
            default:
                throw new custom_exceptions_1.DicomParseException(`Cannot encode PDU type: ${pdu.type}`);
        }
    }
    encodeAssociateAc(pdu) {
        const variableItems = [];
        const appContextUid = pdu.applicationContext || '1.2.840.10008.3.1.1.1';
        const appContextBuf = Buffer.alloc(4 + appContextUid.length);
        appContextBuf.writeUInt8(0x10, 0);
        appContextBuf.writeUInt16BE(appContextUid.length, 2);
        appContextBuf.write(appContextUid, 4, 'ascii');
        variableItems.push(appContextBuf);
        for (const ctx of pdu.presentationContexts) {
            const ts = ctx.acceptedTransferSyntax || '';
            const tsItemBuf = Buffer.alloc(4 + ts.length);
            tsItemBuf.writeUInt8(0x40, 0);
            tsItemBuf.writeUInt16BE(ts.length, 2);
            tsItemBuf.write(ts, 4, 'ascii');
            const ctxBuf = Buffer.alloc(8 + tsItemBuf.length);
            ctxBuf.writeUInt8(0x21, 0);
            ctxBuf.writeUInt16BE(ctxBuf.length - 4, 2);
            ctxBuf.writeUInt8(ctx.id, 4);
            ctxBuf.writeUInt8(ctx.result ?? 0, 7);
            tsItemBuf.copy(ctxBuf, 8);
            variableItems.push(ctxBuf);
        }
        const maxPduLengthBuf = Buffer.alloc(8);
        maxPduLengthBuf.writeUInt8(0x50, 0);
        maxPduLengthBuf.writeUInt16BE(4, 2);
        maxPduLengthBuf.writeUInt8(0x51, 4);
        maxPduLengthBuf.writeUInt32BE(pdu.maxLength || 16384, 8);
        variableItems.push(maxPduLengthBuf);
        const implClassUid = pdu.implementationClassUid || '1.2.276.0.7230010.3.0.3.6.2';
        const implClassBuf = Buffer.alloc(4 + implClassUid.length);
        implClassBuf.writeUInt8(0x52, 0);
        implClassBuf.writeUInt16BE(implClassUid.length, 2);
        implClassBuf.write(implClassUid, 4, 'ascii');
        const userInfoBuf1 = Buffer.alloc(4 + implClassBuf.length);
        userInfoBuf1.writeUInt8(0x50, 0);
        userInfoBuf1.writeUInt16BE(implClassBuf.length, 2);
        implClassBuf.copy(userInfoBuf1, 4);
        variableItems.push(userInfoBuf1);
        const implVersionName = pdu.implementationVersionName || 'ANON_GW_1_0';
        const implVerBuf = Buffer.alloc(4 + implVersionName.length);
        implVerBuf.writeUInt8(0x55, 0);
        implVerBuf.writeUInt16BE(implVersionName.length, 2);
        implVerBuf.write(implVersionName, 4, 'ascii');
        const userInfoBuf2 = Buffer.alloc(4 + implVerBuf.length);
        userInfoBuf2.writeUInt8(0x50, 0);
        userInfoBuf2.writeUInt16BE(implVerBuf.length, 2);
        implVerBuf.copy(userInfoBuf2, 4);
        variableItems.push(userInfoBuf2);
        const variableTotal = variableItems.reduce((sum, b) => sum + b.length, 0);
        const totalLength = 68 + variableTotal;
        const result = Buffer.alloc(6 + totalLength);
        result.writeUInt8(dicom_pdu_types_1.PduType.A_ASSOCIATE_AC, 0);
        result.writeUInt32BE(totalLength, 2);
        result.writeUInt16BE(1, 6);
        result.write(pdu.calledAeTitle.padEnd(16, ' '), 10, 'ascii');
        result.write(pdu.callingAeTitle.padEnd(16, ' '), 26, 'ascii');
        let offset = 74;
        for (const item of variableItems) {
            item.copy(result, offset);
            offset += item.length;
        }
        return result;
    }
    encodeAssociateRj(pdu) {
        const buf = Buffer.alloc(14);
        buf.writeUInt8(dicom_pdu_types_1.PduType.A_ASSOCIATE_RJ, 0);
        buf.writeUInt32BE(4, 2);
        buf.writeUInt8(pdu.result, 8);
        buf.writeUInt8(pdu.source, 9);
        buf.writeUInt8(pdu.reason, 10);
        return buf;
    }
    encodePDataTf(pdu) {
        const pdvBuffers = [];
        for (const pdv of pdu.pdvItems) {
            const pdvBuf = Buffer.alloc(4 + pdv.data.length + 2);
            pdvBuf.writeUInt32BE(pdv.data.length + 2, 0);
            pdvBuf.writeUInt8(pdv.presentationContextId, 4);
            pdv.data.copy(pdvBuf, 5);
            let flags = 0;
            if (pdv.command)
                flags |= 0x01;
            if (pdv.last)
                flags |= 0x02;
            pdvBuf.writeUInt8(flags, 5 + pdv.data.length);
            pdvBuffers.push(pdvBuf);
        }
        const totalPdvLength = pdvBuffers.reduce((sum, b) => sum + b.length, 0);
        const result = Buffer.alloc(6 + totalPdvLength);
        result.writeUInt8(dicom_pdu_types_1.PduType.P_DATA_TF, 0);
        result.writeUInt32BE(totalPdvLength, 2);
        let offset = 6;
        for (const pdvBuf of pdvBuffers) {
            pdvBuf.copy(result, offset);
            offset += pdvBuf.length;
        }
        return result;
    }
    encodeReleaseRp() {
        const buf = Buffer.alloc(10);
        buf.writeUInt8(dicom_pdu_types_1.PduType.A_RELEASE_RP, 0);
        buf.writeUInt32BE(4, 2);
        return buf;
    }
    encodeAbort(pdu) {
        const buf = Buffer.alloc(12);
        buf.writeUInt8(dicom_pdu_types_1.PduType.A_ABORT, 0);
        buf.writeUInt32BE(4, 2);
        buf.writeUInt8(pdu.source, 8);
        buf.writeUInt8(pdu.reason, 10);
        return buf;
    }
    encodePDataChunks(presentationContextId, commandData, dataSetData, maxPduLength) {
        const results = [];
        const pdvItems = [];
        if (commandData.length <= maxPduLength - 6) {
            pdvItems.push({
                presentationContextId,
                command: true,
                last: dataSetData === null,
                data: commandData,
            });
        }
        else {
            let offset = 0;
            while (offset < commandData.length) {
                const chunkSize = Math.min(maxPduLength - 6, commandData.length - offset);
                const isLast = offset + chunkSize >= commandData.length && dataSetData === null;
                pdvItems.push({
                    presentationContextId,
                    command: true,
                    last: isLast,
                    data: Buffer.from(commandData.subarray(offset, offset + chunkSize)),
                });
                offset += chunkSize;
            }
        }
        if (dataSetData !== null) {
            let offset = 0;
            while (offset < dataSetData.length) {
                const chunkSize = Math.min(maxPduLength - 6, dataSetData.length - offset);
                const isLast = offset + chunkSize >= dataSetData.length;
                pdvItems.push({
                    presentationContextId,
                    command: false,
                    last: isLast,
                    data: Buffer.from(dataSetData.subarray(offset, offset + chunkSize)),
                });
                offset += chunkSize;
            }
        }
        for (const pdv of pdvItems) {
            results.push(this.encode({
                type: dicom_pdu_types_1.PduType.P_DATA_TF,
                pdvItems: [pdv],
            }));
        }
        return results;
    }
};
exports.DicomPduCodec = DicomPduCodec;
exports.DicomPduCodec = DicomPduCodec = DicomPduCodec_1 = __decorate([
    (0, common_1.Injectable)()
], DicomPduCodec);
//# sourceMappingURL=dicom-pdu-codec.service.js.map