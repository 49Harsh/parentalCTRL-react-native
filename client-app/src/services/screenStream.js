import {DeviceEventEmitter, NativeModules} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

const ParentalControl = NativeModules.ParentalControl;
const FRAME_EVENT = 'ScreenFrameStream';

class ScreenStreamService {
  constructor() {
    this.subscription = null;
    this.running = false;
  }

  isRunning() {
    return this.running;
  }

  async start(deviceId, fps = 12) {
    if (this.running) {
      console.log('ScreenStream: already running');
      return true;
    }
    if (!ParentalControl) {
      console.warn('ScreenStream: NativeModules.ParentalControl is undefined');
      return false;
    }
    if (typeof ParentalControl.startScreenFrameStream !== 'function') {
      console.warn('ScreenStream: startScreenFrameStream method not found. Was the app rebuilt with the latest native code?');
      return false;
    }
    const token = await AsyncStorage.getItem('authToken');
    if (!token) {
      console.warn('ScreenStream: no auth token stored');
      return false;
    }

    this.running = true;
    this.subscription = DeviceEventEmitter.addListener(FRAME_EVENT, this.handleEvent);
    try {
      // Frames are captured AND uploaded natively (OkHttp) — the JS side only
      // passes the backend URL, device id and token, and receives log events.
      await ParentalControl.startScreenFrameStream(fps, api.defaults.baseURL, deviceId, token);
      console.log('ScreenStream: capture loop requested at', fps, 'fps →', api.defaults.baseURL);
      return true;
    } catch (error) {
      console.warn('ScreenStream: start failed:', error?.message || error);
      await this.stop();
      return false;
    }
  }

  handleEvent = payload => {
    if (!payload) return;
    if (payload.event === 'log') {
      console.log('ScreenStream:', payload.message);
    } else if (payload.event === 'stopped') {
      console.warn('ScreenStream: stopped:', payload.message);
      this.running = false;
    }
  };

  async stop() {
    this.running = false;
    this.subscription?.remove();
    this.subscription = null;
    try {
      await ParentalControl?.stopScreenFrameStream();
    } catch (error) {
      // Ignore — the native loop may already be stopped.
    }
  }
}

export default new ScreenStreamService();
