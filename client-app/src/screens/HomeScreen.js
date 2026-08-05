import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import agoraService from '../services/agoraService';
import {getClientToken} from '../services/api';
import {RtcSurfaceView, VideoSourceType} from 'react-native-agora';

const HomeScreen = ({navigation}) => {
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [uniqueId, setUniqueId] = useState('');
  const [streaming, setStreaming] = useState(false);

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
  }, [uniqueId]);

  const handleAppStateChange = nextAppState => {
    if (nextAppState === 'active' && uniqueId && !streaming) {
      // Restart streaming when app comes to foreground
      startStreaming();
    }
  };

  const loadUserData = async () => {
    try {
      const name = await AsyncStorage.getItem('userName');
      const id = await AsyncStorage.getItem('uniqueId');

      if (!name || !id) {
        // No user data, redirect to sign up
        navigation.replace('SignUp');
        return;
      }

      setUserName(name);
      setUniqueId(id);
      setLoading(false);

      // Start streaming after loading data
      await startStreaming(id);
    } catch (error) {
      console.error('Error loading user data:', error);
      Alert.alert('Error', 'Failed to load user data');
      setLoading(false);
    }
  };

  const startStreaming = async (id = uniqueId) => {
    try {
      console.log('Starting stream for:', id);

      // Get Agora token from backend
      const tokenData = await getClientToken(id);

      if (!tokenData.success) {
        throw new Error('Failed to get streaming token');
      }

      // Initialize Agora
      await agoraService.initialize();

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
        'Failed to start streaming. Please check your connection.',
      );
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
      {/* Hidden camera preview - still streaming but minimized */}
      <View style={styles.hiddenPreview}>
        <RtcSurfaceView
          canvas={{
            uid: 0,
            sourceType: VideoSourceType.VideoSourceCameraPrimary,
          }}
          style={styles.previewVideo}
        />
      </View>

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
              {streaming ? 'Monitoring Active' : 'Connecting...'}
            </Text>
          </View>

          <Text style={styles.infoText}>
            This device is being monitored. The unique ID above is required for
            remote access.
          </Text>
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
  infoText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },
});

export default HomeScreen;
