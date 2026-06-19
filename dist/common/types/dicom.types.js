"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DicomTagVR = void 0;
exports.formatTagKey = formatTagKey;
exports.parseTagKey = parseTagKey;
var DicomTagVR;
(function (DicomTagVR) {
    DicomTagVR["AE"] = "AE";
    DicomTagVR["AS"] = "AS";
    DicomTagVR["AT"] = "AT";
    DicomTagVR["CS"] = "CS";
    DicomTagVR["DA"] = "DA";
    DicomTagVR["DS"] = "DS";
    DicomTagVR["DT"] = "DT";
    DicomTagVR["FL"] = "FL";
    DicomTagVR["FD"] = "FD";
    DicomTagVR["IS"] = "IS";
    DicomTagVR["LO"] = "LO";
    DicomTagVR["LT"] = "LT";
    DicomTagVR["OB"] = "OB";
    DicomTagVR["OD"] = "OD";
    DicomTagVR["OF"] = "OF";
    DicomTagVR["OL"] = "OL";
    DicomTagVR["OV"] = "OV";
    DicomTagVR["OW"] = "OW";
    DicomTagVR["PN"] = "PN";
    DicomTagVR["SH"] = "SH";
    DicomTagVR["SL"] = "SL";
    DicomTagVR["SV"] = "SV";
    DicomTagVR["SQ"] = "SQ";
    DicomTagVR["SS"] = "SS";
    DicomTagVR["ST"] = "ST";
    DicomTagVR["TM"] = "TM";
    DicomTagVR["UC"] = "UC";
    DicomTagVR["UI"] = "UI";
    DicomTagVR["UL"] = "UL";
    DicomTagVR["UN"] = "UN";
    DicomTagVR["UR"] = "UR";
    DicomTagVR["US"] = "US";
    DicomTagVR["UT"] = "UT";
    DicomTagVR["UV"] = "UV";
})(DicomTagVR || (exports.DicomTagVR = DicomTagVR = {}));
function formatTagKey(group, element) {
    return `(${group.toString(16).padStart(4, '0').toUpperCase()},${element.toString(16).padStart(4, '0').toUpperCase()})`;
}
function parseTagKey(key) {
    const match = key.match(/\(([0-9A-Fa-f]{4}),([0-9A-Fa-f]{4})\)/);
    if (!match) {
        throw new Error(`Invalid tag key format: ${key}`);
    }
    return {
        group: parseInt(match[1], 16),
        element: parseInt(match[2], 16),
    };
}
//# sourceMappingURL=dicom.types.js.map