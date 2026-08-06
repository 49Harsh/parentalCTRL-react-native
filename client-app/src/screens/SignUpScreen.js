import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {enrollDevice, register, login, listDevices} from '../services/api';

const SignUpScreen = ({navigation}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(false);

  const validateEmail = value => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(value);
  };

  const handleAuth = async () => {
    // Validation
    if (!isLoginMode && !name) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }

    setLoading(true);

    try {
      if (isLoginMode) {
        const response = await login(email.trim().toLowerCase(), password);
        if (response.success) {
          await AsyncStorage.setItem('userName', response.user.name);
          await AsyncStorage.setItem('userEmail', response.user.email);
          await AsyncStorage.setItem('uniqueId', response.user.uniqueId);
          await AsyncStorage.setItem('authToken', response.token);
          
          const devicesResponse = await listDevices();
          if (devicesResponse.success && devicesResponse.devices && devicesResponse.devices.length > 0) {
            const firstDevice = devicesResponse.devices[0];
            await AsyncStorage.setItem('deviceId', firstDevice._id);
            await AsyncStorage.setItem('uniqueId', firstDevice.uniqueId);
          } else {
            const enrollment = await enrollDevice(`${response.user.name}'s Android`);
            await AsyncStorage.setItem('deviceId', enrollment.device._id);
            await AsyncStorage.setItem('uniqueId', enrollment.device.uniqueId);
          }
          navigation.replace('Setup');
        }
      } else {
        const response = await register(name.trim(), email.trim().toLowerCase(), password);

        if (response.success) {
          await AsyncStorage.setItem('userName', response.user.name);
          await AsyncStorage.setItem('userEmail', response.user.email);
          await AsyncStorage.setItem('uniqueId', response.user.uniqueId);
          await AsyncStorage.setItem('authToken', response.token);
          const enrollment = await enrollDevice(`${response.user.name}'s Android`);
          await AsyncStorage.setItem('deviceId', enrollment.device._id);
          await AsyncStorage.setItem('uniqueId', enrollment.device.uniqueId);

          navigation.replace('Setup');
        }
      }
    } catch (error) {
      console.error('Auth error:', error);
      Alert.alert(
        isLoginMode ? 'Login Failed' : 'Registration Failed',
        error.message || 'Something went wrong. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <Text style={styles.title}>Parental Control</Text>
          <Text style={styles.subtitle}>{isLoginMode ? 'Log In to Your Account' : 'Create Your Account'}</Text>

          <View style={styles.form}>
            {!isLoginMode && (
              <TextInput
                style={styles.input}
                placeholder="Full Name"
                placeholderTextColor="#999"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                editable={!loading}
              />
            )}

            <TextInput
              style={styles.input}
              placeholder="Email Address"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
            />

            <TextInput
              style={styles.input}
              placeholder="Password (min 6 characters)"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              editable={!loading}
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleAuth}
              disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{isLoginMode ? 'Log In' : 'Sign Up'}</Text>
              )}
            </TouchableOpacity>

            {!isLoginMode && (
              <Text style={styles.infoText}>
                After registration, you will receive a unique 10-character ID for
                remote monitoring.
              </Text>
            )}

            <TouchableOpacity 
              style={styles.toggleModeButton} 
              onPress={() => setIsLoginMode(!isLoginMode)}
              disabled={loading}
            >
              <Text style={styles.toggleModeText}>
                {isLoginMode ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  content: {
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 32,
    textAlign: 'center',
  },
  form: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#f9f9f9',
  },
  button: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  infoText: {
    marginTop: 16,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  toggleModeButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  toggleModeText: {
    color: '#4F46E5',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SignUpScreen;
