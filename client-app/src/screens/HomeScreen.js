import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  AppState,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
  DeviceEventEmitter,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import remoteControl from '../services/remoteControl';
import {sendHeartbeat} from '../services/api';
import api from '../services/api';
import {checkPermissions, promptOpenSettings, requestPermissions} from '../services/permissions';
import {
  isAccessibilityServiceEnabled,
  openAccessibilitySettings,
  startBackgroundCommands,
  updateBackgroundConfig,
  isNativeStreaming,
  startMonitoringService,
} from '../services/nativeMonitoring';

const HomeScreen = ({navigation}) => {
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [uniqueId, setUniqueId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [liveRequest, setLiveRequest] = useState(null);
  const [policyMessage, setPolicyMessage] = useState('Waiting for parent commands.');
  const [serviceActive, setServiceActive] = useState(false);
  const [accessibilityOn, setAccessibilityOn] = useState(null);

  const refreshAccessibilityStatus = async () => {
    try {
      const enabled = await isAccessibilityServiceEnabled();
      setAccessibilityOn(enabled);
    } catch (err) {
      console.warn('Accessibility status check failed:', err);
    }
  };

  const promptEnableAccessibility = () => {
    Alert.alert(
      'Accessibility Service Required',
      'See Screen and Remote Control need the "FamilyGuard remote control" accessibility service.\n\nIf Android shows "Restricted setting": open Settings → Apps → FamilyGuard → ⋮ menu → "Allow restricted settings" first, then enable it under Settings → Accessibility.',
      [
        {text: 'Open Accessibility Settings', onPress: openAccessibilitySettings},
        {text: 'Cancel', style: 'cancel'},
      ],
    );
  };

  /**
   * Start the native background command service.
   * This enables:
   *   - Native heartbeat polling (works even when the app is closed / locked)
   *   - Auto-processing SCREEN_STREAM_START / STOP commands
   *   - Auto-starting Agora camera + mic when admin requests a live session
   */
  const handleEnableBackgroundService = async () => {
    try {
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
      await requestPermissions();

      const token = await AsyncStorage.getItem('authToken');
      if (!token || !deviceId) {
        Alert.alert('Notice', 'Please log in first.');
        return;
      }

      // Start native background service with full credentials
      await startBackgroundCommands(api.defaults.baseURL, deviceId, token);
      setServiceActive(true);

      Alert.alert(
        'Background Protection Active 🛡️',
        'Camera, microphone, and screen monitoring are now always available from the admin app — even when this app is closed or the screen is locked.',
      );
    } catch (err) {
      console.warn('Failed to start background command service:', err);
      Alert.alert('Notice', 'Please allow Camera, Microphone, and Notification permissions in Android Settings.');
    }
  };

  useEffect(() => {
    loadUserData();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [uniqueId]);

  /**
   * JS-side heartbeat — runs while the app is in the foreground to keep the
   * UI up to date. When the native background service is active, commands are
   * already handled natively; the JS heartbeat is only for display status.
   */
  useEffect(() => {
    if (!deviceId) return undefined;

    const checkForLiveRequest = async () => {
      try {
        const sync = await sendHeartbeat(deviceId, {appVersion: '0.0.1'});
        const request = sync.commands?.find(command => command.type === 'LIVE_SESSION_REQUEST') || sync.activeLiveRequest;

        setLiveRequest(request || null);
        setPolicyMessage(
          request
            ? 'Parent monitoring session active.'
            : 'Waiting for parent commands.',
        );

        // Check if native service is already handling streaming.
        const nativeActive = await isNativeStreaming();
        setStreaming(nativeActive || !!request);

        // Handle only remote-touch / remote-action commands here.
        // SCREEN_STREAM and LIVE_SESSION are processed by the native service.
        const remoteCommands = sync.commands?.filter(cmd =>
          ['REMOTE_TOUCH', 'REMOTE_ACTION'].includes(cmd.type) && cmd.status === 'pending'
        ) || [];

        for (const cmd of remoteCommands) {
          await handleRemoteCommand(cmd);
        }
      } catch (syncError) {
        console.warn('Heartbeat failed:', syncError?.message || syncError?.response?.status || syncError);
      }
    };

    checkForLiveRequest();
    refreshAccessibilityStatus();
    const interval = setInterval(checkForLiveRequest, 5000);
    return () => clearInterval(interval);
  }, [deviceId]);

  /**
   * Listen for events from the native MonitoringService so the UI reflects
   * the real state even when the JS heartbeat hasn't fired yet.
   */
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('BackgroundCommand', payload => {
      if (!payload) return;
      switch (payload.event) {
        case 'agora_started':
          setStreaming(true);
          setPolicyMessage('Camera & mic streaming to admin.');
          break;
        case 'agora_stopped':
          setStreaming(false);
          setPolicyMessage('Waiting for parent commands.');
          break;
        case 'screen_stream_started':
          setPolicyMessage('Screen monitoring active.');
          break;
        case 'screen_stream_stopped':
          setPolicyMessage('Waiting for parent commands.');
          break;
        case 'agora_error':
          console.warn('Native Agora error:', payload.code);
          break;
        case 'accessibility_off':
          setAccessibilityOn(false);
          setPolicyMessage('Screen monitoring blocked: Accessibility service is OFF.');
          break;
        default:
          break;
      }
    });
    return () => sub.remove();
  }, []);

  const handleAppStateChange = nextAppState => {
    console.log('App state changed to:', nextAppState);
    if (nextAppState === 'active') {
      refreshAccessibilityStatus();
      // Push current credentials to the native service in case they changed.
      if (serviceActive && deviceId) {
        AsyncStorage.getItem('authToken').then(token => {
          if (token) updateBackgroundConfig(api.defaults.baseURL, deviceId, token);
        });
      }
    }
  };

  const loadUserData = async () => {
    try {
      const name = await AsyncStorage.getItem('userName');
      const id = await AsyncStorage.getItem('uniqueId');
      const storedDeviceId = await AsyncStorage.getItem('deviceId');

      if (!name || !id || !storedDeviceId) {
        navigation.replace('SignUp');
        return;
      }

      setUserName(name);
      setUniqueId(id);
      setDeviceId(storedDeviceId);
      setLoading(false);

      // Auto-start the native background service so monitoring works even if
      // the user never taps the button — heartbeat, screen stream and Agora
      // camera/mic are all handled natively once this is running.
      try {
        const token = await AsyncStorage.getItem('authToken');
        if (token) {
          await startBackgroundCommands(api.defaults.baseURL, storedDeviceId, token);
          setServiceActive(true);
        }
      } catch (err) {
        console.warn('Auto-start background service failed:', err);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
      Alert.alert('Error', 'Failed to load user data');
      setLoading(false);
    }
  };

  const handleRemoteCommand = async (command) => {
    try {
      const {type, payload} = command;

      const accEnabled = await isAccessibilityServiceEnabled();
      if (!accEnabled) {
        console.warn('Remote command received, but Accessibility service is not enabled.');
        return;
      }

      if (type === 'REMOTE_TOUCH') {
        const {x, y, type: touchType} = payload;
        if (touchType === 'tap') {
          await remoteControl.tap(x, y);
        } else if (touchType === 'longPress') {
          await remoteControl.longPress(x, y);
        }
      } else if (type === 'REMOTE_ACTION') {
        const {action} = payload;
        switch (action) {
          case 'home':
            await remoteControl.pressHome();
            break;
          case 'back':
            await remoteControl.pressBack();
            break;
          case 'recents':
            await remoteControl.pressRecents();
            break;
          case 'notifications':
            await remoteControl.openNotifications();
            break;
        }
      }

      // Mark command as executed
      await sendHeartbeat(deviceId, {
        lastCommandId: command._id,
        lastCommandStatus: 'executed',
      });
    } catch (error) {
      console.warn('Failed to execute remote command:', error?.message || error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Parental Control Active</Text>

          <View style={styles.infoSection}>
            <Text style={styles.label}>Account Name</Text>
            <Text style={styles.value}>{userName}</Text>
          </View>

          <View style={styles.infoSection}>
            <Text style={styles.label}>Unique ID</Text>
            <View style={styles.uniqueIdContainer}>
              <Text style={styles.uniqueIdValue}>{uniqueId}</Text>
            </View>
          </View>

          <View style={styles.statusSection}>
            <View
              style={[
                styles.statusIndicator,
                streaming && styles.statusIndicatorActive,
              ]}
            />
            <Text style={styles.statusText}>
              {streaming
                ? 'Monitoring Active'
                : 'Waiting for commands'}
            </Text>
          </View>

          <Text style={styles.infoText}>{policyMessage}</Text>

          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() =>
              promptOpenSettings(
                'Camera & Microphone Permissions',
                'Tap "Open Settings" below, go to Permissions, and set Camera and Microphone to "Allow" so background monitoring works permanently.',
              )
            }>
            <Text style={styles.settingsButtonText}>Grant permanent permissions in Settings ⚙️</Text>
          </TouchableOpacity>

          {/* Accessibility service status */}
          {accessibilityOn === false && (
            <TouchableOpacity style={styles.accWarnButton} onPress={promptEnableAccessibility}>
              <Text style={styles.accWarnButtonText}>
                ⚠️ Accessibility OFF — tap to enable "FamilyGuard remote control"
              </Text>
            </TouchableOpacity>
          )}
          {accessibilityOn && (
            <Text style={styles.accOkText}>✅ Accessibility service active (See Screen ready)</Text>
          )}

          {/* Background Protection — the main button */}
          <TouchableOpacity
            style={[styles.bgServiceButton, serviceActive && styles.bgServiceButtonActive]}
            onPress={handleEnableBackgroundService}>
            <Text style={styles.bgServiceButtonText}>
              {serviceActive
                ? '🟢 Background Protection active — admin can access anytime'
                : '🔔 Enable Background Protection (always-on access)'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.policyText}>Once Background Protection is enabled, the admin can access camera, microphone, and screen monitoring at any time — even when this app is closed. No approval needed per session.</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 24,
    textAlign: 'center',
  },
  infoSection: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    fontWeight: '500',
  },
  value: {
    fontSize: 18,
    color: '#333',
    fontWeight: '600',
  },
  uniqueIdContainer: {
    backgroundColor: '#f0f0f0',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#4F46E5',
  },
  uniqueIdValue: {
    fontSize: 24,
    color: '#4F46E5',
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 2,
    fontFamily: 'monospace',
  },
  statusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 16,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFC107',
    marginRight: 8,
  },
  statusIndicatorActive: {
    backgroundColor: '#4CAF50',
  },
  statusText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  infoText: {fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20, marginTop: 8},
  settingsButton: {borderWidth: 1, borderColor: '#4F46E5', borderRadius: 12, padding: 12, marginTop: 10},
  settingsButtonText: {color: '#4F46E5', textAlign: 'center', fontWeight: '600'},
  bgServiceButton: {backgroundColor: '#059669', borderRadius: 12, padding: 14, marginTop: 16, alignItems: 'center'},
  bgServiceButtonActive: {backgroundColor: '#10B981'},
  bgServiceButtonText: {color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center'},
  accWarnButton: {backgroundColor: '#DC2626', borderRadius: 12, padding: 14, marginTop: 10, alignItems: 'center'},
  accWarnButtonText: {color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center'},
  accOkText: {color: '#059669', fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 10},
  policyText: {fontSize: 12, color: '#777', textAlign: 'center', lineHeight: 17, marginTop: 16},
});

export default HomeScreen;
