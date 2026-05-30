// App.js - Main Application Entry & State-Driven Screen Navigator
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  StatusBar,
  TextInput,
  TouchableOpacity,
  Platform,
  ActivityIndicator
} from 'react-native';
import { useGameStore } from './store/gameStore';
import LobbyScreen from './screens/LobbyScreen';
import WaitingRoomScreen from './screens/WaitingRoomScreen';
import GameScreen from './screens/GameScreen';
import ResultsScreen from './screens/ResultsScreen';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('Lobby');
  const [serverUrl, setServerUrl] = useState('http://localhost:3000');
  const [showConfig, setShowConfig] = useState(false);
  const [tempUrl, setTempUrl] = useState('http://localhost:3000');

  // Zustand Store Hooks
  const connectSocket = useGameStore(state => state.connectSocket);
  const connected = useGameStore(state => state.connected);
  const roomCode = useGameStore(state => state.roomCode);
  const gameStarted = useGameStore(state => state.gameStarted);
  const roundEnded = useGameStore(state => state.roundEnded);
  const socket = useGameStore(state => state.socket);

  // Initialize socket connection
  useEffect(() => {
    connectSocket(serverUrl);
    return () => {
      const currentSocket = useGameStore.getState().socket;
      if (currentSocket) {
        currentSocket.disconnect();
      }
    };
  }, [serverUrl]);

  // Synchronize navigation screens based on multiplayer game state
  useEffect(() => {
    if (gameStarted && !roundEnded) {
      setCurrentScreen('Game');
    } else if (gameStarted && roundEnded) {
      setCurrentScreen('Results');
    } else if (!gameStarted && roomCode) {
      setCurrentScreen('WaitingRoom');
    } else {
      setCurrentScreen('Lobby');
    }
  }, [gameStarted, roundEnded, roomCode]);

  const handleUpdateServerUrl = () => {
    setServerUrl(tempUrl);
    setShowConfig(false);
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'WaitingRoom':
        return <WaitingRoomScreen onNavigate={setCurrentScreen} />;
      case 'Game':
        return <GameScreen onNavigate={setCurrentScreen} />;
      case 'Results':
        return <ResultsScreen onNavigate={setCurrentScreen} />;
      case 'Lobby':
      default:
        return <LobbyScreen onNavigate={setCurrentScreen} />;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#052314" />
      
      {/* 1. Global Connection and Configuration Ribbon */}
      <View style={styles.statusRibbon}>
        <View style={styles.statusLeft}>
          <View style={[styles.statusDot, connected ? styles.onlineDot : styles.offlineDot]} />
          <Text style={styles.statusText}>
            {connected ? 'CONNECTED TO SERVER' : 'DISCONNECTED'}
          </Text>
        </View>

        <TouchableOpacity 
          style={styles.configToggleBtn} 
          onPress={() => setShowConfig(!showConfig)}
        >
          <Text style={styles.configToggleText}>⚙ Server IP</Text>
        </TouchableOpacity>
      </View>

      {/* 2. Server URL Configuration Drawer */}
      {showConfig && (
        <View style={styles.configDrawer}>
          <Text style={styles.configLabel}>Socket.IO Server Address:</Text>
          <View style={styles.configInputRow}>
            <TextInput
              style={styles.configInput}
              value={tempUrl}
              onChangeText={setTempUrl}
              placeholder="http://192.168.x.x:3000"
              placeholderTextColor="rgba(255,255,255,0.4)"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.configSaveBtn} onPress={handleUpdateServerUrl}>
              <Text style={styles.configSaveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.configHelpText}>
            * Tip: If running on a physical phone, change 'localhost' to your computer's local network IP.
          </Text>
        </View>
      )}

      {/* 3. Active Screen Content */}
      <View style={styles.screenContainer}>
        {renderScreen()}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#052314', // Match felt table color
  },
  statusRibbon: {
    height: 36,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  onlineDot: {
    backgroundColor: '#2CE57F', // Vivid green
    shadowColor: '#2CE57F',
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  offlineDot: {
    backgroundColor: '#FF6B6B', // Flashing red
    shadowColor: '#FF6B6B',
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#8AAB99',
    letterSpacing: 0.5,
  },
  configToggleBtn: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
  },
  configToggleText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#E5C158',
  },
  configDrawer: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  configLabel: {
    fontSize: 11,
    color: '#8AAB99',
    fontWeight: 'bold',
    marginBottom: 6,
  },
  configInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  configInput: {
    flex: 1,
    height: 38,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    color: '#FFF',
    fontSize: 14,
  },
  configSaveBtn: {
    backgroundColor: '#E5C158',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 6,
    marginLeft: 8,
    justifyContent: 'center',
  },
  configSaveBtnText: {
    color: '#052314',
    fontSize: 12,
    fontWeight: 'bold',
  },
  configHelpText: {
    fontSize: 9,
    color: '#557A65',
    marginTop: 6,
    fontStyle: 'italic',
  },
  screenContainer: {
    flex: 1,
    position: 'relative',
  }
});
