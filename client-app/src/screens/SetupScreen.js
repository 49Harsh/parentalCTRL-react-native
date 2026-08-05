import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  AppState,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getNativeSetupStatus,
  openBatteryOptimizationSettings,
  openNotificationAccessSettings,
  startMonitoringService,
} from '../services/nativeMonitoring';

const SetupRow = ({title, detail, complete, action, actionLabel}) => (
  <View style={styles.row}>
    <View style={styles.rowText}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowDetail}>{detail}</Text>
    </View>
    <TouchableOpacity
      style={[styles.action, complete && styles.actionComplete]}
      onPress={action}>
      <Text style={[styles.actionText, complete && styles.actionTextComplete]}>
        {complete ? 'Allowed' : actionLabel}
      </Text>
    </TouchableOpacity>
  </View>
);

const SetupScreen = ({navigation}) => {
  const [status, setStatus] = useState(null);

  const refresh = useCallback(async () => {
    const [camera, microphone, nativeStatus] = await Promise.all([
      Platform.OS === 'android'
        ? PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA)
        : true,
      Platform.OS === 'android'
        ? PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)
        : true,
      getNativeSetupStatus(),
    ]);
    setStatus({...nativeStatus, camera, microphone});
  }, []);

  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const request = async permission => {
    await PermissionsAndroid.request(permission);
    refresh();
  };

  const enableMonitoring = async () => {
    await startMonitoringService();
    refresh();
  };

  const finish = async () => {
    await AsyncStorage.setItem('setupCompleted', 'true');
    navigation.replace('Home');
  };

  if (!status) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#4F46E5" /></View>;
  }

  const notificationsRequired = Platform.OS === 'android' && Platform.Version >= 33;
  const requiredComplete =
    status.camera &&
    status.microphone &&
    (!notificationsRequired || status.notificationsEnabled) &&
    status.monitoringServiceEnabled;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Complete device setup</Text>
      <Text style={styles.subtitle}>
        Each item opens the Android control where the device user can allow or revoke access.
      </Text>

      <SetupRow
        title="Camera"
        detail="Used only during a visibly approved live camera session."
        complete={status.camera}
        action={() => request(PermissionsAndroid.PERMISSIONS.CAMERA)}
        actionLabel="Allow"
      />
      <SetupRow
        title="Microphone"
        detail="Used only during a visibly approved live audio session."
        complete={status.microphone}
        action={() => request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)}
        actionLabel="Allow"
      />
      {notificationsRequired && (
        <SetupRow
          title="App notifications"
          detail="Required for persistent monitoring and screen-sharing indicators."
          complete={status.notificationsEnabled}
          action={() => request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)}
          actionLabel="Allow"
        />
      )}
      <SetupRow
        title="Notification access"
        detail="Optional. Android Settings controls which app notifications FamilyGuard can observe. Sensitive codes are redacted."
        complete={status.notificationAccess}
        action={openNotificationAccessSettings}
        actionLabel="Open settings"
      />
      <SetupRow
        title="Battery optimization"
        detail="Optional. Review Android battery settings to improve heartbeat reliability."
        complete={!status.batteryOptimized}
        action={openBatteryOptimizationSettings}
        actionLabel="Review"
      />
      <SetupRow
        title="Visible monitoring service"
        detail="Keeps an ongoing notification while background command monitoring is enabled."
        complete={status.monitoringServiceEnabled}
        action={enableMonitoring}
        actionLabel="Enable"
      />

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>Screen sharing</Text>
        <Text style={styles.noticeText}>
          Android displays its own capture confirmation for each screen-sharing session. This cannot be permanently pre-approved.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.finish, !requiredComplete && styles.finishDisabled]}
        disabled={!requiredComplete}
        onPress={finish}>
        <Text style={styles.finishText}>Finish setup</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f5'},
  content: {padding: 22, paddingBottom: 40},
  loading: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  title: {fontSize: 28, fontWeight: '800', color: '#222', marginTop: 20},
  subtitle: {fontSize: 15, color: '#666', lineHeight: 22, marginTop: 8, marginBottom: 22},
  row: {backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center'},
  rowText: {flex: 1, paddingRight: 12},
  rowTitle: {fontSize: 17, fontWeight: '700', color: '#222'},
  rowDetail: {fontSize: 13, color: '#666', lineHeight: 18, marginTop: 5},
  action: {borderRadius: 10, backgroundColor: '#4F46E5', paddingHorizontal: 12, paddingVertical: 10, maxWidth: 112},
  actionComplete: {backgroundColor: '#E8F5E9'},
  actionText: {color: '#fff', fontWeight: '700', textAlign: 'center', fontSize: 12},
  actionTextComplete: {color: '#247A35'},
  notice: {backgroundColor: '#EEF2FF', borderRadius: 16, padding: 16, marginTop: 5},
  noticeTitle: {fontSize: 16, fontWeight: '700', color: '#3730A3'},
  noticeText: {fontSize: 13, color: '#4B5563', lineHeight: 19, marginTop: 5},
  finish: {backgroundColor: '#4F46E5', borderRadius: 14, padding: 16, marginTop: 22},
  finishDisabled: {opacity: 0.4},
  finishText: {color: '#fff', textAlign: 'center', fontSize: 17, fontWeight: '800'},
});

export default SetupScreen;
