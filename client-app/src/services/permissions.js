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
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ];

    // Call-log / phone-state permissions are dangerous-level and must be
    // granted at runtime for call monitoring to work.
    if (PermissionsAndroid.PERMISSIONS.READ_CALL_LOG) {
      permissions.push(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG);
    }
    if (PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE) {
      permissions.push(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE);
    }
    if (PermissionsAndroid.PERMISSIONS.READ_CONTACTS) {
      permissions.push(PermissionsAndroid.PERMISSIONS.READ_CONTACTS);
    }

    // Request Android 13+ notification permission if available
    if (Platform.Version >= 33) {
      permissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }

    const results = await PermissionsAndroid.requestMultiple(permissions);

    // Android 11+ auto-denies background location if requested together with
    // fine location — it must be a separate follow-up request.
    if (Platform.Version >= 30 && PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION) {
      try {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
          {
            title: 'Background Location',
            message:
              'Allow location access "All the time" so the device location stays available to the admin even when this app is closed.',
            buttonPositive: 'OK',
            buttonNegative: 'Not now',
          },
        );
      } catch (bgErr) {
        console.warn('Background location request skipped:', bgErr);
      }
    }

    // Location & call logs are optional add-ons — treat camera/mic as the
    // core requirement and never hard-fail because of the new ones.
    const coreGranted =
      results[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED &&
      results[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;

    if (coreGranted) {
      console.log('Core permissions granted');
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
 * Show Alert and open Android Settings if permissions are denied
 */
export const promptOpenSettings = (
  title = 'Permissions Required',
  message = 'Camera and Microphone permissions are required for background streaming. Please tap "Open Settings" and select "Allow" for Camera and Microphone.',
) => {
  const {Alert, Linking} = require('react-native');
  Alert.alert(
    title,
    message,
    [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Open Settings', onPress: () => Linking.openSettings()},
    ],
  );
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
