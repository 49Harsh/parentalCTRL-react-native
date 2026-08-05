import {PermissionsAndroid, Platform} from 'react-native';

/**
 * Request all required permissions for the app
 * @returns {Promise<boolean>} True if all permissions granted
 */
export const requestPermissions = async () => {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    const permissions = [
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ];

    // Request Android 13+ notification permission if available
    if (Platform.Version >= 33) {
      permissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }

    const results = await PermissionsAndroid.requestMultiple(permissions);

    const allGranted = Object.values(results).every(
      result => result === PermissionsAndroid.RESULTS.GRANTED,
    );

    if (allGranted) {
      console.log('All permissions granted');
      return true;
    } else {
      console.log('Some permissions denied:', results);
      return false;
    }
  } catch (error) {
    console.error('Error requesting permissions:', error);
    return false;
  }
};

/**
 * Check if all required permissions are granted
 * @returns {Promise<boolean>} True if all permissions granted
 */
export const checkPermissions = async () => {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    const cameraGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.CAMERA,
    );

    const audioGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );

    return cameraGranted && audioGranted;
  } catch (error) {
    console.error('Error checking permissions:', error);
    return false;
  }
};

/**
 * Request camera permission only
 * @returns {Promise<boolean>}
 */
export const requestCameraPermission = async () => {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: 'Camera Permission',
        message: 'This app needs access to your camera for monitoring',
        buttonPositive: 'OK',
        buttonNegative: 'Cancel',
      },
    );

    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.error('Error requesting camera permission:', error);
    return false;
  }
};

/**
 * Request microphone permission only
 * @returns {Promise<boolean>}
 */
export const requestMicrophonePermission = async () => {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message: 'This app needs access to your microphone for monitoring',
        buttonPositive: 'OK',
        buttonNegative: 'Cancel',
      },
    );

    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.error('Error requesting microphone permission:', error);
    return false;
  }
};
