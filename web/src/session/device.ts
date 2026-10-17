// Settings that belong to this phone, not to the account: a phone without a
// vibration motor or a tablet on a gym stand wants different answers than the same
// person's other device. So they live in localStorage, not on the server.

export interface DeviceSettings {
  sound: boolean;
  vibration: boolean;
  keepAwake: boolean;
}

const KEY = "deviceSettings";
export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = { sound: true, vibration: true, keepAwake: true };

export function readDeviceSettings(): DeviceSettings {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    const stored = typeof parsed === "object" && parsed !== null ? (parsed as Partial<DeviceSettings>) : {};
    return {
      sound: typeof stored.sound === "boolean" ? stored.sound : DEFAULT_DEVICE_SETTINGS.sound,
      vibration: typeof stored.vibration === "boolean" ? stored.vibration : DEFAULT_DEVICE_SETTINGS.vibration,
      keepAwake: typeof stored.keepAwake === "boolean" ? stored.keepAwake : DEFAULT_DEVICE_SETTINGS.keepAwake,
    };
  } catch {
    return DEFAULT_DEVICE_SETTINGS;
  }
}

export function writeDeviceSettings(settings: DeviceSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Blocked storage: the setting just won't stick.
  }
}
