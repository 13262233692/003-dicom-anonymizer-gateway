import { Injectable, Logger } from '@nestjs/common';
import {
  AnonymizationRule,
  TagRule,
  AnonymizationActionType,
  SensitivityLevel,
} from '@common/types/anonymization.types';
import { PatientSensitivityLevel, PatientState } from '@common/types/hl7.types';

@Injectable()
export class AnonymizationRuleEnhancer {
  private readonly logger = new Logger(AnonymizationRuleEnhancer.name);

  public enhanceRuleForPatient(
    baseRule: AnonymizationRule,
    patientState: PatientState | null,
  ): TagRule[] {
    const baseLevel = baseRule.baseSensitivityLevel || SensitivityLevel.NORMAL;
    const patientLevel = this.convertPatientSensitivityLevel(patientState?.sensitivityLevel);

    if (this.sensitivityLevelCompare(patientLevel, baseLevel) <= 0) {
      this.logger.debug(
        `Patient sensitivity level (${patientLevel}) <= base level (${baseLevel}), using base rules`,
      );
      return baseRule.tagRules;
    }

    const enhancedRules = new Map<string, TagRule>();

    for (const rule of baseRule.tagRules) {
      enhancedRules.set(rule.tagKey, { ...rule });
    }

    if (patientLevel === SensitivityLevel.HIGH) {
      this.applyHighSensitivityEnhancements(enhancedRules);
    } else if (patientLevel === SensitivityLevel.VERY_HIGH) {
      this.applyHighSensitivityEnhancements(enhancedRules);
      this.applyVeryHighSensitivityEnhancements(enhancedRules);
    } else if (patientLevel === SensitivityLevel.MAXIMUM) {
      this.applyHighSensitivityEnhancements(enhancedRules);
      this.applyVeryHighSensitivityEnhancements(enhancedRules);
      this.applyMaximumSensitivityEnhancements(enhancedRules);
    }

    const result = Array.from(enhancedRules.values());

    this.logger.log(
      `Enhanced anonymization rules: base=${baseLevel}, patient=${patientLevel}, ` +
        `tags=${result.length}, additional=${result.length - baseRule.tagRules.length}`,
    );

    return result;
  }

  private applyHighSensitivityEnhancements(rules: Map<string, TagRule>): void {
    this.ensureTagAction(rules, '0010,0010', AnonymizationActionType.REMOVE);
    this.ensureTagAction(rules, '0010,0020', AnonymizationActionType.HASH);
    this.ensureTagAction(rules, '0010,0030', AnonymizationActionType.SHIFT_DATE);
    this.ensureTagAction(rules, '0010,1010', AnonymizationActionType.REMOVE);
    this.ensureTagAction(rules, '0010,1040', AnonymizationActionType.REMOVE);
    this.ensureTagAction(rules, '0010,2150', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0010,2154', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0010,2160', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0010,4000', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0032,1032', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0032,1033', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0032,1060', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0032,4000', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0038,0300', AnonymizationActionType.REMOVE);
    this.ensureTagAction(rules, '0040,0275', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0040,2017', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0040,4000', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0040,4030', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0040,4037', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0040,4049', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0040,4050', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0040,4051', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0040,4052', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0040,4053', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0080,0120', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0080,012a', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0088,0130', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0088,0140', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0090', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0092', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0094', AnonymizationActionType.EMPTY);
  }

  private applyVeryHighSensitivityEnhancements(rules: Map<string, TagRule>): void {
    this.ensureTagAction(rules, '0008,0050', AnonymizationActionType.SHIFT_DATE);
    this.ensureTagAction(rules, '0008,0020', AnonymizationActionType.SHIFT_DATE);
    this.ensureTagAction(rules, '0008,0021', AnonymizationActionType.SHIFT_DATE);
    this.ensureTagAction(rules, '0008,0022', AnonymizationActionType.SHIFT_DATE);
    this.ensureTagAction(rules, '0008,0023', AnonymizationActionType.SHIFT_DATE);
    this.ensureTagAction(rules, '0008,0030', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0031', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0032', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0033', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,1030', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,103e', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,1040', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,1048', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,1050', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,1060', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,1070', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,1080', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,1110', AnonymizationActionType.REMOVE);
    this.ensureTagAction(rules, '0008,1111', AnonymizationActionType.REMOVE);
    this.ensureTagAction(rules, '0008,1120', AnonymizationActionType.REMOVE);
    this.ensureTagAction(rules, '0008,1121', AnonymizationActionType.REMOVE);
    this.ensureTagAction(rules, '0008,1125', AnonymizationActionType.REMOVE);
    this.ensureTagAction(rules, '0008,1126', AnonymizationActionType.REMOVE);
    this.ensureTagAction(rules, '0008,1140', AnonymizationActionType.REMOVE);
    this.ensureTagAction(rules, '0008,1141', AnonymizationActionType.REMOVE);
    this.ensureTagAction(rules, '0008,1142', AnonymizationActionType.REMOVE);
    this.ensureTagAction(rules, '0008,1145', AnonymizationActionType.REMOVE);
    this.ensureTagAction(rules, '0008,1146', AnonymizationActionType.REMOVE);
    this.ensureTagAction(rules, '0008,1147', AnonymizationActionType.REMOVE);
    this.ensureTagAction(rules, '0008,1150', AnonymizationActionType.REMOVE);
    this.ensureTagAction(rules, '0008,1151', AnonymizationActionType.REMOVE);
    this.ensureTagAction(rules, '0008,1152', AnonymizationActionType.REMOVE);
    this.ensureTagAction(rules, '0008,1155', AnonymizationActionType.REMOVE);
    this.ensureTagAction(rules, '0008,1156', AnonymizationActionType.REMOVE);
    this.ensureTagAction(rules, '0008,1250', AnonymizationActionType.REMOVE);
  }

