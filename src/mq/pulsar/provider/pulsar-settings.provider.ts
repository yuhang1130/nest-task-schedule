import { ConfigService } from "@nestjs/config";
import { ConfigType } from "../../../config";
import { PulsarSettings } from "../struct/pulsar.struct";

export const PULSAR_OPTIONS = Symbol('PULSAR_OPTIONS');

export const PulsarSettingsProvider = {
  inject: [ConfigService],
  provide: PULSAR_OPTIONS,
  useFactory: async (config: ConfigService<ConfigType>): Promise<PulsarSettings> => {
    const pulsarConfig = config.get('pulsar');
    const settings: PulsarSettings = {
      ...pulsarConfig
    }
    return settings;
  }
}