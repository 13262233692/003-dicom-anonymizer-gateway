"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DimseCodec_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DimseCodec = void 0;
const common_1 = require("@nestjs/common");
const dicom_pdu_types_1 = require("./dicom-pdu.types");
const dicom_types_1 = require("../common/types/dicom.types");
const custom_exceptions_1 = require("../common/exceptions/custom.exceptions");
let DimseCodec = DimseCodec_1 = class DimseCodec {
    constructor() {
        this.logger = new common_1.Logger(DimseCodec_1.name);
    }
    decodeCommand(buffer) {
        if (buffer.length < 8) {
            throw new custom_exceptions_1.DicomParseException('Command buffer too small');
        }
        let offset = 0;
        const littleEndian = true;
        const command = {
            status: dicom_pdu_types_1.DimseStatus.SUCCESS,
            dataSetType: 0x0101,
        };
        while (offset + 8 <= buffer.length) {
            const group = buffer.readUInt16LE(offset);
            const element = buffer.readUInt16LE(offset + 2);
            offset += 4;
            if (group === 0xFFFE && (element === 0xE000 || element === 0xE00D || element === 0xE0DD)) {
                const length = buffer.readUInt32LE(offset);
                offset += 4;
                if (length === 0xFFFFFFFF)
                    break;
                offset += length;
                continue;
            }
            const vrStr = buffer.toString('ascii', offset, offset + 2);
            offset += 2;
            let length;
            const longVRs = ['OB', 'OW', 'OF', 'SQ', 'UC', 'UR', 'UT', 'UN', 'OD', 'OL', 'OV'];
            if (longVRs.includes(vrStr)) {
                offset += 2;
                length = buffer.readUInt32LE(offset);
                offset += 4;
            }
            else {
                length = buffer.readUInt16LE(offset);
                offset += 2;
            }
            if (length === 0xFFFFFFFF) {
                break;
            }
            const data = buffer.subarray(offset, offset + length);
            const value = this.decodeValue(vrStr, data, littleEndian);
            if (group === 0x0000) {
                switch (element) {
                    case 0x0000:
                        break;
                    case 0x0100:
                        command.commandField = value;
                        break;
                    case 0x0110:
                        command.messageId = value;
                        break;
                    case 0x0120:
                        if (typeof value === 'number') {
                            command.messageIdBeingRespondedTo = value;
                        }
                        break;
                    case 0x0200:
                        if (typeof value === 'number') {
                            command.status = value;
                        }
                        break;
                    case 0x0800:
                        if (typeof value === 'number') {
                            command.dataSetType = value;
                        }
                        break;
                    case 0x0900:
                        if (typeof value === 'number') {
                            command.status = value;
                        }
                        break;
                    case 0x1000:
                        if (typeof value === 'string') {
                            command.affectedSopInstanceUid = value.trim();
                        }
                        break;
                    case 0x1001:
                        if (typeof value === 'string') {
                            command.sopInstanceUid = value.trim();
                        }
                        break;
                    default:
                        break;
                }
            }
            else if (group === 0x0002) {
                switch (element) {
                    case 0x0002:
                        if (typeof value === 'string') {
                            command.sopClassUid = value.trim();
                        }
                        break;
                    case 0x0003:
                        if (typeof value === 'string') {
                            command.sopInstanceUid = value.trim();
                            command.affectedSopInstanceUid = value.trim();
                        }
                        break;
                    case 0x0010:
                        if (typeof value === 'number') {
                            command.priority = value;
                        }
                        break;
                    case 0x0030:
                        if (typeof value === 'number') {
                            command.moveOriginatorMessageId = value;
                        }
                        break;
                    case 0x0031:
                        if (typeof value === 'string') {
                            command.moveOriginatorApplicationEntityTitle = value.trim();
                        }
                        break;
                    default:
                        break;
                }
            }
            else {
                if (element === 0x0010 && typeof value === 'string') {
                    command.sopClassUid = value.trim();
                }
            }
            offset += length;
            if (length % 2 !== 0)
                offset += 1;
        }
        if (command.commandField === undefined) {
            throw new custom_exceptions_1.DicomParseException('Missing Command Field in DIMSE command');
        }
        return command;
    }
    decodeValue(vr, data, littleEndian) {
        if (data.length === 0)
            return '';
        switch (vr) {
            case 'US':
            case 'SS': {
                if (data.length < 2)
                    return 0;
                return littleEndian
                    ? (vr === 'US' ? data.readUInt16LE(0) : data.readInt16LE(0))
                    : (vr === 'US' ? data.readUInt16BE(0) : data.readInt16BE(0));
            }
            case 'UL':
            case 'SL': {
                if (data.length < 4)
                    return 0;
                return littleEndian
                    ? (vr === 'UL' ? data.readUInt32LE(0) : data.readInt32LE(0))
                    : (vr === 'UL' ? data.readUInt32BE(0) : data.readInt32BE(0));
            }
            case 'AE':
            case 'AS':
            case 'CS':
            case 'DA':
            case 'DS':
            case 'DT':
            case 'IS':
            case 'LO':
            case 'LT':
            case 'PN':
            case 'SH':
            case 'ST':
            case 'TM':
            case 'UI':
            case 'UR':
            case 'UT':
            case 'LO ':
                return data.toString('ascii').replace(/\0/g, '').trim();
            default:
                return data;
        }
    }
    encodeCStoreResponse(messageId, status, sopClassUid, sopInstanceUid) {
        const chunks = [];
        chunks.push(this.encodeTag(0x0000, 0x0000, dicom_types_1.DicomTagVR.UL, 0));
        chunks.push(this.encodeTag(0x0000, 0x0002, dicom_types_1.DicomTagVR.UI, '1.2.840.10008.1.2'));
        chunks.push(this.encodeTag(0x0000, 0x0100, dicom_types_1.DicomTagVR.US, dicom_pdu_types_1.CommandField.C_STORE_RSP));
        chunks.push(this.encodeTag(0x0000, 0x0120, dicom_types_1.DicomTagVR.US, messageId));
        chunks.push(this.encodeTag(0x0000, 0x0800, dicom_types_1.DicomTagVR.US, 0x0101));
        chunks.push(this.encodeTag(0x0000, 0x0900, dicom_types_1.DicomTagVR.US, status));
        chunks.push(this.encodeTag(0x0000, 0x0002, dicom_types_1.DicomTagVR.UI, sopClassUid));
        chunks.push(this.encodeTag(0x0000, 0x1000, dicom_types_1.DicomTagVR.UI, sopInstanceUid));
        const combined = Buffer.concat(chunks);
        const totalLength = combined.length - 8;
        combined.writeUInt32LE(totalLength, 4);
        return combined;
    }
    encodeCEchoResponse(messageId, status) {
        const chunks = [];
        chunks.push(this.encodeTag(0x0000, 0x0000, dicom_types_1.DicomTagVR.UL, 0));
        chunks.push(this.encodeTag(0x0000, 0x0002, dicom_types_1.DicomTagVR.UI, '1.2.840.10008.1.2'));
        chunks.push(this.encodeTag(0x0000, 0x0100, dicom_types_1.DicomTagVR.US, dicom_pdu_types_1.CommandField.C_ECHO_RSP));
        chunks.push(this.encodeTag(0x0000, 0x0120, dicom_types_1.DicomTagVR.US, messageId));
        chunks.push(this.encodeTag(0x0000, 0x0800, dicom_types_1.DicomTagVR.US, 0x0101));
        chunks.push(this.encodeTag(0x0000, 0x0900, dicom_types_1.DicomTagVR.US, status));
        chunks.push(this.encodeTag(0x0000, 0x0002, dicom_types_1.DicomTagVR.UI, '1.2.840.10008.1.1'));
        const combined = Buffer.concat(chunks);
        const totalLength = combined.length - 8;
        combined.writeUInt32LE(totalLength, 4);
        return combined;
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
            case dicom_types_1.DicomTagVR.SS: {
                const buf = Buffer.alloc(2);
                buf.writeInt16LE(Number(value) || 0, 0);
                return buf;
            }
            case dicom_types_1.DicomTagVR.UL: {
                const buf = Buffer.alloc(4);
                buf.writeUInt32LE(Number(value) || 0, 0);
                return buf;
            }
            case dicom_types_1.DicomTagVR.SL: {
                const buf = Buffer.alloc(4);
                buf.writeInt32LE(Number(value) || 0, 0);
                return buf;
            }
            case dicom_types_1.DicomTagVR.UI:
            case dicom_types_1.DicomTagVR.AE:
            case dicom_types_1.DicomTagVR.AS:
            case dicom_types_1.DicomTagVR.CS:
            case dicom_types_1.DicomTagVR.DA:
            case dicom_types_1.DicomTagVR.DS:
            case dicom_types_1.DicomTagVR.DT:
            case dicom_types_1.DicomTagVR.IS:
            case dicom_types_1.DicomTagVR.LO:
            case dicom_types_1.DicomTagVR.PN:
            case dicom_types_1.DicomTagVR.SH:
            case dicom_types_1.DicomTagVR.ST:
            case dicom_types_1.DicomTagVR.TM:
            case dicom_types_1.DicomTagVR.UR: {
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
exports.DimseCodec = DimseCodec;
exports.DimseCodec = DimseCodec = DimseCodec_1 = __decorate([
    (0, common_1.Injectable)()
], DimseCodec);
//# sourceMappingURL=dimse-codec.service.js.map