import {NativeModules} from 'react-native';

const {ParentalControl} = NativeModules;

class RemoteControlService {
  async isAccessibilityEnabled() {
    return ParentalControl.isAccessibilityServiceEnabled();
  }

  async openAccessibilitySettings() {
    return ParentalControl.openAccessibilitySettings();
  }

  async tap(x, y) {
    return ParentalControl.performRemoteTouch(x, y);
  }

  async swipe(x1, y1, x2, y2, durationMs = 300) {
    return ParentalControl.performRemoteSwipe(x1, y1, x2, y2, durationMs);
  }

  async longPress(x, y, durationMs = 500) {
    return ParentalControl.performRemoteLongPress(x, y, durationMs);
  }

  async pressHome() {
    return ParentalControl.performGlobalAction(2); // GLOBAL_ACTION_HOME
  }

  async pressBack() {
    return ParentalControl.performGlobalAction(1); // GLOBAL_ACTION_BACK
  }

  async pressRecents() {
    return ParentalControl.performGlobalAction(3); // GLOBAL_ACTION_RECENTS
  }

  async openNotifications() {
    return ParentalControl.performGlobalAction(4); // GLOBAL_ACTION_NOTIFICATIONS
  }

  async openQuickSettings() {
    return ParentalControl.performGlobalAction(5); // GLOBAL_ACTION_QUICK_SETTINGS
  }
}

export default new RemoteControlService();
