import {NativeModules, Platform} from 'react-native';

const native = NativeModules.ParentalControl;

const unavailable = () => Promise.resolve(false);

export const getNativeSetupStatus = () =>
  Platform.OS === 'android' && native
    ? native.getSetupStatus()
    : Promise.resolve({
        notificationAccess: false,
        batteryOptimized: false,
        monitoringServiceEnabled: false,
        notificationsEnabled: true,
      });

export const openNotificationAccessSettings =
  Platform.OS === 'android' && native
    ? () => native.openNotificationAccessSettings()
    : unavailable;

export const openBatteryOptimizationSettings =
  Platform.OS === 'android' && native
    ? () => native.openBatteryOptimizationSettings()
    : unavailable;

export const startMonitoringService =
  Platform.OS === 'android' && native
    ? () => native.startMonitoringService()
    : unavailable;

export const stopMonitoringService =
  Platform.OS === 'android' && native
    ? () => native.stopMonitoringService()
    : unavailable;

/**
 * Start the native background command service with credentials.
 * This enables heartbeat polling, screen capture commands, and native
 * Agora camera/mic streaming — all running natively without needing
 * the JS thread active.
 */
export const startBackgroundCommands =
  Platform.OS === 'android' && native?.startBackgroundCommands
    ? (baseUrl, deviceId, token) => native.startBackgroundCommands(baseUrl, deviceId, token)
    : unavailable;

/** Push updated credentials to the running MonitoringService. */
export const updateBackgroundConfig =
  Platform.OS === 'android' && native?.updateBackgroundConfig
    ? (baseUrl, deviceId, token) => native.updateBackgroundConfig(baseUrl, deviceId, token)
    : unavailable;

/** Check whether native Agora camera/mic streaming is active. */
export const isNativeStreaming =
  Platform.OS === 'android' && native?.isNativeStreaming
    ? () => native.isNativeStreaming()
    : () => Promise.resolve(false);

export const requestScreenCapture =
  Platform.OS === 'android' && native
    ? () => native.requestScreenCapture()
    : unavailable;

export const isScreenCaptureActive =
  Platform.OS === 'android' && native
    ? () => native.isScreenCaptureActive()
    : unavailable;

export const isAccessibilityServiceEnabled =
  Platform.OS === 'android' && native
    ? () => native.isAccessibilityServiceEnabled()
    : unavailable;

export const openAccessibilitySettings =
  Platform.OS === 'android' && native
    ? () => native.openAccessibilitySettings()
    : unavailable;
