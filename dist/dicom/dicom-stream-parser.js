"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DicomStreamParser = exports.DicomStreamState = void 0;
const stream_1 = require("stream");
const dicom_types_1 = require("../common/types/dicom.types");
const dicom_tag_dictionary_1 = require("./dicom-tag-dictionary");
var DicomStreamState;
(function (DicomStreamState) {
    DicomStreamState["WAITING_PREAMBLE"] = "waiting_preamble";
    DicomStreamState["PARSING_FILE_META"] = "parsing_file_meta";
    DicomStreamState["PARSING_DATASET"] = "parsing_dataset";
    DicomStreamState["PARSING_TAG_HEADER"] = "parsing_tag_header";
    DicomStreamState["READING_TAG_VALUE"] = "reading_tag_value";
    DicomStreamState["STREAMING_PIXEL_DATA"] = "streaming_pixel_data";
    DicomStreamState["COMPLETE"] = "complete";
})(DicomStreamState || (exports.DicomStreamState = DicomStreamState = {}));
class DicomStreamParser extends stream_1.Transform {
    constructor() {
        super({
            readableObjectMode: false,
            writableObjectMode: false,
            highWaterMark: 64 * 1024,
        });
        this.state = DicomStreamState.WAITING_PREAMBLE;
        this.internalBuffer = Buffer.alloc(0);
        this.littleEndian = true;
        this.explicitVR = true;
        this.PREAMBLE_LENGTH = 128;
        this.DICOM_MAGIC = 'DICM';
        this.tags = new Map();
        this.currentTag = null;
        this.pixelDataTotalLength = 0;
        this.pixelDataBytesStreamed = 0;
        this.pixelDataUndefinedLength = false;
        this.transferSyntaxUid = '1.2.840.10008.1.2.1';
        this.sopClassUid = '';
        this.sopInstanceUid = '';
        this.studyInstanceUid = '';
        this.seriesInstanceUid = '';
        this.patientId = '';
        this.patientName = '';
        this.modality = '';
        this.tagHeadersAccumulated = 0;
        this.MAX_TAG_VALUE_IN_MEMORY = 64 * 1024 * 1024;
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
            if (this.state === DicomStreamState.STREAMING_PIXEL_DATA && this.pixelDataUndefinedLength) {
                this.emit('pixelDataEnd', {
                    totalBytesStreamed: this.pixelDataBytesStreamed,
                });
            }
            this.state = DicomStreamState.COMPLETE;
            this.emit('parseComplete', {
                tagsCount: this.tags.size,
                sopClassUid: this.sopClassUid,
                sopInstanceUid: this.sopInstanceUid,
                transferSyntaxUid: this.transferSyntaxUid,
                pixelDataBytesStreamed: this.pixelDataBytesStreamed,
            });
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
                case DicomStreamState.WAITING_PREAMBLE:
                    continueProcessing = this.tryParsePreamble();
                    break;
                case DicomStreamState.PARSING_FILE_META:
                case DicomStreamState.PARSING_DATASET:
                case DicomStreamState.PARSING_TAG_HEADER:
                    continueProcessing = this.tryParseTagHeader();
                    break;
                case DicomStreamState.READING_TAG_VALUE:
                    continueProcessing = this.tryReadTagValue();
                    break;
                case DicomStreamState.STREAMING_PIXEL_DATA:
                    continueProcessing = this.tryStreamPixelData();
                    break;
                case DicomStreamState.COMPLETE:
                    continueProcessing = false;
                    break;
                default:
                    continueProcessing = false;
            }
        }
    }
    tryParsePreamble() {
        if (this.internalBuffer.length < this.PREAMBLE_LENGTH + 4) {
            return false;
        }
        const magic = this.internalBuffer.toString('ascii', this.PREAMBLE_LENGTH, this.PREAMBLE_LENGTH + 4);
        this.push(this.internalBuffer.subarray(0, this.PREAMBLE_LENGTH + 4));
        this.internalBuffer = Buffer.from(this.internalBuffer.subarray(this.PREAMBLE_LENGTH + 4));
        if (magic === this.DICOM_MAGIC) {
            this.state = DicomStreamState.PARSING_FILE_META;
        }
        else {
            this.state = DicomStreamState.PARSING_DATASET;
        }
        return this.internalBuffer.length > 0;
    }
    tryParseTagHeader() {
        const headerSize = this.explicitVR ? 8 : 8;
        if (this.internalBuffer.length < headerSize) {
            this.state = this.currentStateToHeaderState();
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
                    this.state = this.currentStateToHeaderState();
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
        const isPixelData = group === 0x7fe0 && element === 0x0010;
        const isLargeValue = length > this.MAX_TAG_VALUE_IN_MEMORY;
        const isUndefinedLength = length === 0xFFFFFFFF;
        if (isPixelData || (isLargeValue && this.isPixelLikeVR(vr))) {
            this.currentTag = { group, element, vr, length, bytesRead: 0 };
            this.pixelDataTotalLength = isUndefinedLength ? 0 : length;
            this.pixelDataBytesStreamed = 0;
            this.pixelDataUndefinedLength = isUndefinedLength;
            const headerChunk = Buffer.from(this.internalBuffer.subarray(0, headerBytes));
            this.push(headerChunk);
            this.internalBuffer = Buffer.from(this.internalBuffer.subarray(headerBytes));
            const dictEntry = (0, dicom_tag_dictionary_1.lookupTagDictionary)(group, element);
            const tag = {
                group,
                element,
                vr,
                value: null,
                length,
                keyword: dictEntry?.keyword,
            };
            this.tags.set(tagKey, tag);
            this.emit('tag', {
                tagKey,
                group,
                element,
                vr,
                value: null,
                length,
                keyword: dictEntry?.keyword,
            });
            this.emit('pixelDataStart', {
                tagKey,
                vr,
                totalLength: isUndefinedLength ? undefined : length,
                undefinedLength: isUndefinedLength,
            });
            this.state = DicomStreamState.STREAMING_PIXEL_DATA;
            return this.internalBuffer.length > 0;
        }
        this.currentTag = { group, element, vr, length, bytesRead: 0 };
        this.internalBuffer = Buffer.from(this.internalBuffer.subarray(headerBytes));
        this.state = DicomStreamState.READING_TAG_VALUE;
        return true;
    }
    handleDelimiter(group, element) {
        const length = this.littleEndian
            ? this.internalBuffer.readUInt32LE(4)
            : this.internalBuffer.readUInt32BE(4);
        if (group === 0xFFFE && element === 0xE0DD) {
            if (this.state === DicomStreamState.STREAMING_PIXEL_DATA) {
                this.emit('pixelDataEnd', {
                    totalBytesStreamed: this.pixelDataBytesStreamed,
                });
                this.state = DicomStreamState.PARSING_DATASET;
                this.currentTag = null;
            }
            this.push(this.internalBuffer.subarray(0, 8));
            this.internalBuffer = Buffer.from(this.internalBuffer.subarray(8));
            return this.internalBuffer.length > 0;
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
    tryReadTagValue() {
        if (!this.currentTag) {
            this.state = DicomStreamState.PARSING_DATASET;
            return true;
        }
        const { length, group, element, vr } = this.currentTag;
        if (length === 0) {
            this.finalizeTag(group, element, vr, Buffer.alloc(0));
            this.currentTag = null;
            this.state = DicomStreamState.PARSING_DATASET;
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
        this.finalizeTag(group, element, vr, valueBuffer);
        this.currentTag = null;
        this.state = DicomStreamState.PARSING_DATASET;
        return this.internalBuffer.length > 0;
    }
    finalizeTag(group, element, vr, valueBuffer) {
        const tagKey = (0, dicom_types_1.formatTagKey)(group, element);
        const value = this.decodeValue(vr, valueBuffer, this.littleEndian);
        const dictEntry = (0, dicom_tag_dictionary_1.lookupTagDictionary)(group, element);
        const tag = {
            group,
            element,
            vr,
            value,
            length: valueBuffer.length,
            keyword: dictEntry?.keyword,
        };
        this.tags.set(tagKey, tag);
        if (group === 0x0002 && element === 0x0010) {
            this.transferSyntaxUid = this.extractTransferSyntax(value);
            this.updateTransferSyntax(this.transferSyntaxUid);
        }
        if (group === 0x0008 && element === 0x0016) {
            this.sopClassUid = this.cleanStringValue(value);
        }
        if (group === 0x0008 && element === 0x0018) {
            this.sopInstanceUid = this.cleanStringValue(value);
        }
        if (group === 0x0020 && element === 0x000d) {
            this.studyInstanceUid = this.cleanStringValue(value);
        }
        if (group === 0x0020 && element === 0x000e) {
            this.seriesInstanceUid = this.cleanStringValue(value);
        }
        if (group === 0x0010 && element === 0x0020) {
            this.patientId = this.cleanStringValue(value);
        }
        if (group === 0x0010 && element === 0x0010) {
            this.patientName = this.cleanStringValue(value);
        }
        if (group === 0x0008 && element === 0x0060) {
            this.modality = this.cleanStringValue(value);
        }
        this.emit('tag', {
            tagKey,
            group,
            element,
            vr,
            value,
            length: valueBuffer.length,
            keyword: dictEntry?.keyword,
        });
    }
    tryStreamPixelData() {
        if (this.internalBuffer.length === 0) {
            return false;
        }
        let chunkToStream;
        if (this.pixelDataUndefinedLength) {
            chunkToStream = Buffer.from(this.internalBuffer);
            this.internalBuffer = Buffer.alloc(0);
        }
        else {
            const remaining = this.pixelDataTotalLength - this.pixelDataBytesStreamed;
            const toRead = Math.min(remaining, this.internalBuffer.length);
            chunkToStream = Buffer.from(this.internalBuffer.subarray(0, toRead));
            this.internalBuffer = Buffer.from(this.internalBuffer.subarray(toRead));
        }
        this.pixelDataBytesStreamed += chunkToStream.length;
        this.push(chunkToStream);
        this.emit('pixelDataChunk', {
            chunk: chunkToStream,
            isEnd: false,
            totalBytesStreamed: this.pixelDataBytesStreamed,
        });
        if (!this.pixelDataUndefinedLength && this.pixelDataBytesStreamed >= this.pixelDataTotalLength) {
            this.emit('pixelDataEnd', {
                totalBytesStreamed: this.pixelDataBytesStreamed,
            });
            const paddedLength = this.pixelDataTotalLength % 2 !== 0 ? this.pixelDataTotalLength + 1 : this.pixelDataTotalLength;
            if (paddedLength > this.pixelDataTotalLength && this.internalBuffer.length > 0) {
                this.internalBuffer = Buffer.from(this.internalBuffer.subarray(1));
            }
            this.currentTag = null;
            this.state = DicomStreamState.PARSING_DATASET;
        }
        return this.internalBuffer.length > 0;
    }
    currentStateToHeaderState() {
        if (this.state === DicomStreamState.PARSING_FILE_META) {
            return DicomStreamState.PARSING_FILE_META;
        }
        return DicomStreamState.PARSING_TAG_HEADER;
    }
    decodeValue(vr, data, littleEndian) {
        if (data.length === 0) {
            return vr === dicom_types_1.DicomTagVR.OB || vr === dicom_types_1.DicomTagVR.OW ? Buffer.alloc(0) : '';
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
                return data.toString('utf8').trim();
            case dicom_types_1.DicomTagVR.OB:
            case dicom_types_1.DicomTagVR.OF:
            case dicom_types_1.DicomTagVR.OW:
            case dicom_types_1.DicomTagVR.OD:
            case dicom_types_1.DicomTagVR.OL:
            case dicom_types_1.DicomTagVR.OV:
            case dicom_types_1.DicomTagVR.UN:
            case dicom_types_1.DicomTagVR.SQ:
                return Buffer.from(data);
            case dicom_types_1.DicomTagVR.US: {
                const result = [];
                for (let i = 0; i + 2 <= data.length; i += 2) {
                    result.push(littleEndian ? data.readUInt16LE(i) : data.readUInt16BE(i));
                }
                return result.length === 1 ? result[0] : result;
            }
            case dicom_types_1.DicomTagVR.SS: {
                const result = [];
                for (let i = 0; i + 2 <= data.length; i += 2) {
                    result.push(littleEndian ? data.readInt16LE(i) : data.readInt16BE(i));
                }
                return result.length === 1 ? result[0] : result;
            }
            case dicom_types_1.DicomTagVR.UL: {
                const result = [];
                for (let i = 0; i + 4 <= data.length; i += 4) {
                    result.push(littleEndian ? data.readUInt32LE(i) : data.readUInt32BE(i));
                }
                return result.length === 1 ? result[0] : result;
            }
            case dicom_types_1.DicomTagVR.SL: {
                const result = [];
                for (let i = 0; i + 4 <= data.length; i += 4) {
                    result.push(littleEndian ? data.readInt32LE(i) : data.readInt32BE(i));
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
    isPixelLikeVR(vr) {
        return [
            dicom_types_1.DicomTagVR.OB, dicom_types_1.DicomTagVR.OW, dicom_types_1.DicomTagVR.OF,
            dicom_types_1.DicomTagVR.OD, dicom_types_1.DicomTagVR.OL, dicom_types_1.DicomTagVR.OV,
            dicom_types_1.DicomTagVR.SQ, dicom_types_1.DicomTagVR.UN,
        ].includes(vr);
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
    getTags() {
        return this.tags;
    }
    getTransferSyntaxUid() {
        return this.transferSyntaxUid;
    }
    getSopClassUid() {
        return this.sopClassUid;
    }
    getSopInstanceUid() {
        return this.sopInstanceUid;
    }
    getStudyInstanceUid() {
        return this.studyInstanceUid;
    }
    getSeriesInstanceUid() {
        return this.seriesInstanceUid;
    }
    getPatientId() {
        return this.patientId;
    }
    getPatientName() {
        return this.patientName;
    }
    getModality() {
        return this.modality;
    }
    getPixelDataBytesStreamed() {
        return this.pixelDataBytesStreamed;
    }
    getState() {
        return this.state;
    }
}
exports.DicomStreamParser = DicomStreamParser;
//# sourceMappingURL=dicom-stream-parser.js.map