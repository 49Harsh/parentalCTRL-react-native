import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import remoteControl from '../services/remoteControl';

const AccessibilitySetupScreen = ({navigation}) => {
  const [accessibilityEnabled, setAccessibilityEnabled] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkAccessibilityStatus();
  }, []);

  const checkAccessibilityStatus = async () => {
    try {
      const enabled = await remoteControl.isAccessibilityEnabled();
      setAccessibilityEnabled(enabled);
    } catch (error) {
      console.error('Failed to check accessibility status:', error);
    } finally {
      setChecking(false);
    }
  };

  const handleOpenSettings = async () => {
    try {
      await remoteControl.openAccessibilitySettings();
      // Re-check after returning from settings
      setTimeout(checkAccessibilityStatus, 1000);
    } catch (error) {
      Alert.alert('Error', 'Failed to open accessibility settings');
    }
  };

  const handleContinue = () => {
    if (accessibilityEnabled) {
      navigation.navigate('Home');
    } else {
      Alert.alert(
        'Accessibility Required',
        'Please enable the accessibility service to continue.',
      );
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Remote Control Setup</Text>
        <Text style={styles.subtitle}>
          Enable accessibility service to allow remote control of this device
        </Text>

        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Accessibility Service</Text>
            <View
              style={[
                styles.statusBadge,
                accessibilityEnabled ? styles.statusEnabled : styles.statusDisabled,
              ]}>
              <Text style={styles.statusText}>
                {accessibilityEnabled ? 'Enabled' : 'Disabled'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>What this enables:</Text>
          <Text style={styles.infoText}>
            • Parents can view your screen remotely{'\n'}
            • Parents can tap and swipe on your behalf{'\n'}
            • All actions are visible and logged{'\n'}
            • You can revoke access anytime
          </Text>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleOpenSettings}>
          <Text style={styles.primaryButtonText}>
            Open Accessibility Settings
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.secondaryButton,
            !accessibilityEnabled && styles.secondaryButtonDisabled,
          ]}
          onPress={handleContinue}
          disabled={!accessibilityEnabled}>
          <Text
            style={[
              styles.secondaryButtonText,
              !accessibilityEnabled && styles.secondaryButtonTextDisabled,
            ]}>
            Continue
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={checkAccessibilityStatus}>
          <Text style={styles.refreshButtonText}>Refresh Status</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 32,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusEnabled: {
    backgroundColor: '#D1FAE5',
  },
  statusDisabled: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#3B82F6',
    lineHeight: 22,
  },
  primaryButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#4F46E5',
    marginBottom: 16,
  },
  secondaryButtonDisabled: {
    borderColor: '#CBD5E1',
  },
  secondaryButtonText: {
    color: '#4F46E5',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonTextDisabled: {
    color: '#94A3B8',
  },
  refreshButton: {
    alignItems: 'center',
    padding: 12,
  },
  refreshButtonText: {
    color: '#64748B',
    fontSize: 14,
  },
});

export default AccessibilitySetupScreen;
