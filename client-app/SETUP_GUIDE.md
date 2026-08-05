# Parental Control Client App - Setup Guide

## ✅ Installation Complete!

The React Native client app has been successfully set up with all required dependencies and configuration.

## 🚀 Quick Start

### 1. Start the Backend Server

First, make sure your backend server is running:

```powershell
cd C:\Users\seaen\OneDrive\Desktop\parental-controlApp\backend
npm run dev
```

Keep this terminal open. The server should start on `http://localhost:5000`

### 2. Start Metro Bundler

Open a new terminal and start the React Native Metro bundler:

```powershell
cd C:\Users\seaen\OneDrive\Desktop\parental-controlApp\client-app
npx react-native start
```

Keep this terminal open.

### 3. Run the Android App

Open another terminal and build/run the app:

```powershell
npx react-native run-android
```

This will:
- Build the Android APK
- Install it on your connected device/emulator
- Launch the app

## 📱 Using the App

### First Launch - Registration

1. The app will open to the **Sign Up** screen
2. Enter:
   - **Name**: Your full name
   - **Email**: A valid email address
   - **Password**: At least 6 characters
3. Tap **Sign Up**
4. Grant permissions when prompted (Camera, Microphone, Contacts)

### After Registration

1. You'll see the **Home Screen** with:
   - Your account name
   - Your **Unique 10-character ID** (e.g., `aB3dE7fGh9`)
2. The app will automatically start streaming
3. Note down your Unique ID for remote access

### Remote Monitoring

1. Open the Admin Dashboard at `http://localhost:5173`
2. Enter your Unique ID
3. Click **Connect** to view the live stream

## 🔧 Configuration

### For Physical Android Device

If you're testing on a real device (not emulator):

1. Find your computer's IP address:
```powershell
ipconfig
# Look for IPv4 Address (e.g., 192.168.1.100)
```

2. Update the API URL in `src/services/api.js`:
```javascript
const API_BASE_URL = 'http://YOUR_COMPUTER_IP:5000'; // e.g., http://192.168.1.100:5000
```

3. Make sure your phone and computer are on the same WiFi network

## 📋 App Features

✅ **User Registration** - Sign up with email and password
✅ **Unique ID Generation** - Auto-generates 10-character alphanumeric ID  
✅ **Camera Access** - Streams front camera by default
✅ **Audio Streaming** - Captures and streams microphone audio
✅ **Permission Management** - Requests and handles all required permissions
✅ **Persistent Storage** - Saves user data locally
✅ **Auto-start Streaming** - Begins streaming after registration
✅ **Minimal UI** - Only shows account name and unique ID

## 🛠 Troubleshooting

### Backend Connection Failed

**Error**: "Network error occurred" or "Failed to register"

**Solutions**:
1. Verify backend is running on port 5000
2. For emulator: Use `http://10.0.2.2:5000`
3. For real device: Use your computer's IP (see Configuration section)
4. Check firewall settings

### Permissions Not Granted

**Solutions**:
1. Manually grant permissions:
   - Settings → Apps → ParentalControlClient → Permissions
   - Enable Camera, Microphone, Storage
2. Uninstall and reinstall the app
3. Grant permissions when prompted

### Streaming Not Working

**Solutions**:
1. Check internet connection
2. Verify Agora App ID is correct
3. Ensure backend is generating valid tokens
4. Check Metro bundler console for errors

### Build Errors

**Solutions**:
```powershell
cd android
./gradlew clean
cd ..
npx react-native run-android
```

### Metro Bundler Issues

**Solutions**:
```powershell
# Clear cache
npx react-native start --reset-cache
```

## 📊 Project Status

✅ React Native project initialized
✅ Dependencies installed
✅ Navigation configured
✅ Sign Up screen created
✅ Home screen created
✅ API service configured
✅ Agora streaming service implemented
✅ Permissions handler created
✅ AndroidManifest permissions added
✅ App component updated

## 📁 Key Files

- `App.tsx` - Main app component
- `src/navigation/AppNavigator.js` - Navigation setup
- `src/screens/SignUpScreen.js` - Registration screen
- `src/screens/HomeScreen.js` - Main screen with unique ID
- `src/services/api.js` - Backend API integration
- `src/services/agoraService.js` - Video/audio streaming
- `src/services/permissions.js` - Permission handling
- `android/app/src/main/AndroidManifest.xml` - Android permissions

## 🔐 Security Notes

- Unique IDs are randomly generated and stored locally
- Passwords are hashed on the backend
- Agora tokens expire after 24 hours
- All API communication should use HTTPS in production

## 📞 Testing the Complete Flow

1. **Start Backend**: `cd backend && npm run dev`
2. **Start Admin App**: `cd admin-app && npm run dev`  
3. **Start Client App**: `cd client-app && npx react-native run-android`
4. **Register on Client**: Create account, note Unique ID
5. **Connect from Admin**: Enter Unique ID, view live stream

## 🎉 You're All Set!

Your Parental Control Client App is ready to use. Follow the Quick Start steps above to begin testing.

For the complete system:
- ✅ Backend Server (Port 5000)
- ✅ Admin Dashboard (Port 5173)
- ✅ Client Mobile App (Android)
