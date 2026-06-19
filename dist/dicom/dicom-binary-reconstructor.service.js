"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DicomBinaryReconstructor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DicomBinaryReconstructor = void 0;
const common_1 = require("@nestjs/common");
const dicom_types_1 = require("../common/types/dicom.types");
let DicomBinaryReconstructor = DicomBinaryReconstructor_1 = class DicomBinaryReconstructor {
    constructor() {
        this.logger = new common_1.Logger(DicomBinaryReconstructor_1.name);
    }
    reconstruct(parsed) {
        const chunks = [];
        const preamble = Buffer.alloc(128);
        chunks.push(preamble);
        chunks.push(Buffer.from('DICM', 'ascii'));
        const metaTags = [];
        const dataTags = [];
        for (const [key, tag] of parsed.tags.entries()) {
            if (tag.group === 0x0002) {
                metaTags.push([key, tag]);
            }
            else {
                dataTags.push([key, tag]);
            }
        }
        metaTags.sort((a, b) => {
            const ta = a[1];
            const tb = b[1];
            if (ta.group !== tb.group)
                return ta.group - tb.group;
            return ta.element - tb.element;
        });
        dataTags.sort((a, b) => {
            const ta = a[1];
            const tb = b[1];
            if (ta.group !== tb.group)
                return ta.group - tb.group;
            return ta.element - tb.element;
        });
        const metaGroupContent = this.serializeTags(metaTags, true, true);
        const metaGroupLengthTag = {
            group: 0x0002,
            element: 0x0000,
            vr: dicom_types_1.DicomTagVR.UL,
            value: metaGroupContent.length,
            length: 4,
            keyword: 'FileMetaInformationGroupLength',
        };
        chunks.push(this.serializeTag(metaGroupLengthTag, true, true));
        chunks.push(metaGroupContent);
        chunks.push(this.serializeTags(dataTags, true, true));
        return Buffer.concat(chunks);
    }
    serializeTags(tags, littleEndian, explicitVR) {
        const chunks = [];
        for (const [, tag] of tags) {
            chunks.push(this.serializeTag(tag, littleEndian, explicitVR));
        }
        return Buffer.concat(chunks);
    }
    serializeTag(tag, littleEndian, explicitVR) {
        if (tag.group === 0x0002 && tag.element === 0x0000) {
            const header = Buffer.alloc(12);
            header.writeUInt16LE(tag.group, 0);
            header.writeUInt16LE(tag.element, 2);
            header.write('UL', 4, 'ascii');
            header.writeUInt16LE(4, 6);
            header.writeUInt32LE(Number(tag.value), 8);
            return header;
        }
        const valueBuffer = this.encodeValue(tag.vr, tag.value, littleEndian);
        let valueLength = valueBuffer.length;
        if (tag.vr === dicom_types_1.DicomTagVR.SQ || tag.vr === dicom_types_1.DicomTagVR.OB ||
            tag.vr === dicom_types_1.DicomTagVR.OW || tag.vr === dicom_types_1.DicomTagVR.OF ||
            tag.vr === dicom_types_1.DicomTagVR.OD || tag.vr === dicom_types_1.DicomTagVR.OL ||
            tag.vr === dicom_types_1.DicomTagVR.OV || tag.vr === dicom_types_1.DicomTagVR.UN) {
            const isLongVR = true;
            const headerSize = explicitVR ? (isLongVR ? 12 : 8) : 8;
            const header = Buffer.alloc(headerSize);
            if (littleEndian) {
                header.writeUInt16LE(tag.group, 0);
                header.writeUInt16LE(tag.element, 2);
            }
            else {
                header.writeUInt16BE(tag.group, 0);
                header.writeUInt16BE(tag.element, 2);
            }
            if (explicitVR) {
                header.write(tag.vr, 4, 'ascii');
                if (isLongVR) {
                    if (littleEndian) {
                        header.writeUInt32LE(valueLength, 8);
                    }
                    else {
                        header.writeUInt32BE(valueLength, 8);
                    }
                }
                else {
                    if (littleEndian) {
                        header.writeUInt16LE(valueLength, 6);
                    }
                    else {
                        header.writeUInt16BE(valueLength, 6);
                    }
                }
            }
            else {
                if (littleEndian) {
                    header.writeUInt32LE(valueLength, 4);
                }
                else {
                    header.writeUInt32BE(valueLength, 4);
                }
            }
            return Buffer.concat([header, valueBuffer]);
        }
        const vr = tag.vr;
        const isLongVR = this.isLongVr(vr);
        if (explicitVR) {
            if (isLongVR) {
                const header = Buffer.alloc(12);
                if (littleEndian) {
                    header.writeUInt16LE(tag.group, 0);
                    header.writeUInt16LE(tag.element, 2);
                }
                else {
                    header.writeUInt16BE(tag.group, 0);
                    header.writeUInt16BE(tag.element, 2);
                }
                header.write(vr, 4, 'ascii');
                if (littleEndian) {
                    header.writeUInt32LE(valueLength, 8);
                }
                else {
                    header.writeUInt32BE(valueLength, 8);
                }
                return Buffer.concat([header, valueBuffer]);
            }
            else {
                const header = Buffer.alloc(8);
                if (littleEndian) {
                    header.writeUInt16LE(tag.group, 0);
                    header.writeUInt16LE(tag.element, 2);
                }
                else {
                    header.writeUInt16BE(tag.group, 0);
                    header.writeUInt16BE(tag.element, 2);
                }
                header.write(vr, 4, 'ascii');
                if (littleEndian) {
                    header.writeUInt16LE(valueLength, 6);
                }
                else {
                    header.writeUInt16BE(valueLength, 6);
                }
                return Buffer.concat([header, valueBuffer]);
            }
        }
        else {
            const header = Buffer.alloc(8);
            if (littleEndian) {
                header.writeUInt16LE(tag.group, 0);
                header.writeUInt16LE(tag.element, 2);
                header.writeUInt32LE(valueLength, 4);
            }
            else {
                header.writeUInt16BE(tag.group, 0);
                header.writeUInt16BE(tag.element, 2);
                header.writeUInt32BE(valueLength, 4);
            }
            return Buffer.concat([header, valueBuffer]);
        }
    }
    encodeValue(vr, value, littleEndian) {
        if (value === null || value === undefined) {
            return Buffer.alloc(0);
        }
        if (Buffer.isBuffer(value)) {
            let buf = value;
            if (buf.length % 2 !== 0) {
                const padded = Buffer.alloc(buf.length + 1);
                buf.copy(padded);
                padded.writeUInt8(0, buf.length);
                buf = padded;
            }
            return buf;
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
            case dicom_types_1.DicomTagVR.UT: {
                let str = String(value);
                if (str.length % 2 !== 0) {
                    str += ' ';
                }
                return Buffer.from(str, 'utf8');
            }
            case dicom_types_1.DicomTagVR.OB:
            case dicom_types_1.DicomTagVR.OF:
            case dicom_types_1.DicomTagVR.OW:
            case dicom_types_1.DicomTagVR.OD:
            case dicom_types_1.DicomTagVR.OL:
            case dicom_types_1.DicomTagVR.OV:
            case dicom_types_1.DicomTagVR.UN:
            case dicom_types_1.DicomTagVR.SQ: {
                let buf = Buffer.from(value);
                if (buf.length % 2 !== 0) {
                    const padded = Buffer.alloc(buf.length + 1);
                    buf.copy(padded);
                    buf = padded;
                }
                return buf;
            }
            case dicom_types_1.DicomTagVR.AT: {
                const values = Array.isArray(value) ? value : [value];
                const buf = Buffer.alloc(values.length * 4);
                for (let i = 0; i < values.length; i++) {
                    const v = values[i];
                    if (Array.isArray(v) && v.length >= 2) {
                        if (littleEndian) {
                            buf.writeUInt16LE(v[0], i * 4);
                            buf.writeUInt16LE(v[1], i * 4 + 2);
                        }
                        else {
                            buf.writeUInt16BE(v[0], i * 4);
                            buf.writeUInt16BE(v[1], i * 4 + 2);
                        }
                    }
                }
                return buf;
            }
            case dicom_types_1.DicomTagVR.SL:
            case dicom_types_1.DicomTagVR.UL: {
                const values = Array.isArray(value) ? value : [value];
                const buf = Buffer.alloc(values.length * 4);
                for (let i = 0; i < values.length; i++) {
                    if (littleEndian) {
                        buf.writeUInt32LE(Number(values[i]), i * 4);
                    }
                    else {
                        buf.writeUInt32BE(Number(values[i]), i * 4);
                    }
                }
                return buf;
            }
            case dicom_types_1.DicomTagVR.SV:
            case dicom_types_1.DicomTagVR.UV: {
                const values = Array.isArray(value) ? value : [value];
                const buf = Buffer.alloc(values.length * 8);
                for (let i = 0; i < values.length; i++) {
                    const v = BigInt(values[i]);
                    if (littleEndian) {
                        buf.writeBigUInt64LE(v, i * 8);
                    }
                    else {
                        buf.writeBigUInt64BE(v, i * 8);
                    }
                }
                return buf;
            }
            case dicom_types_1.DicomTagVR.SS:
            case dicom_types_1.DicomTagVR.US: {
                const values = Array.isArray(value) ? value : [value];
                const buf = Buffer.alloc(values.length * 2);
                for (let i = 0; i < values.length; i++) {
                    if (vr === dicom_types_1.DicomTagVR.SS) {
                        if (littleEndian) {
                            buf.writeInt16LE(Number(values[i]), i * 2);
                        }
                        else {
                            buf.writeInt16BE(Number(values[i]), i * 2);
                        }
                    }
                    else {
                        if (littleEndian) {
                            buf.writeUInt16LE(Number(values[i]), i * 2);
                        }
                        else {
                            buf.writeUInt16BE(Number(values[i]), i * 2);
                        }
                    }
                }
                return buf;
            }
            case dicom_types_1.DicomTagVR.FL: {
                const values = Array.isArray(value) ? value : [value];
                const buf = Buffer.alloc(values.length * 4);
                for (let i = 0; i < values.length; i++) {
                    if (littleEndian) {
                        buf.writeFloatLE(Number(values[i]), i * 4);
                    }
                    else {
                        buf.writeFloatBE(Number(values[i]), i * 4);
                    }
                }
                return buf;
            }
            case dicom_types_1.DicomTagVR.FD: {
                const values = Array.isArray(value) ? value : [value];
                const buf = Buffer.alloc(values.length * 8);
                for (let i = 0; i < values.length; i++) {
                    if (littleEndian) {
                        buf.writeDoubleLE(Number(values[i]), i * 8);
                    }
                    else {
                        buf.writeDoubleBE(Number(values[i]), i * 8);
                    }
                }
                return buf;
            }
            default:
                return Buffer.from(String(value), 'utf8');
        }
    }
    isLongVr(vr) {
        const longVRs = [
            dicom_types_1.DicomTagVR.OB, dicom_types_1.DicomTagVR.OD, dicom_types_1.DicomTagVR.OF, dicom_types_1.DicomTagVR.OL,
            dicom_types_1.DicomTagVR.OV, dicom_types_1.DicomTagVR.OW, dicom_types_1.DicomTagVR.SQ, dicom_types_1.DicomTagVR.UC,
            dicom_types_1.DicomTagVR.UR, dicom_types_1.DicomTagVR.UT, dicom_types_1.DicomTagVR.UN,
        ];
        return longVRs.includes(vr);
    }
    updateTag(parsed, group, element, value) {
        const key = (0, dicom_types_1.formatTagKey)(group, element);
        const existing = parsed.tags.get(key);
        if (existing) {
            existing.value = value;
        }
        else {
            const newTag = {
                group,
                element,
                vr: dicom_types_1.DicomTagVR.LO,
                value,
                length: Buffer.byteLength(String(value), 'utf8'),
            };
            parsed.tags.set(key, newTag);
        }
    }
    removeTag(parsed, group, element) {
        const key = (0, dicom_types_1.formatTagKey)(group, element);
        return parsed.tags.delete(key);
    }
    getTagValue(parsed, group, element) {
        const key = (0, dicom_types_1.formatTagKey)(group, element);
        const tag = parsed.tags.get(key);
        if (!tag)
            return null;
        return tag.value;
    }
    getTagValueString(parsed, group, element) {
        const value = this.getTagValue(parsed, group, element);
        if (value === null || value === undefined)
            return '';
        if (Buffer.isBuffer(value))
            return value.toString('utf8').trim();
        return String(value).trim();
    }
};
exports.DicomBinaryReconstructor = DicomBinaryReconstructor;
exports.DicomBinaryReconstructor = DicomBinaryReconstructor = DicomBinaryReconstructor_1 = __decorate([
    (0, common_1.Injectable)()
], DicomBinaryReconstructor);
//# sourceMappingURL=dicom-binary-reconstructor.service.js.map