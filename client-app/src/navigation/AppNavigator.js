import React, {useEffect, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import SignUpScreen from '../screens/SignUpScreen';
import SetupScreen from '../screens/SetupScreen';
import HomeScreen from '../screens/HomeScreen';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
  const [initialRoute, setInitialRoute] = useState(null);
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('authToken'),
      AsyncStorage.getItem('setupCompleted'),
    ]).then(([token, setupCompleted]) => {
      setInitialRoute(token ? (setupCompleted === 'true' ? 'Home' : 'Setup') : 'SignUp');
    });
  }, []);
  if (!initialRoute) return null;
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerShown: false,
        }}>
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="Setup" component={SetupScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
