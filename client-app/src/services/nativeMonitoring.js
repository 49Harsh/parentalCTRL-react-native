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

export const requestScreenCapture =
  Platform.OS === 'android' && native
    ? () => native.requestScreenCapture()
    : unavailable;
