import AgoraRTC from 'agora-rtc-sdk-ng';

class AgoraService {
  constructor() {
    this.client = null;
    this.remoteVideoTrack = null;
    this.remoteAudioTrack = null;
    this.isConnected = false;
  }

  /**
   * Initialize Agora client
   */
  initializeClient() {
    if (!this.client) {
      this.client = AgoraRTC.createClient({ 
        mode: 'live', 
        codec: 'vp8' 
      });

      // Set client role to audience (subscriber)
      this.client.setClientRole('audience');
    }
    return this.client;
  }

  /**
   * Join channel with token
   * @param {string} appId - Agora App ID
   * @param {string} channel - Channel name (unique ID)
   * @param {string} token - Agora token
   * @param {number} uid - User ID (optional)
   */
  async joinChannel(appId, channel, token, uid = null) {
    try {
      if (!this.client) {
        this.initializeClient();
      }

      // Join the channel
      await this.client.join(appId, channel, token, uid);
      this.isConnected = true;
      console.log('Successfully joined channel:', channel);
      
      return true;
    } catch (error) {
      console.error('Failed to join channel:', error);
      throw error;
    }
  }

  /**
   * Subscribe to remote user's tracks
   * @param {Function} onVideoTrack - Callback when video track is available
   * @param {Function} onAudioTrack - Callback when audio track is available
   */
  subscribeToRemoteUser(onVideoTrack, onAudioTrack) {
    this.client.on('user-published', async (user, mediaType) => {
      try {
        // Subscribe to the remote user
        await this.client.subscribe(user, mediaType);
        console.log('Subscribed to', user.uid, mediaType);

        if (mediaType === 'video') {
          this.remoteVideoTrack = user.videoTrack;
          if (onVideoTrack) {
            onVideoTrack(user.videoTrack);
          }
        }

        if (mediaType === 'audio') {
          this.remoteAudioTrack = user.audioTrack;
          // Auto-play audio
          user.audioTrack.play();
          if (onAudioTrack) {
            onAudioTrack(user.audioTrack);
          }
        }
      } catch (error) {
        console.error('Failed to subscribe to user:', error);
      }
    });

    this.client.on('user-unpublished', (user, mediaType) => {
      console.log('User unpublished:', user.uid, mediaType);
      if (mediaType === 'video') {
        this.remoteVideoTrack = null;
      }
      if (mediaType === 'audio') {
        this.remoteAudioTrack = null;
      }
    });

    this.client.on('user-left', (user) => {
      console.log('User left:', user.uid);
    });
  }

  /**
   * Play video track in a DOM element
   * @param {HTMLElement} element - DOM element to render video
   */
  playVideo(element) {
    if (this.remoteVideoTrack && element) {
      this.remoteVideoTrack.play(element);
    }
  }

  /**
   * Mute/unmute remote audio
   * @param {boolean} mute - True to mute, false to unmute
   */
  muteAudio(mute) {
    if (this.remoteAudioTrack) {
      if (mute) {
        this.remoteAudioTrack.setVolume(0);
      } else {
        this.remoteAudioTrack.setVolume(100);
      }
    }
  }

  /**
   * Leave channel and cleanup
   */
  async leaveChannel() {
    try {
      if (this.remoteVideoTrack) {
        this.remoteVideoTrack.stop();
        this.remoteVideoTrack = null;
      }

      if (this.remoteAudioTrack) {
        this.remoteAudioTrack.stop();
        this.remoteAudioTrack = null;
      }

      if (this.client && this.isConnected) {
        await this.client.leave();
        this.isConnected = false;
        console.log('Left channel successfully');
      }
    } catch (error) {
      console.error('Failed to leave channel:', error);
      throw error;
    }
  }

  /**
   * Get connection state
   */
  getConnectionState() {
    return this.client?.connectionState || 'DISCONNECTED';
  }
}

export default new AgoraService();
