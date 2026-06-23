// LobbyScreen.js - Create or Join Game Room
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions
} from 'react-native';
import { useGameStore } from '../store/gameStore';

export default function LobbyScreen({ onNavigate }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [localErr, setLocalErr] = useState('');

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const createRoom = useGameStore(state => state.createRoom);
  const joinRoom = useGameStore(state => state.joinRoom);
  const playWithComputer = useGameStore(state => state.playWithComputer);
  const error = useGameStore(state => state.error);
  const clearError = useGameStore(state => state.clearError);

  const enterFullscreen = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const docEl = document.documentElement;
      if (docEl.requestFullscreen) {
        docEl.requestFullscreen().catch((err) => console.log(err));
      } else if (docEl.webkitRequestFullscreen) {
        docEl.webkitRequestFullscreen();
      } else if (docEl.mozRequestFullScreen) {
        docEl.mozRequestFullScreen();
      } else if (docEl.msRequestFullscreen) {
        docEl.msRequestFullscreen();
      }
    }
  };

  const handleCreate = () => {
    if (!name.trim()) {
      setLocalErr('Please enter a username first.');
      return;
    }
    enterFullscreen();
    setLocalErr('');
    clearError();
    setLoading(true);

    createRoom(name.trim(), (res) => {
      setLoading(false);
      if (res.success) {
        onNavigate('WaitingRoom');
      }
    });
  };

  const handlePlayWithComputer = () => {
    if (!name.trim()) {
      setLocalErr('Please enter a username first.');
      return;
    }
    enterFullscreen();
    setLocalErr('');
    clearError();
    setLoading(true);

    playWithComputer(name.trim(), (res) => {
      setLoading(false);
      if (res.success) {
        // App.js handles navigation automatically because gameStarted is now true
      } else {
        setLocalErr(res.error || 'Failed to start game with computer.');
      }
    });
  };

  const handleJoin = () => {
    if (!name.trim()) {
      setLocalErr('Please enter a username first.');
      return;
    }
    if (!code.trim() || code.length < 5) {
      setLocalErr('Please enter a valid 5-6 digit Room Code.');
      return;
    }
    enterFullscreen();
    setLocalErr('');
    clearError();
    setLoading(true);

    joinRoom(code.trim().toUpperCase(), name.trim(), (res) => {
      setLoading(false);
      if (res.success) {
        onNavigate('WaitingRoom');
      }
    });
  };

  const displayError = localErr || error;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        {/* Background Glows */}
        <View style={styles.glowTopLeft} />
        <View style={styles.glowBottomRight} />

        <View style={[styles.mainLayout, isLandscape && styles.landscapeLayout]}>
          <View style={[styles.leftPanel, isLandscape && styles.landscapeLeftPanel]}>
            <View style={styles.header}>
              <Text style={styles.title}>ROYAL RUMMY</Text>
              <Text style={styles.subtitle}>Pure Indian 13-Card Multiplayer Fun</Text>
            </View>
            {isLandscape && (
              <View style={styles.landscapeFooter}>
                <Text style={styles.footerText}>♣ No Gambling • ♦ Purely for Fun • ♥ Real Rummy Rules • ♠</Text>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardHeader}>Player Details</Text>
            
            <Text style={styles.label}>Your Username</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., ShufflerPro"
              placeholderTextColor="rgba(255, 255, 255, 0.4)"
              value={name}
              onChangeText={(t) => {
                setName(t);
                setLocalErr('');
                clearError();
              }}
              maxLength={12}
              autoCorrect={false}
            />

            {displayError ? (
              <Text style={styles.errorText}>{displayError}</Text>
            ) : null}

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#E5C158" style={styles.loader} />
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setLoading(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.actionContainer}>
                {/* Create Room Button */}
                <TouchableOpacity style={styles.createButton} onPress={handleCreate}>
                  <Text style={styles.createButtonText}>Create New Room</Text>
                  <Text style={styles.buttonSubtext}>(You will be Host)</Text>
                </TouchableOpacity>

                {/* Play with Computer Button */}
                <TouchableOpacity 
                  style={[styles.createButton, styles.computerBtn, { marginTop: 10 }]} 
                  onPress={handlePlayWithComputer}
                >
                  <Text style={styles.computerButtonText}>🤖 Play with Computer</Text>
                  <Text style={styles.computerButtonSubtext}>(Start instant game with bots)</Text>
                </TouchableOpacity>

                <View style={styles.dividerContainer}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Join Room Section */}
                <View style={styles.joinSection}>
                  <Text style={styles.label}>Enter Room Code</Text>
                  <TextInput
                    style={[styles.input, styles.codeInput]}
                    placeholder="6-DIGIT CODE"
                    placeholderTextColor="rgba(255, 255, 255, 0.4)"
                    value={code}
                    onChangeText={(t) => {
                      setCode(t);
                      setLocalErr('');
                      clearError();
                    }}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={6}
                  />
                  
                  <TouchableOpacity style={styles.joinButton} onPress={handleJoin}>
                    <Text style={styles.joinButtonText}>Join Room</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>

        {!isLandscape && (
          <View style={styles.footer}>
            <Text style={styles.footerText}>♣ No Gambling • ♦ Purely for Fun • ♥ Real Rummy Rules • ♠</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1b0e06', // Wooden floor color
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(90deg, rgba(0,0,0,0.15) 1px, transparent 1px)',
        backgroundSize: '80px 100%',
      }
    })
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  glowTopLeft: {
    position: 'absolute',
    top: -100,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(212, 175, 55, 0.15)', // Golden glow
    filter: Platform.OS === 'web' ? 'blur(80px)' : undefined, // Web blur filter
  },
  glowBottomRight: {
    position: 'absolute',
    bottom: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(27, 138, 90, 0.25)', // Green felt glow
    filter: Platform.OS === 'web' ? 'blur(80px)' : undefined,
  },
  header: {
    alignItems: 'center',
    marginBottom: 35,
  },
  title: {
    fontSize: 38,
    fontWeight: '900',
    color: '#E5C158', // Antique gold color
    letterSpacing: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 6,
    ...Platform.select({
      web: {
        fontFamily: 'Outfit, Inter, sans-serif',
      }
    })
  },
  subtitle: {
    fontSize: 14,
    color: '#8AAB99',
    marginTop: 8,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#0d562f', // Felt green
    borderColor: '#522b16', // Wooden brown border
    borderWidth: 6, // Wooden rim
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
    ...Platform.select({
      web: {
        backgroundImage: 'radial-gradient(circle, #0e5e32 0%, #06341b 100%)',
        boxShadow: 'inset 0 0 30px rgba(0,0,0,0.5)',
      }
    })
  },
  cardHeader: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8AAB99',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFF',
    marginBottom: 16,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 3,
    color: '#E5C158',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  loader: {
    marginVertical: 20,
  },
  actionContainer: {
    width: '100%',
  },
  computerBtn: {
    backgroundColor: '#E5C158',
    borderColor: 'rgba(0,0,0,0.1)',
  },
  computerButtonText: {
    color: '#052314',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  computerButtonSubtext: {
    fontSize: 10,
    color: 'rgba(5, 35, 20, 0.7)',
    marginTop: 2,
  },
  createButton: {
    backgroundColor: '#1E6B47', // Felt green accent button
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  createButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  buttonSubtext: {
    fontSize: 10,
    color: '#A2C2B2',
    marginTop: 2,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  dividerText: {
    color: '#8AAB99',
    paddingHorizontal: 12,
    fontSize: 12,
    fontWeight: 'bold',
  },
  joinSection: {
    width: '100%',
  },
  joinButton: {
    backgroundColor: '#E5C158', // Gold button
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  joinButtonText: {
    color: '#052314', // Dark green text for contrast
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  footer: {
    marginTop: 35,
  },
  footerText: {
    fontSize: 11,
    color: '#557A65',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  mainLayout: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  landscapeLayout: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    maxWidth: 900,
    width: '100%',
    alignItems: 'center',
  },
  leftPanel: {
    alignItems: 'center',
  },
  landscapeLeftPanel: {
    flex: 1.2,
    marginRight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  landscapeFooter: {
    marginTop: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  cancelBtn: {
    marginTop: 15,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
  },
  cancelBtnText: {
    color: '#FF6B6B',
    fontWeight: 'bold',
    fontSize: 14,
  }
});
