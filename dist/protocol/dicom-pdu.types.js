"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssociationState = exports.DimseStatus = exports.CommandField = exports.PduType = void 0;
var PduType;
(function (PduType) {
    PduType[PduType["A_ASSOCIATE_RQ"] = 1] = "A_ASSOCIATE_RQ";
    PduType[PduType["A_ASSOCIATE_AC"] = 2] = "A_ASSOCIATE_AC";
    PduType[PduType["A_ASSOCIATE_RJ"] = 3] = "A_ASSOCIATE_RJ";
    PduType[PduType["P_DATA_TF"] = 4] = "P_DATA_TF";
    PduType[PduType["A_RELEASE_RQ"] = 5] = "A_RELEASE_RQ";
    PduType[PduType["A_RELEASE_RP"] = 6] = "A_RELEASE_RP";
    PduType[PduType["A_ABORT"] = 7] = "A_ABORT";
})(PduType || (exports.PduType = PduType = {}));
var CommandField;
(function (CommandField) {
    CommandField[CommandField["C_STORE_RQ"] = 1] = "C_STORE_RQ";
    CommandField[CommandField["C_STORE_RSP"] = 32769] = "C_STORE_RSP";
    CommandField[CommandField["C_FIND_RQ"] = 32] = "C_FIND_RQ";
    CommandField[CommandField["C_FIND_RSP"] = 32800] = "C_FIND_RSP";
    CommandField[CommandField["C_MOVE_RQ"] = 33] = "C_MOVE_RQ";
    CommandField[CommandField["C_MOVE_RSP"] = 32801] = "C_MOVE_RSP";
    CommandField[CommandField["C_GET_RQ"] = 16] = "C_GET_RQ";
    CommandField[CommandField["C_GET_RSP"] = 32784] = "C_GET_RSP";
    CommandField[CommandField["C_ECHO_RQ"] = 48] = "C_ECHO_RQ";
    CommandField[CommandField["C_ECHO_RSP"] = 32816] = "C_ECHO_RSP";
})(CommandField || (exports.CommandField = CommandField = {}));
var DimseStatus;
(function (DimseStatus) {
    DimseStatus[DimseStatus["SUCCESS"] = 0] = "SUCCESS";
    DimseStatus[DimseStatus["WARNING"] = 1] = "WARNING";
    DimseStatus[DimseStatus["PENDING"] = 65280] = "PENDING";
    DimseStatus[DimseStatus["CANCEL"] = 65024] = "CANCEL";
    DimseStatus[DimseStatus["NO_SUCH_SOP_CLASS"] = 274] = "NO_SUCH_SOP_CLASS";
    DimseStatus[DimseStatus["CLASS_INSTANCE_CONFLICT"] = 281] = "CLASS_INSTANCE_CONFLICT";
    DimseStatus[DimseStatus["MISSING_ATTRIBUTE"] = 288] = "MISSING_ATTRIBUTE";
    DimseStatus[DimseStatus["MISSING_ATTRIBUTE_VALUE"] = 289] = "MISSING_ATTRIBUTE_VALUE";
    DimseStatus[DimseStatus["C_STORE_UNABLE_TO_PROCESS"] = 42752] = "C_STORE_UNABLE_TO_PROCESS";
    DimseStatus[DimseStatus["OUT_OF_RESOURCES"] = 42753] = "OUT_OF_RESOURCES";
    DimseStatus[DimseStatus["DATA_SET_DOES_NOT_MATCH_SOP_CLASS"] = 43264] = "DATA_SET_DOES_NOT_MATCH_SOP_CLASS";
    DimseStatus[DimseStatus["C_STORE_CANNOT_UNDERSTAND"] = 49152] = "C_STORE_CANNOT_UNDERSTAND";
    DimseStatus[DimseStatus["PROCESSING_FAILURE"] = 272] = "PROCESSING_FAILURE";
    DimseStatus[DimseStatus["DUPLICATE_SOP_INSTANCE"] = 273] = "DUPLICATE_SOP_INSTANCE";
})(DimseStatus || (exports.DimseStatus = DimseStatus = {}));
var AssociationState;
(function (AssociationState) {
    AssociationState["IDLE"] = "idle";
    AssociationState["AWAITING_ASSOCIATE_RQ"] = "awaiting_associate_rq";
    AssociationState["ASSOCIATION_ESTABLISHED"] = "association_established";
    AssociationState["AWAITING_RELEASE_RP"] = "awaiting_release_rp";
    AssociationState["RELEASED"] = "released";
    AssociationState["ABORTED"] = "aborted";
})(AssociationState || (exports.AssociationState = AssociationState = {}));
//# sourceMappingURL=dicom-pdu.types.js.map