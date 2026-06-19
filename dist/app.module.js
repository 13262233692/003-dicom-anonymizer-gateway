"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const terminus_1 = require("@nestjs/terminus");
const common_module_1 = require("./common/common.module");
const dicom_module_1 = require("./dicom/dicom.module");
const protocol_module_1 = require("./protocol/protocol.module");
const redis_module_1 = require("./redis/redis.module");
const redis_rule_service_1 = require("./redis/redis-rule.service");
const anonymization_module_1 = require("./anonymization/anonymization.module");
const routing_module_1 = require("./routing/routing.module");
const audit_module_1 = require("./audit/audit.module");
const gateway_coordinator_service_1 = require("./gateway-coordinator.service");
const health_controller_1 = require("./health.controller");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            common_module_1.CommonModule,
            dicom_module_1.DicomModule,
            protocol_module_1.ProtocolModule,
            redis_module_1.RedisModule,
            anonymization_module_1.AnonymizationModule,
            routing_module_1.RoutingModule,
            audit_module_1.AuditModule,
            terminus_1.TerminusModule,
        ],
        controllers: [health_controller_1.HealthController],
        providers: [gateway_coordinator_service_1.GatewayCoordinator, redis_rule_service_1.RedisRuleService],
        exports: [redis_rule_service_1.RedisRuleService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map