  private applyMaximumSensitivityEnhancements(rules: Map<string, TagRule>): void {
    this.ensureTagAction(rules, '0008,0018', AnonymizationActionType.HASH);
    this.ensureTagAction(rules, '0020,000d', AnonymizationActionType.HASH);
    this.ensureTagAction(rules, '0020,000e', AnonymizationActionType.HASH);

    this.ensureTagAction(rules, '0008,0080', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0081', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0082', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0083', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0084', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0085', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0086', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0087', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0088', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0089', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0093', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0096', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0097', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0098', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0099', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0100', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0102', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0104', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0106', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0108', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0110', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0112', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0114', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0116', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0118', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0120', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0008,0201', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0010', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0020', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0021', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0022', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0023', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0024', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0025', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0026', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0027', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0028', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0029', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0030', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0040', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0050', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0060', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0070', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0080', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0090', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0100', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0110', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0120', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0125', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0130', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0140', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0150', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0160', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0170', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0180', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0190', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0200', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0210', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0220', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0230', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0240', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0250', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0260', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0270', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0280', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0290', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0300', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0310', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0320', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0330', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0340', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0350', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0360', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0370', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0380', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0390', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0400', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0410', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0420', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0430', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0440', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0450', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0460', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0470', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0480', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0490', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0500', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0510', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0520', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0530', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0540', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0550', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0560', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0570', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0580', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0590', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0600', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0610', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0620', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0630', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0640', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0650', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0660', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0670', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0680', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0690', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0700', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0710', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0720', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0730', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0740', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0750', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0760', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0770', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0780', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0790', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0800', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0810', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0820', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0830', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0840', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0850', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0860', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0870', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0880', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0890', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0900', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0910', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0920', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0930', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0940', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0950', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0960', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0970', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0980', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,0990', AnonymizationActionType.EMPTY);
    this.ensureTagAction(rules, '0018,1000', AnonymizationActionType.EMPTY);
  }

  private ensureTagAction(
    rules: Map<string, TagRule>,
    tagKey: string,
    action: AnonymizationActionType,
  ): void {
    if (rules.has(tagKey)) {
      const existing = rules.get(tagKey)!;
      if (this.isStrongerAction(action, existing.action)) {
        rules.set(tagKey, {
          ...existing,
          action,
        });
      }
    } else {
      rules.set(tagKey, {
        tagKey,
        action,
      });
    }
  }

  private isStrongerAction(
    newAction: AnonymizationActionType,
    existingAction: AnonymizationActionType,
  ): boolean {
    const actionStrength: Record<AnonymizationActionType, number> = {
      [AnonymizationActionType.KEEP]: 0,
      [AnonymizationActionType.MASK]: 1,
      [AnonymizationActionType.SHIFT_DATE]: 2,
      [AnonymizationActionType.REPLACE]: 3,
      [AnonymizationActionType.HASH]: 4,
      [AnonymizationActionType.EMPTY]: 5,
      [AnonymizationActionType.REMOVE]: 6,
    };

    return (actionStrength[newAction] || 0) > (actionStrength[existingAction] || 0);
  }

  private convertPatientSensitivityLevel(
    level?: PatientSensitivityLevel,
  ): SensitivityLevel {
    switch (level) {
      case PatientSensitivityLevel.NORMAL:
        return SensitivityLevel.NORMAL;
      case PatientSensitivityLevel.HIGH:
        return SensitivityLevel.HIGH;
      case PatientSensitivityLevel.VERY_HIGH:
        return SensitivityLevel.VERY_HIGH;
      case PatientSensitivityLevel.MAXIMUM:
        return SensitivityLevel.MAXIMUM;
      default:
        return SensitivityLevel.NORMAL;
    }
  }

  private sensitivityLevelCompare(
    level1: SensitivityLevel,
    level2: SensitivityLevel,
  ): number {
    const levelValue: Record<SensitivityLevel, number> = {
      [SensitivityLevel.NORMAL]: 0,
      [SensitivityLevel.HIGH]: 1,
      [SensitivityLevel.VERY_HIGH]: 2,
      [SensitivityLevel.MAXIMUM]: 3,
    };

    return (levelValue[level1] || 0) - (levelValue[level2] || 0);
  }
}
