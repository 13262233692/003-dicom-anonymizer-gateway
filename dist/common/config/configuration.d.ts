export interface DicomScpConfig {
    port: number;
    aeTitle: string;
    maxConnections: number;
    connectionTimeout: number;
    requestTimeout: number;
}
export interface RedisConfig {
    host: string;
    port: number;
    password?: string;
    db: number;
    keyPrefix: string;
}
export interface KafkaConfig {
    brokers: string[];
    clientId: string;
    groupId: string;
    auditTopic: string;
    sslEnabled: boolean;
    saslEnabled: boolean;
    saslMechanism?: string;
    saslUsername?: string;
    saslPassword?: string;
}
export interface PacsTargetConfig {
    host: string;
    port: number;
    aeTitle: string;
}
export interface AppConfig {
    nodeEnv: string;
    port: number;
    logLevel: string;
    dicomScp: DicomScpConfig;
    redis: RedisConfig;
    kafka: KafkaConfig;
    defaultPacs: PacsTargetConfig;
}
declare const _default: (() => AppConfig) & import("@nestjs/config").ConfigFactoryKeyHost<AppConfig>;
export default _default;
