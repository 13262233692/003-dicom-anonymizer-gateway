"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AnonymizationRuleEnhancer_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnonymizationRuleEnhancer = void 0;
const common_1 = require("@nestjs/common");
const anonymization_types_1 = require("../common/types/anonymization.types");
const hl7_types_1 = require("../common/types/hl7.types");
let AnonymizationRuleEnhancer = AnonymizationRuleEnhancer_1 = class AnonymizationRuleEnhancer {
    constructor() {
        this.logger = new common_1.Logger(AnonymizationRuleEnhancer_1.name);
    }
    enhanceRuleForPatient(baseRule, patientState) {
        const baseLevel = baseRule.baseSensitivityLevel || anonymization_types_1.SensitivityLevel.NORMAL;
        const patientLevel = this.convertPatientSensitivityLevel(patientState?.sensitivityLevel);
        if (this.sensitivityLevelCompare(patientLevel, baseLevel) <= 0) {
            this.logger.debug(`Patient sensitivity level (${patientLevel}) <= base level (${baseLevel}), using base rules`);
            return baseRule.tagRules;
        }
        const enhancedRules = new Map();
        for (const rule of baseRule.tagRules) {
            enhancedRules.set(rule.tagKey, { ...rule });
        }
        if (patientLevel === anonymization_types_1.SensitivityLevel.HIGH) {
            this.applyHighSensitivityEnhancements(enhancedRules);
        }
        else if (patientLevel === anonymization_types_1.SensitivityLevel.VERY_HIGH) {
            this.applyHighSensitivityEnhancements(enhancedRules);
            this.applyVeryHighSensitivityEnhancements(enhancedRules);
        }
        else if (patientLevel === anonymization_types_1.SensitivityLevel.MAXIMUM) {
            this.applyHighSensitivityEnhancements(enhancedRules);
            this.applyVeryHighSensitivityEnhancements(enhancedRules);
            this.applyMaximumSensitivityEnhancements(enhancedRules);
        }
        const result = Array.from(enhancedRules.values());
        this.logger.log(`Enhanced anonymization rules: base=${baseLevel}, patient=${patientLevel}, ` +
            `tags=${result.length}, additional=${result.length - baseRule.tagRules.length}`);
        return result;
    }
    applyHighSensitivityEnhancements(rules) {
        this.ensureTagAction(rules, '0010,0010', anonymization_types_1.AnonymizationActionType.REMOVE);
        this.ensureTagAction(rules, '0010,0020', anonymization_types_1.AnonymizationActionType.HASH);
        this.ensureTagAction(rules, '0010,0030', anonymization_types_1.AnonymizationActionType.SHIFT_DATE);
        this.ensureTagAction(rules, '0010,1010', anonymization_types_1.AnonymizationActionType.REMOVE);
        this.ensureTagAction(rules, '0010,1040', anonymization_types_1.AnonymizationActionType.REMOVE);
        this.ensureTagAction(rules, '0010,2150', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0010,2154', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0010,2160', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0010,4000', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0032,1032', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0032,1033', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0032,1060', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0032,4000', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0038,0300', anonymization_types_1.AnonymizationActionType.REMOVE);
        this.ensureTagAction(rules, '0040,0275', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0040,2017', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0040,4000', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0040,4030', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0040,4037', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0040,4049', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0040,4050', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0040,4051', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0040,4052', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0040,4053', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0080,0120', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0080,012a', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0088,0130', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0088,0140', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0090', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0092', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0094', anonymization_types_1.AnonymizationActionType.EMPTY);
    }
    applyVeryHighSensitivityEnhancements(rules) {
        this.ensureTagAction(rules, '0008,0050', anonymization_types_1.AnonymizationActionType.SHIFT_DATE);
        this.ensureTagAction(rules, '0008,0020', anonymization_types_1.AnonymizationActionType.SHIFT_DATE);
        this.ensureTagAction(rules, '0008,0021', anonymization_types_1.AnonymizationActionType.SHIFT_DATE);
        this.ensureTagAction(rules, '0008,0022', anonymization_types_1.AnonymizationActionType.SHIFT_DATE);
        this.ensureTagAction(rules, '0008,0023', anonymization_types_1.AnonymizationActionType.SHIFT_DATE);
        this.ensureTagAction(rules, '0008,0030', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0031', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0032', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0033', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,1030', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,103e', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,1040', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,1048', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,1050', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,1060', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,1070', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,1080', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,1110', anonymization_types_1.AnonymizationActionType.REMOVE);
        this.ensureTagAction(rules, '0008,1111', anonymization_types_1.AnonymizationActionType.REMOVE);
        this.ensureTagAction(rules, '0008,1120', anonymization_types_1.AnonymizationActionType.REMOVE);
        this.ensureTagAction(rules, '0008,1121', anonymization_types_1.AnonymizationActionType.REMOVE);
        this.ensureTagAction(rules, '0008,1125', anonymization_types_1.AnonymizationActionType.REMOVE);
        this.ensureTagAction(rules, '0008,1126', anonymization_types_1.AnonymizationActionType.REMOVE);
        this.ensureTagAction(rules, '0008,1140', anonymization_types_1.AnonymizationActionType.REMOVE);
        this.ensureTagAction(rules, '0008,1141', anonymization_types_1.AnonymizationActionType.REMOVE);
        this.ensureTagAction(rules, '0008,1142', anonymization_types_1.AnonymizationActionType.REMOVE);
        this.ensureTagAction(rules, '0008,1145', anonymization_types_1.AnonymizationActionType.REMOVE);
        this.ensureTagAction(rules, '0008,1146', anonymization_types_1.AnonymizationActionType.REMOVE);
        this.ensureTagAction(rules, '0008,1147', anonymization_types_1.AnonymizationActionType.REMOVE);
        this.ensureTagAction(rules, '0008,1150', anonymization_types_1.AnonymizationActionType.REMOVE);
        this.ensureTagAction(rules, '0008,1151', anonymization_types_1.AnonymizationActionType.REMOVE);
        this.ensureTagAction(rules, '0008,1152', anonymization_types_1.AnonymizationActionType.REMOVE);
        this.ensureTagAction(rules, '0008,1155', anonymization_types_1.AnonymizationActionType.REMOVE);
        this.ensureTagAction(rules, '0008,1156', anonymization_types_1.AnonymizationActionType.REMOVE);
        this.ensureTagAction(rules, '0008,1250', anonymization_types_1.AnonymizationActionType.REMOVE);
    }
    applyMaximumSensitivityEnhancements(rules) {
        this.ensureTagAction(rules, '0008,0018', anonymization_types_1.AnonymizationActionType.HASH);
        this.ensureTagAction(rules, '0020,000d', anonymization_types_1.AnonymizationActionType.HASH);
        this.ensureTagAction(rules, '0020,000e', anonymization_types_1.AnonymizationActionType.HASH);
        this.ensureTagAction(rules, '0008,0080', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0081', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0082', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0083', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0084', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0085', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0086', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0087', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0088', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0089', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0093', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0096', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0097', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0098', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0099', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0100', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0102', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0104', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0106', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0108', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0110', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0112', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0114', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0116', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0118', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0120', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0008,0201', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0010', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0020', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0021', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0022', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0023', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0024', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0025', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0026', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0027', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0028', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0029', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0030', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0040', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0050', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0060', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0070', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0080', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0090', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0100', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0110', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0120', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0125', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0130', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0140', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0150', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0160', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0170', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0180', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0190', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0200', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0210', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0220', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0230', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0240', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0250', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0260', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0270', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0280', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0290', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0300', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0310', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0320', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0330', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0340', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0350', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0360', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0370', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0380', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0390', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0400', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0410', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0420', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0430', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0440', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0450', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0460', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0470', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0480', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0490', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0500', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0510', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0520', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0530', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0540', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0550', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0560', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0570', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0580', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0590', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0600', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0610', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0620', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0630', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0640', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0650', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0660', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0670', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0680', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0690', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0700', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0710', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0720', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0730', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0740', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0750', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0760', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0770', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0780', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0790', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0800', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0810', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0820', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0830', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0840', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0850', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0860', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0870', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0880', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0890', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0900', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0910', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0920', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0930', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0940', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0950', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0960', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0970', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0980', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,0990', anonymization_types_1.AnonymizationActionType.EMPTY);
        this.ensureTagAction(rules, '0018,1000', anonymization_types_1.AnonymizationActionType.EMPTY);
    }
    ensureTagAction(rules, tagKey, action) {
        if (rules.has(tagKey)) {
            const existing = rules.get(tagKey);
            if (this.isStrongerAction(action, existing.action)) {
                rules.set(tagKey, {
                    ...existing,
                    action,
                });
            }
        }
        else {
            rules.set(tagKey, {
                tagKey,
                action,
            });
        }
    }
    isStrongerAction(newAction, existingAction) {
        const actionStrength = {
            [anonymization_types_1.AnonymizationActionType.KEEP]: 0,
            [anonymization_types_1.AnonymizationActionType.MASK]: 1,
            [anonymization_types_1.AnonymizationActionType.SHIFT_DATE]: 2,
            [anonymization_types_1.AnonymizationActionType.REPLACE]: 3,
            [anonymization_types_1.AnonymizationActionType.HASH]: 4,
            [anonymization_types_1.AnonymizationActionType.EMPTY]: 5,
            [anonymization_types_1.AnonymizationActionType.REMOVE]: 6,
        };
        return (actionStrength[newAction] || 0) > (actionStrength[existingAction] || 0);
    }
    convertPatientSensitivityLevel(level) {
        switch (level) {
            case hl7_types_1.PatientSensitivityLevel.NORMAL:
                return anonymization_types_1.SensitivityLevel.NORMAL;
            case hl7_types_1.PatientSensitivityLevel.HIGH:
                return anonymization_types_1.SensitivityLevel.HIGH;
            case hl7_types_1.PatientSensitivityLevel.VERY_HIGH:
                return anonymization_types_1.SensitivityLevel.VERY_HIGH;
            case hl7_types_1.PatientSensitivityLevel.MAXIMUM:
                return anonymization_types_1.SensitivityLevel.MAXIMUM;
            default:
                return anonymization_types_1.SensitivityLevel.NORMAL;
        }
    }
    sensitivityLevelCompare(level1, level2) {
        const levelValue = {
            [anonymization_types_1.SensitivityLevel.NORMAL]: 0,
            [anonymization_types_1.SensitivityLevel.HIGH]: 1,
            [anonymization_types_1.SensitivityLevel.VERY_HIGH]: 2,
            [anonymization_types_1.SensitivityLevel.MAXIMUM]: 3,
        };
        return (levelValue[level1] || 0) - (levelValue[level2] || 0);
    }
};
exports.AnonymizationRuleEnhancer = AnonymizationRuleEnhancer;
exports.AnonymizationRuleEnhancer = AnonymizationRuleEnhancer = AnonymizationRuleEnhancer_1 = __decorate([
    (0, common_1.Injectable)()
], AnonymizationRuleEnhancer);
//# sourceMappingURL=anonymization-rule-enhancer.service.js.map