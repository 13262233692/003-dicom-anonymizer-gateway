"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtocolModule = void 0;
const common_1 = require("@nestjs/common");
const dicom_pdu_codec_service_1 = require("./dicom-pdu-codec.service");
const dimse_codec_service_1 = require("./dimse-codec.service");
const dicom_scp_server_service_1 = require("./dicom-scp-server.service");
const dicom_scu_client_service_1 = require("./dicom-scu-client.service");
let ProtocolModule = class ProtocolModule {
};
exports.ProtocolModule = ProtocolModule;
exports.ProtocolModule = ProtocolModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [dicom_pdu_codec_service_1.DicomPduCodec, dimse_codec_service_1.DimseCodec, dicom_scp_server_service_1.DicomScpServer, dicom_scu_client_service_1.DicomScuClient],
        exports: [dicom_scp_server_service_1.DicomScpServer, dicom_scu_client_service_1.DicomScuClient],
    })
], ProtocolModule);
//# sourceMappingURL=protocol.module.js.map