// ResultsScreen.js - Round Scoreboard and Hands Inspector
import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Platform
} from 'react-native';
import { useGameStore } from '../store/gameStore';

const SUIT_SYMBOLS = { 'H': '♥', 'D': '♦', 'C': '♣', 'S': '♠', 'J': '★' };
const VALUE_NAMES = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

function MiniCard({ card, wildValue }) {
  const { suit, value, isPrintedJoker } = card;
  const isRed = suit === 'H' || suit === 'D';
  const symbol = SUIT_SYMBOLS[suit] || '';
  const displayVal = isPrintedJoker ? '★' : (VALUE_NAMES[value] || value);
  const isWild = value === wildValue && !isPrintedJoker;

  return (
    <View style={[
      styles.miniCard,
      isRed ? styles.redMiniCard : styles.blackMiniCard,
      isWild && styles.wildMiniCard
    ]}>
      {isWild && (
        <View style={styles.wildMiniDot} />
      )}
      <Text style={[styles.miniValueText, isRed ? styles.redText : styles.blackText]}>
        {displayVal}
      </Text>
      <Text style={[styles.miniSuitText, isRed ? styles.redText : styles.blackText]}>
        {isPrintedJoker ? 'JK' : symbol}
      </Text>
    </View>
  );
}

export default function ResultsScreen({ onNavigate }) {
  const roomCode = useGameStore(state => state.roomCode);
  const players = useGameStore(state => state.players);
  const isAdmin = useGameStore(state => state.isAdmin);
  const winner = useGameStore(state => state.winner);
  const wildJokerValue = useGameStore(state => state.wildJokerValue);
  const restartGame = useGameStore(state => state.restartGame);
  const resetStore = useGameStore(state => state.resetStore);
  const socket = useGameStore(state => state.socket);
  const error = useGameStore(state => state.error);

  const handleNextRound = () => {
    restartGame();
  };

  const exitFullscreen = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      if (document.fullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch((err) => console.log(err));
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
      }
    }
  };

  const handleLeave = () => {
    exitFullscreen();
    if (socket) {
      socket.disconnect();
    }
    resetStore();
    onNavigate('Lobby');
  };

  // If game restarted by admin, gameStarted will flip to true and roundEnded to false
  // App.js handles the navigation transition automatically.

  return (
    <View style={styles.container}>
      {/* Background Glows */}
      <View style={styles.glowTop} />
      
      <View style={styles.header}>
        <Text style={styles.congratsText}>ROUND SCOREBOARD</Text>
        {winner ? (
          <Text style={styles.winnerText}>🏆 {winner} Won the Round! (0 pts)</Text>
        ) : (
          <Text style={styles.winnerText}>Wrong Show! Penalty Round</Text>
        )}
      </View>

      <ScrollView style={styles.mainScroll} contentContainerStyle={styles.scrollContent}>
        {/* Scorecard Table */}
        <View style={styles.scorecardTable}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableCol, styles.colName, styles.headerLabel]}>Player</Text>
            <Text style={[styles.tableCol, styles.colPoints, styles.headerLabel]}>Points</Text>
            <Text style={[styles.tableCol, styles.colTotal, styles.headerLabel]}>Total Score</Text>
          </View>

          {players.map((p, idx) => {
            const isWinner = p.username === winner;
            const isDeclareFailed = p.declareStatus === 'invalid';
            
            return (
              <View key={p.id || idx} style={styles.tableRow}>
                <Text style={[styles.tableCol, styles.colName, styles.rowValue]}>
                  {p.username} {isWinner ? '👑' : ''}
                </Text>
                
                <Text style={[
                  styles.tableCol, 
                  styles.colPoints, 
                  styles.rowValue, 
                  isWinner ? styles.winPoints : styles.losePoints
                ]}>
                  {isWinner ? '0' : `+${p.lastRoundPoints}`}
                  {isDeclareFailed ? ' (Wrong Show)' : ''}
                </Text>

                <Text style={[styles.tableCol, styles.colTotal, styles.rowValue, styles.totalPointsText]}>
                  {p.score} pts
                </Text>
              </View>
            );
          })}
        </View>

        {/* Hands Details Section */}
        <Text style={styles.sectionTitle}>Final Hands Revealed</Text>

        {players.map((p, idx) => {
          return (
            <View key={p.id || idx} style={styles.playerHandCard}>
              <View style={styles.handHeader}>
                <Text style={styles.handOwnerText}>{p.username}'s Cards</Text>
                <Text style={styles.handPointsSubtext}>
                  {p.username === winner ? 'Winner hand (0 pts)' : `Scored ${p.lastRoundPoints} points`}
                </Text>
              </View>

              {p.cards && p.cards.length > 0 ? (
                <ScrollView 
                  horizontal={true} 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cardsRow}
                >
                  {p.cards.map((card, cIdx) => (
                    <MiniCard key={card.id || cIdx} card={card} wildValue={wildJokerValue} />
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.noCardsRevealedText}>Cards not revealed or empty hand.</Text>
              )}
            </View>
          );
        })}

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        <View style={styles.actionContainer}>
          {isAdmin ? (
            <TouchableOpacity style={styles.nextRoundBtn} onPress={handleNextRound}>
              <Text style={styles.nextRoundBtnText}>Deal Next Round</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.waitingHostText}>Waiting for Host to deal next round...</Text>
          )}

          <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
            <Text style={styles.leaveBtnText}>Exit Room</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
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
  glowTop: {
    position: 'absolute',
    top: -150,
    left: '10%',
    width: '80%',
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(212, 175, 55, 0.12)', // Subtle central gold glow
    filter: Platform.OS === 'web' ? 'blur(100px)' : undefined,
  },
  header: {
    alignItems: 'center',
    paddingTop: 30,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  congratsText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#8AAB99',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  winnerText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#E5C158', // Gold winner color
    marginTop: 6,
  },
  mainScroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  scorecardTable: {
    backgroundColor: '#0d562f',
    borderColor: '#522b16',
    borderWidth: 4,
    borderRadius: 16,
    padding: 12,
    marginBottom: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
    ...Platform.select({
      web: {
        backgroundImage: 'radial-gradient(circle, #0e5e32 0%, #06341b 100%)',
        boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)',
      }
    })
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    paddingBottom: 8,
    marginBottom: 8,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  tableCol: {
    flex: 1,
  },
  colName: {
    flex: 1.5,
  },
  colPoints: {
    flex: 1.5,
    textAlign: 'center',
  },
  colTotal: {
    flex: 1,
    textAlign: 'right',
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8AAB99',
    textTransform: 'uppercase',
  },
  rowValue: {
    fontSize: 14,
    color: '#E0E8E4',
    fontWeight: '600',
  },
  winPoints: {
    color: '#2CE57F', // Green for winner 0 points
    fontWeight: 'bold',
  },
  losePoints: {
    color: '#FF6B6B', // Red for penalty points
  },
  totalPointsText: {
    color: '#FFF',
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#E5C158',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  playerHandCard: {
    backgroundColor: '#0d562f',
    borderColor: '#522b16',
    borderWidth: 4,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
    ...Platform.select({
      web: {
        backgroundImage: 'radial-gradient(circle, #0e5e32 0%, #06341b 100%)',
        boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)',
      }
    })
  },
  handHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  handOwnerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  handPointsSubtext: {
    fontSize: 10,
    color: '#8AAB99',
  },
  cardsRow: {
    flexDirection: 'row',
    paddingVertical: 5,
  },
  noCardsRevealedText: {
    fontSize: 11,
    color: '#658C77',
    fontStyle: 'italic',
  },
  // MiniCard styling
  miniCard: {
    width: 32,
    height: 48,
    borderRadius: 4,
    backgroundColor: '#FFF',
    marginRight: 4,
    padding: 3,
    justifyContent: 'space-between',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  redMiniCard: {
    borderColor: '#FFD3D3',
    borderWidth: 0.5,
  },
  blackMiniCard: {
    borderColor: '#E2E2E2',
    borderWidth: 0.5,
  },
  wildMiniCard: {
    borderColor: '#E5C158',
    borderWidth: 1.5,
    backgroundColor: '#FFFDEE',
  },
  wildMiniDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5C158',
  },
  miniValueText: {
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 9,
  },
  miniSuitText: {
    fontSize: 8,
    fontWeight: 'bold',
    textAlign: 'right',
    marginTop: -2,
  },
  redText: {
    color: '#D12E2E',
  },
  blackText: {
    color: '#1A1A1A',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginVertical: 10,
  },
  actionContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  nextRoundBtn: {
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
  nextRoundBtnText: {
    color: '#052F1A',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  waitingHostText: {
    fontSize: 13,
    color: '#8AAB99',
    fontWeight: '600',
    marginVertical: 10,
    fontStyle: 'italic',
  },
  leaveBtn: {
    marginTop: 15,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  leaveBtnText: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  }
});
