"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DicomBinaryParser_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DicomBinaryParser = void 0;
const common_1 = require("@nestjs/common");
const dicom_types_1 = require("../common/types/dicom.types");
const custom_exceptions_1 = require("../common/exceptions/custom.exceptions");
const dicom_tag_dictionary_1 = require("./dicom-tag-dictionary");
let DicomBinaryParser = DicomBinaryParser_1 = class DicomBinaryParser {
    constructor() {
        this.logger = new common_1.Logger(DicomBinaryParser_1.name);
        this.DICOM_MAGIC = 'DICM';
        this.PREAMBLE_LENGTH = 128;
    }
    parse(buffer) {
        if (!buffer || buffer.length < this.PREAMBLE_LENGTH + 4) {
            throw new custom_exceptions_1.DicomParseException('Buffer too small to contain valid DICOM data');
        }
        this.validateDicomPreamble(buffer);
        const state = {
            offset: this.PREAMBLE_LENGTH + 4,
            buffer,
            littleEndian: true,
            explicitVR: true,
        };
        const tags = new Map();
        let transferSyntaxUid = '1.2.840.10008.1.2.1';
        let sopClassUid = '';
        let sopInstanceUid = '';
        let pixelData;
        try {
            while (state.offset < buffer.length) {
                const tag = this.parseNextTag(state);
                if (!tag)
                    break;
                const tagKey = (0, dicom_types_1.formatTagKey)(tag.group, tag.element);
                tags.set(tagKey, tag);
                if (tag.group === 0x0002 && tag.element === 0x0010) {
                    transferSyntaxUid = this.extractTransferSyntax(tag.value);
                    this.updateTransferSyntax(state, transferSyntaxUid);
                }
                if (tag.group === 0x0008 && tag.element === 0x0016) {
                    sopClassUid = this.cleanStringValue(tag.value);
                }
                if (tag.group === 0x0008 && tag.element === 0x0018) {
                    sopInstanceUid = this.cleanStringValue(tag.value);
                }
                if (tag.group === 0x7fe0 && tag.element === 0x0010) {
                    pixelData = tag.value;
                }
            }
        }
        catch (error) {
            this.logger.warn(`Partial parse completed at offset ${state.offset}/${buffer.length}: ${error.message}`);
        }
        if (!sopClassUid || !sopInstanceUid) {
            throw new custom_exceptions_1.DicomParseException('Missing required DICOM identifiers (SOPClassUID or SOPInstanceUID)');
        }
        this.logger.debug(`Parsed DICOM object: ${tags.size} tags, SOP=${sopInstanceUid}`);
        return {
            tags,
            pixelData,
            transferSyntaxUid,
            sopClassUid,
            sopInstanceUid,
            rawBuffer: buffer,
        };
    }
    validateDicomPreamble(buffer) {
        const magicOffset = this.PREAMBLE_LENGTH;
        const magic = buffer.toString('ascii', magicOffset, magicOffset + 4);
        if (magic !== this.DICOM_MAGIC) {
            this.logger.warn('DICOM preamble magic not found, attempting raw parse');
        }
    }
    parseNextTag(state) {
        if (state.offset + 8 > state.buffer.length) {
            return null;
        }
        let group;
        let element;
        if (state.littleEndian) {
            group = state.buffer.readUInt16LE(state.offset);
            element = state.buffer.readUInt16LE(state.offset + 2);
        }
        else {
            group = state.buffer.readUInt16BE(state.offset);
            element = state.buffer.readUInt16BE(state.offset + 2);
        }
        state.offset += 4;
        if (group === 0xFFFE && (element === 0xE000 || element === 0xE00D || element === 0xE0DD)) {
            const length = state.littleEndian
                ? state.buffer.readUInt32LE(state.offset)
                : state.buffer.readUInt32BE(state.offset);
            state.offset += 4;
            if (length === 0xFFFFFFFF) {
                return null;
            }
            state.offset += length;
            return null;
        }
        let vr;
        let length;
        if (state.explicitVR) {
            const vrStr = state.buffer.toString('ascii', state.offset, state.offset + 2);
            vr = this.validateVR(vrStr);
            state.offset += 2;
            if (this.isLongVr(vr)) {
                state.offset += 2;
                length = state.littleEndian
                    ? state.buffer.readUInt32LE(state.offset)
                    : state.buffer.readUInt32BE(state.offset);
                state.offset += 4;
            }
            else {
                length = state.littleEndian
                    ? state.buffer.readUInt16LE(state.offset)
                    : state.buffer.readUInt16BE(state.offset);
                state.offset += 2;
            }
        }
        else {
            const dictEntry = (0, dicom_tag_dictionary_1.lookupTagDictionary)(group, element);
            vr = dictEntry ? dictEntry.vr : dicom_types_1.DicomTagVR.UN;
            length = state.littleEndian
                ? state.buffer.readUInt32LE(state.offset)
                : state.buffer.readUInt32BE(state.offset);
            state.offset += 4;
        }
        const isUndefinedLength = length === 0xFFFFFFFF;
        let valueData;
        if (isUndefinedLength) {
            const endOffset = this.findSequenceDelimiter(state, group, element);
            valueData = state.buffer.subarray(state.offset, endOffset);
            state.offset = endOffset + 8;
        }
        else {
            if (state.offset + length > state.buffer.length) {
                length = state.buffer.length - state.offset;
            }
            valueData = state.buffer.subarray(state.offset, state.offset + length);
            state.offset += length;
            if (length % 2 !== 0 && state.offset < state.buffer.length) {
                state.offset += 1;
            }
        }
        const dictEntry = (0, dicom_tag_dictionary_1.lookupTagDictionary)(group, element);
        const value = this.decodeValue(vr, valueData, state.littleEndian);
        return {
            group,
            element,
            vr,
            value,
            length,
            keyword: dictEntry?.keyword,
        };
    }
    findSequenceDelimiter(state, _group, _element) {
        let searchOffset = state.offset;
        const delimiterGroup = 0xFFFE;
        const delimiterElement = 0xE0DD;
        while (searchOffset + 8 <= state.buffer.length) {
            const g = state.littleEndian
                ? state.buffer.readUInt16LE(searchOffset)
                : state.buffer.readUInt16BE(searchOffset);
            const e = state.littleEndian
                ? state.buffer.readUInt16LE(searchOffset + 2)
                : state.buffer.readUInt16BE(searchOffset + 2);
            if (g === delimiterGroup && e === delimiterElement) {
                return searchOffset;
            }
            searchOffset += 2;
        }
        return state.buffer.length;
    }
    decodeValue(vr, data, littleEndian) {
        if (data.length === 0) {
            return vr === dicom_types_1.DicomTagVR.OB || vr === dicom_types_1.DicomTagVR.OW || vr === dicom_types_1.DicomTagVR.SQ ? Buffer.alloc(0) : '';
        }
        switch (vr) {
            case dicom_types_1.DicomTagVR.AE:
            case dicom_types_1.DicomTagVR.AS:
            case dicom_types_1.DicomTagVR.CS:
            case dicom_types_1.DicomTagVR.DA:
            case dicom_types_1.DicomTagVR.DS:
            case dicom_types_1.DicomTagVR.DT:
            case dicom_types_1.DicomTagVR.IS:
            case dicom_types_1.DicomTagVR.LO:
            case dicom_types_1.DicomTagVR.LT:
            case dicom_types_1.DicomTagVR.PN:
            case dicom_types_1.DicomTagVR.SH:
            case dicom_types_1.DicomTagVR.ST:
            case dicom_types_1.DicomTagVR.TM:
            case dicom_types_1.DicomTagVR.UC:
            case dicom_types_1.DicomTagVR.UI:
            case dicom_types_1.DicomTagVR.UR:
            case dicom_types_1.DicomTagVR.UT:
                return data.toString('utf8');
            case dicom_types_1.DicomTagVR.OB:
            case dicom_types_1.DicomTagVR.OF:
            case dicom_types_1.DicomTagVR.OW:
            case dicom_types_1.DicomTagVR.OD:
            case dicom_types_1.DicomTagVR.OL:
            case dicom_types_1.DicomTagVR.OV:
            case dicom_types_1.DicomTagVR.UN:
            case dicom_types_1.DicomTagVR.SQ:
                return Buffer.from(data);
            case dicom_types_1.DicomTagVR.AT: {
                const result = [];
                for (let i = 0; i + 4 <= data.length; i += 4) {
                    const g = littleEndian ? data.readUInt16LE(i) : data.readUInt16BE(i);
                    const e = littleEndian ? data.readUInt16LE(i + 2) : data.readUInt16BE(i + 2);
                    result.push(g, e);
                }
                return result;
            }
            case dicom_types_1.DicomTagVR.SL:
            case dicom_types_1.DicomTagVR.UL: {
                const result = [];
                for (let i = 0; i + 4 <= data.length; i += 4) {
                    result.push(littleEndian ? data.readUInt32LE(i) : data.readUInt32BE(i));
                }
                return result.length === 1 ? result[0] : result;
            }
            case dicom_types_1.DicomTagVR.SV:
            case dicom_types_1.DicomTagVR.UV: {
                const result = [];
                for (let i = 0; i + 8 <= data.length; i += 8) {
                    result.push(littleEndian ? data.readBigUInt64LE(i) : data.readBigUInt64BE(i));
                }
                return result.length === 1 ? result[0] : result;
            }
            case dicom_types_1.DicomTagVR.SS:
            case dicom_types_1.DicomTagVR.US: {
                const result = [];
                for (let i = 0; i + 2 <= data.length; i += 2) {
                    if (vr === dicom_types_1.DicomTagVR.SS) {
                        result.push(littleEndian ? data.readInt16LE(i) : data.readInt16BE(i));
                    }
                    else {
                        result.push(littleEndian ? data.readUInt16LE(i) : data.readUInt16BE(i));
                    }
                }
                return result.length === 1 ? result[0] : result;
            }
            case dicom_types_1.DicomTagVR.FL: {
                const result = [];
                for (let i = 0; i + 4 <= data.length; i += 4) {
                    result.push(littleEndian ? data.readFloatLE(i) : data.readFloatBE(i));
                }
                return result.length === 1 ? result[0] : result;
            }
            case dicom_types_1.DicomTagVR.FD: {
                const result = [];
                for (let i = 0; i + 8 <= data.length; i += 8) {
                    result.push(littleEndian ? data.readDoubleLE(i) : data.readDoubleBE(i));
                }
                return result.length === 1 ? result[0] : result;
            }
            default:
                return data;
        }
    }
    validateVR(vrStr) {
        if (Object.values(dicom_types_1.DicomTagVR).includes(vrStr)) {
            return vrStr;
        }
        return dicom_types_1.DicomTagVR.UN;
    }
    isLongVr(vr) {
        const longVRs = [
            dicom_types_1.DicomTagVR.OB, dicom_types_1.DicomTagVR.OD, dicom_types_1.DicomTagVR.OF, dicom_types_1.DicomTagVR.OL,
            dicom_types_1.DicomTagVR.OV, dicom_types_1.DicomTagVR.OW, dicom_types_1.DicomTagVR.SQ, dicom_types_1.DicomTagVR.UC,
            dicom_types_1.DicomTagVR.UR, dicom_types_1.DicomTagVR.UT, dicom_types_1.DicomTagVR.UN,
        ];
        return longVRs.includes(vr);
    }
    extractTransferSyntax(value) {
        if (typeof value === 'string') {
            return value.trim().replace(/\0/g, '');
        }
        if (Buffer.isBuffer(value)) {
            return value.toString('ascii').trim().replace(/\0/g, '');
        }
        return '1.2.840.10008.1.2.1';
    }
    cleanStringValue(value) {
        if (typeof value === 'string') {
            return value.trim().replace(/\0/g, '');
        }
        if (Buffer.isBuffer(value)) {
            return value.toString('utf8').trim().replace(/\0/g, '');
        }
        return String(value || '');
    }
    updateTransferSyntax(state, transferSyntaxUid) {
        if (transferSyntaxUid === '1.2.840.10008.1.2' ||
            transferSyntaxUid === '1.2.840.10008.1.2.1' ||
            transferSyntaxUid.startsWith('1.2.840.10008.1.2.5') ||
            transferSyntaxUid === '1.2.840.10008.1.2.4.50' ||
            transferSyntaxUid === '1.2.840.10008.1.2.4.51' ||
            transferSyntaxUid === '1.2.840.10008.1.2.4.57' ||
            transferSyntaxUid === '1.2.840.10008.1.2.4.70' ||
            transferSyntaxUid === '1.2.840.10008.1.2.4.80' ||
            transferSyntaxUid === '1.2.840.10008.1.2.4.81' ||
            transferSyntaxUid === '1.2.840.10008.1.2.4.90' ||
            transferSyntaxUid === '1.2.840.10008.1.2.4.91' ||
            transferSyntaxUid === '1.2.840.10008.1.2.4.92' ||
            transferSyntaxUid === '1.2.840.10008.1.2.4.93' ||
            transferSyntaxUid === '1.2.840.10008.1.2.4.94' ||
            transferSyntaxUid === '1.2.840.10008.1.2.4.95') {
            state.littleEndian = true;
            state.explicitVR = true;
        }
        else if (transferSyntaxUid === '1.2.840.10008.1.2.2') {
            state.littleEndian = false;
            state.explicitVR = true;
        }
        else if (transferSyntaxUid === '1.2.840.10008.1.2.99') {
            state.littleEndian = true;
            state.explicitVR = false;
        }
    }
};
exports.DicomBinaryParser = DicomBinaryParser;
exports.DicomBinaryParser = DicomBinaryParser = DicomBinaryParser_1 = __decorate([
    (0, common_1.Injectable)()
], DicomBinaryParser);
//# sourceMappingURL=dicom-binary-parser.service.js.map