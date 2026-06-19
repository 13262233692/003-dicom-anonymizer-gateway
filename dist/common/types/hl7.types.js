"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Hl7EventType = exports.PatientSensitivityLevel = exports.PatientAccountStatus = exports.PatientClass = exports.Hl7MessageType = void 0;
var Hl7MessageType;
(function (Hl7MessageType) {
    Hl7MessageType["ADT_A01"] = "ADT^A01";
    Hl7MessageType["ADT_A02"] = "ADT^A02";
    Hl7MessageType["ADT_A03"] = "ADT^A03";
    Hl7MessageType["ADT_A04"] = "ADT^A04";
    Hl7MessageType["ADT_A05"] = "ADT^A05";
    Hl7MessageType["ADT_A08"] = "ADT^A08";
    Hl7MessageType["ADT_A11"] = "ADT^A11";
    Hl7MessageType["ADT_A13"] = "ADT^A13";
    Hl7MessageType["ADT_A28"] = "ADT^A28";
    Hl7MessageType["ADT_A31"] = "ADT^A31";
    Hl7MessageType["ADT_A40"] = "ADT^A40";
    Hl7MessageType["ORM_O01"] = "ORM^O01";
    Hl7MessageType["ORU_R01"] = "ORU^R01";
    Hl7MessageType["MDM_T01"] = "MDM^T01";
})(Hl7MessageType || (exports.Hl7MessageType = Hl7MessageType = {}));
var PatientClass;
(function (PatientClass) {
    PatientClass["INPATIENT"] = "I";
    PatientClass["OUTPATIENT"] = "O";
    PatientClass["EMERGENCY"] = "E";
    PatientClass["DAY_CASE"] = "D";
    PatientClass["DISCHARGED"] = "D";
})(PatientClass || (exports.PatientClass = PatientClass = {}));
var PatientAccountStatus;
(function (PatientAccountStatus) {
    PatientAccountStatus["ACTIVE"] = "active";
    PatientAccountStatus["DISCHARGED"] = "discharged";
    PatientAccountStatus["TRANSFERRED"] = "transferred";
    PatientAccountStatus["DECEASED"] = "deceased";
    PatientAccountStatus["PRE_ADMIT"] = "pre_admit";
    PatientAccountStatus["REGISTERED"] = "registered";
})(PatientAccountStatus || (exports.PatientAccountStatus = PatientAccountStatus = {}));
var PatientSensitivityLevel;
(function (PatientSensitivityLevel) {
    PatientSensitivityLevel["NORMAL"] = "normal";
    PatientSensitivityLevel["HIGH"] = "high";
    PatientSensitivityLevel["VERY_HIGH"] = "very_high";
    PatientSensitivityLevel["MAXIMUM"] = "maximum";
})(PatientSensitivityLevel || (exports.PatientSensitivityLevel = PatientSensitivityLevel = {}));
var Hl7EventType;
(function (Hl7EventType) {
    Hl7EventType["MESSAGE_RECEIVED"] = "hl7_message_received";
    Hl7EventType["PATIENT_UPDATED"] = "patient_updated";
    Hl7EventType["PATIENT_DISCHARGED"] = "patient_discharged";
    Hl7EventType["PATIENT_ADMITTED"] = "patient_admitted";
    Hl7EventType["PATIENT_TRANSFERRED"] = "patient_transferred";
})(Hl7EventType || (exports.Hl7EventType = Hl7EventType = {}));
//# sourceMappingURL=hl7.types.js.map