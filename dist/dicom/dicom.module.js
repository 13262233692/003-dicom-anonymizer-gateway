"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DicomModule = void 0;
const common_1 = require("@nestjs/common");
const dicom_binary_parser_service_1 = require("./dicom-binary-parser.service");
const dicom_binary_reconstructor_service_1 = require("./dicom-binary-reconstructor.service");
const streaming_anonymization_engine_service_1 = require("./streaming-anonymization-engine.service");
const anonymization_rule_enhancer_service_1 = require("./anonymization-rule-enhancer.service");
let DicomModule = class DicomModule {
};
exports.DicomModule = DicomModule;
exports.DicomModule = DicomModule = __decorate([
    (0, common_1.Module)({
        providers: [
            dicom_binary_parser_service_1.DicomBinaryParser,
            dicom_binary_reconstructor_service_1.DicomBinaryReconstructor,
            streaming_anonymization_engine_service_1.StreamingAnonymizationEngine,
            anonymization_rule_enhancer_service_1.AnonymizationRuleEnhancer,
        ],
        exports: [
            dicom_binary_parser_service_1.DicomBinaryParser,
            dicom_binary_reconstructor_service_1.DicomBinaryReconstructor,
            streaming_anonymization_engine_service_1.StreamingAnonymizationEngine,
            anonymization_rule_enhancer_service_1.AnonymizationRuleEnhancer,
        ],
    })
], DicomModule);
//# sourceMappingURL=dicom.module.js.map