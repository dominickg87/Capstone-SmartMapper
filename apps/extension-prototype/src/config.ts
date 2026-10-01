export interface ExtensionConfig {
  backendOrigin: string;
  miaOrigin: string;
  carrierOrigins: string[];
  allowAnyCarrier: boolean;
  sourceFormat: 'pdf' | 'questions';
}
declare const __SMARTMAPPER_CONFIG__: ExtensionConfig;
export const config = __SMARTMAPPER_CONFIG__;
