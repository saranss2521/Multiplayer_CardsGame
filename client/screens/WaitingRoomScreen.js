// WaitingRoomScreen.js - Waiting Lobby for Players Before Game Start
import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
  Clipboard,
  ActivityIndicator
} from 'react-native';
import { useGameStore } from '../store/gameStore';

export default function WaitingRoomScreen({ onNavigate }) {
  const roomCode = useGameStore(state => state.roomCode);
  const players = useGameStore(state => state.players);
  const username = useGameStore(state => state.username);
  const isAdmin = useGameStore(state => state.isAdmin);
  const error = useGameStore(state => state.error);
  const startGame = useGameStore(state => state.startGame);
  const resetStore = useGameStore(state => state.resetStore);
  const socket = useGameStore(state => state.socket);

  const handleCopyCode = () => {
    if (roomCode) {
      Clipboard.setString(roomCode);
      // Optional: alert user or set temporary state
      alert(`Copied Room Code: ${roomCode}`);
    }
  };

  const handleStartGame = () => {
    if (players.length < 2) return;
    startGame();
  };

  const handleLeave = () => {
    if (socket) {
      socket.disconnect(); // Disconnect automatically triggers removal
    }
    resetStore();
    onNavigate('Lobby');
  };

  // If game is started by admin, App.js will observe state.gameStarted and auto-navigate
  // We can also double check here

  return (
    <View style={styles.container}>
      {/* Background Glows */}
      <View style={styles.glowTopRight} />
      <View style={styles.glowBottomLeft} />

      <View style={styles.header}>
        <Text style={styles.label}>Room Code</Text>
        <TouchableOpacity style={styles.codeContainer} onPress={handleCopyCode}>
          <Text style={styles.roomCode}>{roomCode}</Text>
          <Text style={styles.copyText}>Tap to Copy Code</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardHeader}>Players Joined</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{players.length} / 6</Text>
          </View>
        </View>

        <ScrollView style={styles.playerList} contentContainerStyle={styles.listContent}>
          {players.map((player, index) => {
            const isMe = player.username === username;
            return (
              <View key={player.id || index} style={[styles.playerItem, isMe && styles.meItem]}>
                <View style={[styles.avatar, isMe && styles.meAvatar]}>
                  <Text style={styles.avatarText}>
                    {player.username.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.playerName, isMe && styles.meName]}>
                  {player.username} {isMe ? '(You)' : ''}
                </Text>
                {player.isAdmin ? (
                  <View style={styles.adminBadge}>
                    <Text style={styles.adminText}>👑 Host</Text>
                  </View>
                ) : (
                  <View style={styles.readyBadge}>
                    <Text style={styles.readyText}>Ready</Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        <View style={styles.actionContainer}>
          {isAdmin ? (
            <TouchableOpacity
              style={[styles.startButton, players.length < 2 && styles.disabledButton]}
              onPress={handleStartGame}
              disabled={players.length < 2}
            >
              <Text style={styles.startButtonText}>Start Game</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.waitingContainer}>
              <ActivityIndicator size="small" color="#8AAB99" style={{ marginRight: 8 }} />
              <Text style={styles.waitingText}>Waiting for Host to start...</Text>
            </View>
          )}

          {players.length < 2 && isAdmin ? (
            <Text style={styles.infoText}>Need at least 2 players to start</Text>
          ) : null}
        </View>
      </View>

      <TouchableOpacity style={styles.leaveButton} onPress={handleLeave}>
        <Text style={styles.leaveButtonText}>Leave Room</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#052314', // Deep green casino background
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  glowTopRight: {
    position: 'absolute',
    top: -120,
    right: -120,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(27, 138, 90, 0.2)',
    filter: Platform.OS === 'web' ? 'blur(80px)' : undefined,
  },
  glowBottomLeft: {
    position: 'absolute',
    bottom: -120,
    left: -120,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    filter: Platform.OS === 'web' ? 'blur(80px)' : undefined,
  },
  header: {
    alignItems: 'center',
    marginBottom: 25,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#8AAB99',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  codeContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 15,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
  },
  roomCode: {
    fontSize: 34,
    fontWeight: '900',
    color: '#E5C158',
    letterSpacing: 4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  copyText: {
    fontSize: 10,
    color: '#8AAB99',
    marginTop: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    maxHeight: 450,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
      }
    })
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 12,
    marginBottom: 15,
  },
  cardHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  countBadge: {
    backgroundColor: 'rgba(27, 138, 90, 0.3)',
    borderColor: '#1B8A5A',
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  countText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFF',
  },
  playerList: {
    flex: 1,
    marginBottom: 15,
  },
  listContent: {
    paddingVertical: 5,
  },
  playerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
    borderColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
  },
  meItem: {
    backgroundColor: 'rgba(27, 138, 90, 0.15)',
    borderColor: 'rgba(27, 138, 90, 0.3)',
    borderWidth: 1,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3D5E4D',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  meAvatar: {
    backgroundColor: '#E5C158',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFF',
  },
  playerName: {
    fontSize: 15,
    color: '#E0E8E4',
    fontWeight: '500',
    flex: 1,
  },
  meName: {
    color: '#FFF',
    fontWeight: '700',
  },
  adminBadge: {
    backgroundColor: 'rgba(229, 193, 88, 0.15)',
    borderColor: '#E5C158',
    borderWidth: 1,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  adminText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#E5C158',
  },
  readyBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  readyText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8AAB99',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  actionContainer: {
    alignItems: 'center',
    marginTop: 5,
  },
  startButton: {
    backgroundColor: '#E5C158',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  disabledButton: {
    backgroundColor: '#5A564A',
    opacity: 0.5,
  },
  startButtonText: {
    color: '#052314',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  waitingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  waitingText: {
    fontSize: 14,
    color: '#8AAB99',
    fontWeight: '500',
  },
  infoText: {
    fontSize: 11,
    color: '#8AAB99',
    marginTop: 8,
    fontWeight: '600',
  },
  leaveButton: {
    marginTop: 25,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  leaveButtonText: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  }
});
