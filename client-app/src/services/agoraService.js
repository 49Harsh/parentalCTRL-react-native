import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  VideoSourceType,
} from 'react-native-agora';

const AGORA_APP_ID = '809b73c2abfe452e853f59e9c6b375c2';

class AgoraService {
  constructor() {
    this.engine = null;
    this.isInitialized = false;
    this.isInChannel = false;
  }

  /**
   * Initialize Agora RTC Engine
   */
  async initialize() {
    try {
      if (this.isInitialized) {
        console.log('Agora already initialized');
        return;
      }

      // Create engine instance
      this.engine = createAgoraRtcEngine();

      // Initialize the engine
      this.engine.initialize({
        appId: AGORA_APP_ID,
        channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
      });

      // Set client role to broadcaster
      this.engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);

      // Enable video module
      this.engine.enableVideo();

      // Enable audio module
      this.engine.enableAudio();

      // Set video configuration
      this.engine.setVideoEncoderConfiguration({
        dimensions: {width: 640, height: 480},
        frameRate: 15,
        bitrate: 0, // Standard bitrate mode
        minBitrate: -1,
        orientationMode: 0,
        degradationPreference: 0,
        mirrorMode: 0,
      });

      // Set audio profile
      this.engine.setAudioProfile(1, 1); // Music Standard, Mono

      // Enable audio echo cancellation
      this.engine.setAudioScenario(3); // Game streaming

      this.isInitialized = true;
      console.log('Agora engine initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Agora:', error);
      throw error;
    }
  }

  /**
   * Join channel with unique ID
   * @param {string} channelName - Channel name (unique ID)
   * @param {string} token - Agora token
   */
  async joinChannel(channelName, token) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (this.isInChannel) {
        console.log('Already in channel');
        return;
      }

      // Start preview (optional, remove if you don't want preview)
      this.engine.startPreview();

      // Join channel
      await this.engine.joinChannel(token, channelName, 0, {
        clientRoleType: ClientRoleType.ClientRoleBroadcaster,
      });

      this.isInChannel = true;
      console.log(`Joined channel: ${channelName}`);
    } catch (error) {
      console.error('Failed to join channel:', error);
      throw error;
    }
  }

  /**
   * Leave channel and cleanup
   */
  async leaveChannel() {
    try {
      if (!this.isInChannel) {
        return;
      }

      // Stop preview
      this.engine.stopPreview();

      // Leave channel
      await this.engine.leaveChannel();

      this.isInChannel = false;
      console.log('Left channel successfully');
    } catch (error) {
      console.error('Failed to leave channel:', error);
      throw error;
    }
  }

  /**
   * Switch camera (front/back)
   */
  switchCamera() {
    try {
      this.engine.switchCamera();
      console.log('Camera switched');
    } catch (error) {
      console.error('Failed to switch camera:', error);
    }
  }

  /**
   * Mute/unmute local audio
   * @param {boolean} mute - True to mute, false to unmute
   */
  muteLocalAudio(mute) {
    try {
      this.engine.muteLocalAudioStream(mute);
      console.log(`Audio ${mute ? 'muted' : 'unmuted'}`);
    } catch (error) {
      console.error('Failed to mute audio:', error);
    }
  }

  /**
   * Enable/disable local video
   * @param {boolean} enable - True to enable, false to disable
   */
  enableLocalVideo(enable) {
    try {
      this.engine.enableLocalVideo(enable);
      console.log(`Video ${enable ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Failed to enable video:', error);
    }
  }

  /**
   * Destroy engine and release resources
   */
  destroy() {
    try {
      if (this.isInChannel) {
        this.leaveChannel();
      }

      if (this.engine) {
        this.engine.release();
        this.engine = null;
        this.isInitialized = false;
        console.log('Agora engine destroyed');
      }
    } catch (error) {
      console.error('Failed to destroy engine:', error);
    }
  }

  /**
   * Register event handlers
   * @param {object} handlers - Event handlers
   */
  registerEventHandlers(handlers) {
    if (!this.engine) {
      console.error('Engine not initialized');
      return;
    }

    this.engine.registerEventHandler({
      onJoinChannelSuccess: (connection, elapsed) => {
        console.log('Successfully joined channel');
        handlers.onJoinChannelSuccess?.(connection, elapsed);
      },
      onLeaveChannel: stats => {
        console.log('Left channel');
        handlers.onLeaveChannel?.(stats);
      },
      onUserJoined: (connection, remoteUid, elapsed) => {
        console.log(`Remote user joined: ${remoteUid}`);
        handlers.onUserJoined?.(connection, remoteUid, elapsed);
      },
      onUserOffline: (connection, remoteUid, reason) => {
        console.log(`Remote user offline: ${remoteUid}`);
        handlers.onUserOffline?.(connection, remoteUid, reason);
      },
      onError: (err, msg) => {
        console.error('Agora error:', err, msg);
        handlers.onError?.(err, msg);
      },
      onConnectionStateChanged: (connection, state, reason) => {
        console.log('Connection state changed:', state, reason);
        handlers.onConnectionStateChanged?.(connection, state, reason);
      },
    });
  }
}

export default new AgoraService();
