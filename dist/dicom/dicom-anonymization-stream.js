"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DicomAnonymizationStream = void 0;
const stream_1 = require("stream");
const crypto_1 = require("crypto");
const dicom_types_1 = require("../common/types/dicom.types");
const anonymization_types_1 = require("../common/types/anonymization.types");
const dicom_tag_dictionary_1 = require("./dicom-tag-dictionary");
var AnonymizationStreamState;
(function (AnonymizationStreamState) {
    AnonymizationStreamState["WAITING_PREAMBLE"] = "waiting_preamble";
    AnonymizationStreamState["PARSING_TAG_HEADER"] = "parsing_tag_header";
    AnonymizationStreamState["READING_TAG_VALUE"] = "reading_tag_value";
    AnonymizationStreamState["STREAMING_PIXEL_DATA"] = "streaming_pixel_data";
    AnonymizationStreamState["COMPLETE"] = "complete";
})(AnonymizationStreamState || (AnonymizationStreamState = {}));
class DicomAnonymizationStream extends stream_1.Transform {
    constructor(rules, options) {
        super({
            readableObjectMode: false,
            writableObjectMode: false,
            highWaterMark: 256 * 1024,
        });
        this.state = AnonymizationStreamState.WAITING_PREAMBLE;
        this.internalBuffer = Buffer.alloc(0);
        this.littleEndian = true;
        this.explicitVR = true;
        this.PREAMBLE_LENGTH = 128;
        this.DICOM_MAGIC = 'DICM';
        this.tagRules = new Map();
        this.currentTag = null;
        this.pixelDataBytesProcessed = 0;
        this.pixelDataUndefinedLength = false;
        this.modifiedTags = [];
        this.removedTags = [];
        this.totalTagsProcessed = 0;
        this.originalSopInstanceUid = '';
        this.anonymizedSopInstanceUid = '';
        this.originalPatientId = '';
        this.anonymizedPatientId = '';
        this.originalPatientName = '';
        this.studyInstanceUid = '';
        this.seriesInstanceUid = '';
        this.sopClassUid = '';
        this.modality = '';
        this.resultEmitted = false;
        for (const rule of rules) {
            this.tagRules.set(rule.tagKey, rule);
        }
        this.traceId = options.traceId;
        this.hospitalId = options.hospitalId;
        const dateHash = (0, crypto_1.createHash)('md5')
            .update(this.traceId + this.hospitalId + 'date_shift_salt')
            .digest('hex');
        this.dateShiftDays = -365 - (parseInt(dateHash.slice(0, 8), 16) % 365);
        this.patientHashSalt = 'dicom-anon-' + this.hospitalId;
        this.uidSalt = this.traceId + this.hospitalId;
    }
    _transform(chunk, _encoding, callback) {
        try {
            this.internalBuffer = Buffer.concat([this.internalBuffer, chunk]);
            this.processBuffer();
            callback();
        }
        catch (error) {
            callback(error);
        }
    }
    _flush(callback) {
        try {
            if (!this.resultEmitted) {
                this.emitResult();
            }
            this.state = AnonymizationStreamState.COMPLETE;
            callback();
        }
        catch (error) {
            callback(error);
        }
    }
    processBuffer() {
        let continueProcessing = true;
        while (continueProcessing) {
            switch (this.state) {
                case AnonymizationStreamState.WAITING_PREAMBLE:
                    continueProcessing = this.tryProcessPreamble();
                    break;
                case AnonymizationStreamState.PARSING_TAG_HEADER:
                    continueProcessing = this.tryParseTagHeader();
                    break;
                case AnonymizationStreamState.READING_TAG_VALUE:
                    continueProcessing = this.tryReadAndProcessTagValue();
                    break;
                case AnonymizationStreamState.STREAMING_PIXEL_DATA:
                    continueProcessing = this.tryStreamPixelData();
                    break;
                case AnonymizationStreamState.COMPLETE:
                    continueProcessing = false;
                    break;
                default:
                    continueProcessing = false;
            }
        }
    }
    tryProcessPreamble() {
        if (this.internalBuffer.length < this.PREAMBLE_LENGTH + 4) {
            return false;
        }
        this.push(this.internalBuffer.subarray(0, this.PREAMBLE_LENGTH + 4));
        this.internalBuffer = Buffer.from(this.internalBuffer.subarray(this.PREAMBLE_LENGTH + 4));
        this.state = AnonymizationStreamState.PARSING_TAG_HEADER;
        return this.internalBuffer.length > 0;
    }
    tryParseTagHeader() {
        if (this.internalBuffer.length < 8) {
            return false;
        }
        let group;
        let element;
        if (this.littleEndian) {
            group = this.internalBuffer.readUInt16LE(0);
            element = this.internalBuffer.readUInt16LE(2);
        }
        else {
            group = this.internalBuffer.readUInt16BE(0);
            element = this.internalBuffer.readUInt16BE(2);
        }
        if (group === 0xFFFE) {
            return this.handleDelimiter(group, element);
        }
        let vr;
        let length;
        let headerBytes;
        if (this.explicitVR) {
            const vrStr = this.internalBuffer.toString('ascii', 4, 6);
            vr = this.validateVR(vrStr);
            if (this.isLongVr(vr)) {
                if (this.internalBuffer.length < 12) {
                    return false;
                }
                length = this.littleEndian
                    ? this.internalBuffer.readUInt32LE(8)
                    : this.internalBuffer.readUInt32BE(8);
                headerBytes = 12;
            }
            else {
                length = this.littleEndian
                    ? this.internalBuffer.readUInt16LE(6)
                    : this.internalBuffer.readUInt16BE(6);
                headerBytes = 8;
            }
        }
        else {
            const dictEntry = (0, dicom_tag_dictionary_1.lookupTagDictionary)(group, element);
            vr = dictEntry ? dictEntry.vr : dicom_types_1.DicomTagVR.UN;
            length = this.littleEndian
                ? this.internalBuffer.readUInt32LE(4)
                : this.internalBuffer.readUInt32BE(4);
            headerBytes = 8;
        }
        const tagKey = (0, dicom_types_1.formatTagKey)(group, element);
        const rule = this.tagRules.get(tagKey);
        const isPixelData = group === 0x7fe0 && element === 0x0010;
        if (group === 0x0002 && element === 0x0010) {
            if (length > 0 && this.internalBuffer.length >= headerBytes + length) {
                const tsValue = this.internalBuffer
                    .subarray(headerBytes, headerBytes + length)
                    .toString('ascii')
                    .trim()
                    .replace(/\0/g, '');
                this.updateTransferSyntax(tsValue);
            }
        }
        if (rule?.action === anonymization_types_1.AnonymizationActionType.REMOVE && !isPixelData) {
            this.currentTag = { group, element, vr, length, bytesRead: 0, skipValue: true };
            this.internalBuffer = Buffer.from(this.internalBuffer.subarray(headerBytes));
            this.removedTags.push(tagKey);
            this.totalTagsProcessed++;
            this.state = AnonymizationStreamState.READING_TAG_VALUE;
            return true;
        }
        if (isPixelData) {
            const headerChunk = Buffer.from(this.internalBuffer.subarray(0, headerBytes));
            this.push(headerChunk);
            this.internalBuffer = Buffer.from(this.internalBuffer.subarray(headerBytes));
            this.currentTag = { group, element, vr, length, bytesRead: 0, skipValue: false };
            this.pixelDataUndefinedLength = length === 0xFFFFFFFF;
            this.state = AnonymizationStreamState.STREAMING_PIXEL_DATA;
            this.totalTagsProcessed++;
            return this.internalBuffer.length > 0;
        }
        this.currentTag = { group, element, vr, length, bytesRead: 0, skipValue: false };
        this.internalBuffer = Buffer.from(this.internalBuffer.subarray(headerBytes));
        this.state = AnonymizationStreamState.READING_TAG_VALUE;
        return true;
    }
    handleDelimiter(group, element) {
        const length = this.littleEndian
            ? this.internalBuffer.readUInt32LE(4)
            : this.internalBuffer.readUInt32BE(4);
        if (group === 0xFFFE && element === 0xE0DD) {
            if (this.state === AnonymizationStreamState.STREAMING_PIXEL_DATA) {
                this.push(this.internalBuffer.subarray(0, 8));
                this.internalBuffer = Buffer.from(this.internalBuffer.subarray(8));
                this.currentTag = null;
                this.state = AnonymizationStreamState.PARSING_TAG_HEADER;
                return this.internalBuffer.length > 0;
            }
        }
        if (length === 0xFFFFFFFF) {
            this.push(this.internalBuffer.subarray(0, 8));
            this.internalBuffer = Buffer.from(this.internalBuffer.subarray(8));
            return this.internalBuffer.length > 0;
        }
        const totalSkip = 8 + length;
        if (this.internalBuffer.length < totalSkip) {
            return false;
        }
        this.push(this.internalBuffer.subarray(0, totalSkip));
        this.internalBuffer = Buffer.from(this.internalBuffer.subarray(totalSkip));
        return this.internalBuffer.length > 0;
    }
    tryReadAndProcessTagValue() {
        if (!this.currentTag) {
            this.state = AnonymizationStreamState.PARSING_TAG_HEADER;
            return true;
        }
        const { group, element, vr, length, skipValue } = this.currentTag;
        if (length === 0xFFFFFFFF) {
            this.state = AnonymizationStreamState.PARSING_TAG_HEADER;
            this.currentTag = null;
            return true;
        }
        if (length === 0) {
            if (!skipValue) {
                this.processAndEmitTag(group, element, vr, Buffer.alloc(0));
            }
            this.currentTag = null;
            this.state = AnonymizationStreamState.PARSING_TAG_HEADER;
            return true;
        }
        if (this.internalBuffer.length < length) {
            return false;
        }
        const valueBuffer = Buffer.from(this.internalBuffer.subarray(0, length));
        this.internalBuffer = Buffer.from(this.internalBuffer.subarray(length));
        const paddedLength = length % 2 !== 0 ? length + 1 : length;
        if (paddedLength > length && this.internalBuffer.length > 0) {
            this.internalBuffer = Buffer.from(this.internalBuffer.subarray(1));
        }
        if (!skipValue) {
            this.processAndEmitTag(group, element, vr, valueBuffer);
        }
        this.currentTag = null;
        this.state = AnonymizationStreamState.PARSING_TAG_HEADER;
        this.totalTagsProcessed++;
        return this.internalBuffer.length > 0;
    }
    processAndEmitTag(group, element, vr, valueBuffer) {
        const tagKey = (0, dicom_types_1.formatTagKey)(group, element);
        const rule = this.tagRules.get(tagKey);
        let processedValueBuffer = valueBuffer;
        let valueChanged = false;
        if (group === 0x0008 && element === 0x0018) {
            this.originalSopInstanceUid = valueBuffer.toString('ascii').trim().replace(/\0/g, '');
            this.anonymizedSopInstanceUid = this.generateDerivedUid(this.originalSopInstanceUid);
            processedValueBuffer = this.encodeStringValue(this.anonymizedSopInstanceUid);
            valueChanged = true;
            this.modifiedTags.push(tagKey);
        }
        if (group === 0x0002 && element === 0x0003) {
            const original = valueBuffer.toString('ascii').trim().replace(/\0/g, '');
            const newUid = this.generateDerivedUid(original);
            processedValueBuffer = this.encodeStringValue(newUid);
            valueChanged = true;
            this.modifiedTags.push(tagKey);
        }
        if (group === 0x0020 && element === 0x000d) {
            this.studyInstanceUid = valueBuffer.toString('ascii').trim().replace(/\0/g, '');
            const newUid = this.generateDerivedUid(this.studyInstanceUid);
            processedValueBuffer = this.encodeStringValue(newUid);
            valueChanged = true;
            this.modifiedTags.push(tagKey);
        }
        if (group === 0x0020 && element === 0x000e) {
            this.seriesInstanceUid = valueBuffer.toString('ascii').trim().replace(/\0/g, '');
            const newUid = this.generateDerivedUid(this.seriesInstanceUid);
            processedValueBuffer = this.encodeStringValue(newUid);
            valueChanged = true;
            this.modifiedTags.push(tagKey);
        }
        if (group === 0x0008 && element === 0x0016) {
            this.sopClassUid = valueBuffer.toString('ascii').trim().replace(/\0/g, '');
        }
        if (group === 0x0008 && element === 0x0060) {
            this.modality = valueBuffer.toString('ascii').trim().replace(/\0/g, '');
        }
        if (group === 0x0010 && element === 0x0020) {
            this.originalPatientId = valueBuffer.toString('ascii').trim().replace(/\0/g, '');
        }
        if (group === 0x0010 && element === 0x0010) {
            this.originalPatientName = valueBuffer.toString('ascii').trim().replace(/\0/g, '');
        }
        if (rule && !valueChanged) {
            switch (rule.action) {
                case anonymization_types_1.AnonymizationActionType.EMPTY:
                    processedValueBuffer = Buffer.alloc(0);
                    valueChanged = true;
                    this.modifiedTags.push(tagKey);
                    break;
                case anonymization_types_1.AnonymizationActionType.REPLACE:
                    if (rule.replacementValue !== undefined) {
                        processedValueBuffer = this.encodeValueForVr(vr, String(rule.replacementValue));
                        valueChanged = true;
                        this.modifiedTags.push(tagKey);
                    }
                    break;
                case anonymization_types_1.AnonymizationActionType.HASH: {
                    const originalStr = valueBuffer.toString('utf8').trim().replace(/\0/g, '');
                    if (originalStr) {
                        const algorithm = rule.hashAlgorithm || 'sha256';
                        const salt = rule.hashSalt || this.patientHashSalt;
                        const hashed = this.hashString(originalStr, salt, algorithm);
                        processedValueBuffer = this.encodeStringValue(hashed);
                        valueChanged = true;
                        this.modifiedTags.push(tagKey);
                        if (group === 0x0010 && element === 0x0020) {
                            this.anonymizedPatientId = hashed;
                        }
                    }
                    break;
                }
                case anonymization_types_1.AnonymizationActionType.MASK: {
                    const originalStr = valueBuffer.toString('utf8').trim().replace(/\0/g, '');
                    if (originalStr) {
                        const masked = this.applyMask(originalStr, rule.maskPattern || '***');
                        processedValueBuffer = this.encodeStringValue(masked);
                        valueChanged = true;
                        this.modifiedTags.push(tagKey);
                    }
                    break;
                }
                case anonymization_types_1.AnonymizationActionType.SHIFT_DATE: {
                    const originalStr = valueBuffer.toString('ascii').trim().replace(/\0/g, '');
                    if (/^\d{8}$/.test(originalStr)) {
                        const shiftDays = rule.dateShiftDays ?? this.dateShiftDays;
                        const shifted = this.shiftDate(originalStr, shiftDays);
                        if (shifted) {
                            processedValueBuffer = this.encodeStringValue(shifted);
                            valueChanged = true;
                            this.modifiedTags.push(tagKey);
                        }
                    }
                    break;
                }
                case anonymization_types_1.AnonymizationActionType.KEEP:
                    break;
                default:
                    break;
            }
        }
        this.emitTag(group, element, vr, processedValueBuffer, valueChanged);
    }
    emitTag(group, element, vr, valueBuffer, _valueChanged) {
        const isLongVR = this.isLongVr(vr);
        let header;
        if (this.explicitVR) {
            if (isLongVR) {
                header = Buffer.alloc(12);
                if (this.littleEndian) {
                    header.writeUInt16LE(group, 0);
                    header.writeUInt16LE(element, 2);
                }
                else {
                    header.writeUInt16BE(group, 0);
                    header.writeUInt16BE(element, 2);
                }
                header.write(vr, 4, 'ascii');
                if (this.littleEndian) {
                    header.writeUInt32LE(valueBuffer.length, 8);
                }
                else {
                    header.writeUInt32BE(valueBuffer.length, 8);
                }
            }
            else {
                header = Buffer.alloc(8);
                if (this.littleEndian) {
                    header.writeUInt16LE(group, 0);
                    header.writeUInt16LE(element, 2);
                }
                else {
                    header.writeUInt16BE(group, 0);
                    header.writeUInt16BE(element, 2);
                }
                header.write(vr, 4, 'ascii');
                if (this.littleEndian) {
                    header.writeUInt16LE(valueBuffer.length, 6);
                }
                else {
                    header.writeUInt16BE(valueBuffer.length, 6);
                }
            }
        }
        else {
            header = Buffer.alloc(8);
            if (this.littleEndian) {
                header.writeUInt16LE(group, 0);
                header.writeUInt16LE(element, 2);
                header.writeUInt32LE(valueBuffer.length, 4);
            }
            else {
                header.writeUInt16BE(group, 0);
                header.writeUInt16BE(element, 2);
                header.writeUInt32BE(valueBuffer.length, 4);
            }
        }
        this.push(header);
        this.push(valueBuffer);
        if (valueBuffer.length % 2 !== 0) {
            this.push(Buffer.from([0]));
        }
    }
    tryStreamPixelData() {
        if (this.internalBuffer.length === 0) {
            return false;
        }
        if (!this.currentTag) {
            this.state = AnonymizationStreamState.PARSING_TAG_HEADER;
            return true;
        }
        let chunkToStream;
        if (this.pixelDataUndefinedLength) {
            chunkToStream = Buffer.from(this.internalBuffer);
            this.internalBuffer = Buffer.alloc(0);
            this.pixelDataBytesProcessed += chunkToStream.length;
            this.push(chunkToStream);
            return false;
        }
        else {
            const remaining = this.currentTag.length - this.pixelDataBytesProcessed;
            const toRead = Math.min(remaining, this.internalBuffer.length);
            chunkToStream = Buffer.from(this.internalBuffer.subarray(0, toRead));
            this.internalBuffer = Buffer.from(this.internalBuffer.subarray(toRead));
            this.pixelDataBytesProcessed += toRead;
            this.push(chunkToStream);
            if (this.pixelDataBytesProcessed >= this.currentTag.length) {
                if (this.currentTag.length % 2 !== 0 && this.internalBuffer.length > 0) {
                    this.internalBuffer = Buffer.from(this.internalBuffer.subarray(1));
                }
                this.currentTag = null;
                this.state = AnonymizationStreamState.PARSING_TAG_HEADER;
                if (!this.resultEmitted) {
                    this.emitResult();
                }
            }
        }
        return this.internalBuffer.length > 0;
    }
    emitResult() {
        this.resultEmitted = true;
        const result = {
            originalSopInstanceUid: this.originalSopInstanceUid,
            anonymizedSopInstanceUid: this.anonymizedSopInstanceUid,
            originalPatientId: this.originalPatientId,
            anonymizedPatientId: this.anonymizedPatientId,
            originalPatientName: this.originalPatientName,
            studyInstanceUid: this.generateDerivedUid(this.studyInstanceUid) || this.studyInstanceUid,
            seriesInstanceUid: this.generateDerivedUid(this.seriesInstanceUid) || this.seriesInstanceUid,
            sopClassUid: this.sopClassUid,
            modality: this.modality,
            modifiedTags: [...this.modifiedTags],
            removedTags: [...this.removedTags],
            pixelDataBytesProcessed: this.pixelDataBytesProcessed,
            totalTagsProcessed: this.totalTagsProcessed,
        };
        this.emit('result', result);
    }
    validateVR(vrStr) {
        if (Object.values(dicom_types_1.DicomTagVR).includes(vrStr)) {
            return vrStr;
        }
        return dicom_types_1.DicomTagVR.UN;
    }
    isLongVr(vr) {
        return [
            dicom_types_1.DicomTagVR.OB, dicom_types_1.DicomTagVR.OD, dicom_types_1.DicomTagVR.OF, dicom_types_1.DicomTagVR.OL,
            dicom_types_1.DicomTagVR.OV, dicom_types_1.DicomTagVR.OW, dicom_types_1.DicomTagVR.SQ, dicom_types_1.DicomTagVR.UC,
            dicom_types_1.DicomTagVR.UR, dicom_types_1.DicomTagVR.UT, dicom_types_1.DicomTagVR.UN,
        ].includes(vr);
    }
    encodeStringValue(str) {
        let result = str;
        if (result.length % 2 !== 0) {
            result += ' ';
        }
        return Buffer.from(result, 'ascii');
    }
    encodeValueForVr(vr, value) {
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
                return this.encodeStringValue(value);
            default:
                return this.encodeStringValue(value);
        }
    }
    hashString(input, salt, algorithm) {
        const hash = (0, crypto_1.createHash)(algorithm);
        hash.update(salt + input);
        return hash.digest('hex').slice(0, 16).toUpperCase();
    }
    applyMask(original, pattern) {
        if (pattern === 'first_char') {
            return original.charAt(0) + '*'.repeat(Math.max(0, original.length - 1));
        }
        else if (pattern === 'last_four') {
            return '*'.repeat(Math.max(0, original.length - 4)) + original.slice(-4);
        }
        else if (pattern === 'id_card') {
            if (original.length >= 15) {
                return original.slice(0, 6) + '********' + original.slice(-4);
            }
            return '*'.repeat(original.length);
        }
        return pattern.repeat(Math.ceil(original.length / pattern.length))
            .slice(0, original.length);
    }
    shiftDate(dateStr, days) {
        try {
            const year = parseInt(dateStr.slice(0, 4), 10);
            const month = parseInt(dateStr.slice(4, 6), 10);
            const day = parseInt(dateStr.slice(6, 8), 10);
            if (isNaN(year) || isNaN(month) || isNaN(day))
                return null;
            const timestamp = Date.UTC(year, month - 1, day);
            const shifted = new Date(timestamp + days * 86400000);
            const y = shifted.getUTCFullYear();
            const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
            const d = String(shifted.getUTCDate()).padStart(2, '0');
            return `${y}${m}${d}`;
        }
        catch {
            return null;
        }
    }
    generateDerivedUid(originalUid) {
        if (!originalUid)
            return '';
        const hash = (0, crypto_1.createHash)('md5');
        hash.update(originalUid + this.uidSalt);
        const hex = hash.digest('hex');
        let decimal = BigInt(0);
        for (let i = 0; i < hex.length; i++) {
            decimal = decimal * 16n + BigInt(parseInt(hex[i], 16));
        }
        return '2.25.' + decimal.toString().slice(0, 50);
    }
    updateTransferSyntax(transferSyntaxUid) {
        if (transferSyntaxUid === '1.2.840.10008.1.2' ||
            transferSyntaxUid === '1.2.840.10008.1.2.1') {
            this.littleEndian = true;
            this.explicitVR = true;
        }
        else if (transferSyntaxUid === '1.2.840.10008.1.2.2') {
            this.littleEndian = false;
            this.explicitVR = true;
        }
        else if (transferSyntaxUid === '1.2.840.10008.1.2.99') {
            this.littleEndian = true;
            this.explicitVR = false;
        }
    }
    getPixelDataBytesProcessed() {
        return this.pixelDataBytesProcessed;
    }
}
exports.DicomAnonymizationStream = DicomAnonymizationStream;
//# sourceMappingURL=dicom-anonymization-stream.js.map