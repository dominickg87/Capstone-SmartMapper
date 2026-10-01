export interface ExtensionConfig {
  backendOrigin: string;
  miaOrigin: string;
  carrierOrigins: string[];
}
declare const __SMARTMAPPER_CONFIG__: ExtensionConfig;
export const config = __SMARTMAPPER_CONFIG__;
