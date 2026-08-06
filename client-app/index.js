/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendHeartbeat } from './src/services/api';

const BackgroundSyncTask = async () => {
  try {
    const deviceId = await AsyncStorage.getItem('deviceId');
    if (deviceId) {
      await sendHeartbeat(deviceId, { appVersion: '0.0.1', isHeadless: true });
    }
  } catch (err) {
    console.warn('Headless sync error:', err);
  }
};

AppRegistry.registerHeadlessTask('BackgroundSyncTask', () => BackgroundSyncTask);
AppRegistry.registerComponent(appName, () => App);
