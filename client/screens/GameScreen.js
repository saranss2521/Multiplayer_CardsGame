// GameScreen.js - Casino Green Felt Table and Card Play UI
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  Modal
} from 'react-native';
import { useGameStore } from '../store/gameStore';
import Card from '../components/Card';

export default function GameScreen({ onNavigate }) {
  const username = useGameStore(state => state.username);
  const roomCode = useGameStore(state => state.roomCode);
  const players = useGameStore(state => state.players);
  const gameStarted = useGameStore(state => state.gameStarted);
  const roundEnded = useGameStore(state => state.roundEnded);
  const turnIndex = useGameStore(state => state.turnIndex);
  const turnState = useGameStore(state => state.turnState);
  const timeLeft = useGameStore(state => state.timeLeft);
  const wildJokerCard = useGameStore(state => state.wildJokerCard);
  const wildJokerValue = useGameStore(state => state.wildJokerValue);
  const deckCount = useGameStore(state => state.deckCount);
  const discardPile = useGameStore(state => state.discardPile);
  const winner = useGameStore(state => state.winner);
  const error = useGameStore(state => state.error);
  
  // Local/Store hand management
  const myHandGroups = useGameStore(state => state.myHandGroups);
  const selectedCardIds = useGameStore(state => state.selectedCardIds);
  const isDeclaring = useGameStore(state => state.isDeclaring);
  
  const selectCard = useGameStore(state => state.selectCard);
  const clearSelection = useGameStore(state => state.clearSelection);
  const groupSelectedCards = useGameStore(state => state.groupSelectedCards);
  const sortHand = useGameStore(state => state.sortHand);
  const moveCard = useGameStore(state => state.moveCard);
  const drawCard = useGameStore(state => state.drawCard);
  const discardCard = useGameStore(state => state.discardCard);
  const declareGame = useGameStore(state => state.declareGame);
  const setDeclaringMode = useGameStore(state => state.setDeclaringMode);
  
  const socket = useGameStore(state => state.socket);

  // Modal confirm declare
  const [confirmDeclareVisible, setConfirmDeclareVisible] = useState(false);
  const [chosenDeclareCard, setChosenDeclareCard] = useState(null);
  const [declareLoading, setDeclareLoading] = useState(false);

  // Find index of current client player in players array
  const myIndex = players.findIndex(p => p.username === username);
  const isActiveTurn = turnIndex === myIndex;
  const totalCardsInHand = myHandGroups.flat().length;

  const topDiscardCard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;

  // Handle drawing cards
  const handleDrawDeck = () => {
    if (!isActiveTurn) return;
    if (turnState !== 'draw') return;
    drawCard('deck');
  };

  const handleDrawDiscard = () => {
    if (!isActiveTurn) return;
    if (turnState !== 'draw') return;
    drawCard('discard');
  };

  // Handle standard discarding
  const handleDiscard = () => {
    if (!isActiveTurn) return;
    if (turnState !== 'discard') return;
    if (selectedCardIds.length !== 1) {
      alert('Please select exactly 1 card to discard.');
      return;
    }
    discardCard(selectedCardIds[0]);
  };

  // Handle declare initialization
  const handleDeclareTrigger = () => {
    if (!isActiveTurn) return;
    if (turnState !== 'discard') return;
    
    // Toggle declaring mode on
    setDeclaringMode(true);
  };

  // Selecting a card inside declaring mode
  const handleCardPress = (card) => {
    if (isDeclaring) {
      setChosenDeclareCard(card);
      setConfirmDeclareVisible(true);
    } else {
      selectCard(card.id);
    }
  };

  const handleConfirmDeclare = () => {
    if (!chosenDeclareCard) return;
    setDeclareLoading(true);
    
    declareGame(chosenDeclareCard.id, (res) => {
      setDeclareLoading(false);
      setConfirmDeclareVisible(false);
      setChosenDeclareCard(null);
      if (res.success) {
        if (res.valid) {
          onNavigate('Results');
        } else {
          alert(`Wrong Show! Penalty of 80 points applied.\nReason: ${res.reason}`);
          onNavigate('Results');
        }
      }
    });
  };

  // Card movement buttons
  const handleMoveToNewGroup = (cardId) => {
    moveCard(cardId, 99, 0); // moves to out of bounds group, creating new one
  };

  const handleMoveCard = (cardId, targetGroupIdx, targetCardIdx) => {
    moveCard(cardId, targetGroupIdx, targetCardIdx);
  };

  // Auto transition to results if round ended and we are not in declare callback
  React.useEffect(() => {
    if (roundEnded) {
      onNavigate('Results');
    }
  }, [roundEnded]);

  return (
    <View style={styles.container}>
      {/* 1. Opponent Bar */}
      <View style={styles.opponentsContainer}>
        {players.map((player, idx) => {
          const isPlayerTurn = turnIndex === idx;
          const isMe = idx === myIndex;
          
          return (
            <View 
              key={player.id || idx} 
              style={[
                styles.playerAvatarContainer,
                isPlayerTurn && styles.activePlayerBorder,
                !player.connected && styles.disconnectedPlayerBorder
              ]}
            >
              <View style={[styles.avatarCircle, isMe && styles.meAvatarCircle]}>
                <Text style={styles.avatarLetter}>
                  {player.username.charAt(0).toUpperCase()}
                </Text>
              </View>
              
              <Text 
                numberOfLines={1} 
                style={[styles.playerText, isPlayerTurn && styles.activePlayerText]}
              >
                {player.username}
              </Text>
              
              <Text style={styles.cardCountText}>
                🂠 {isMe ? totalCardsInHand : player.cardCount} cards
              </Text>
              
              {!player.connected ? (
                <Text style={styles.disconnectedText}>OFFLINE</Text>
              ) : isPlayerTurn ? (
                <Text style={styles.turnTimerTick}>{timeLeft}s</Text>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* Server message banners */}
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      {/* Declare Mode Prompt Banner */}
      {isDeclaring ? (
        <View style={styles.declareBanner}>
          <Text style={styles.declareBannerText}>
            ⚠️ SELECT THE CARD TO DISCARD AND DECLARE YOUR SHOW
          </Text>
          <TouchableOpacity 
            style={styles.cancelDeclareBtn} 
            onPress={() => setDeclaringMode(false)}
          >
            <Text style={styles.cancelDeclareBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* 2. Table Center Area (Deck, Discard Pile, Wild Joker) */}
      <View style={styles.tableCenter}>
        {/* Closed Deck */}
        <View style={styles.centerPileContainer}>
          <Text style={styles.pileLabel}>CLOSED DECK</Text>
          <TouchableOpacity 
            activeOpacity={0.8}
            onPress={handleDrawDeck}
            disabled={!isActiveTurn || turnState !== 'draw'}
            style={[
              styles.closedDeckCover,
              isActiveTurn && turnState === 'draw' && styles.drawGlow
            ]}
          >
            <Text style={styles.deckBackPattern}>♦ ROYAL ♣</Text>
            <Text style={styles.deckBackCount}>{deckCount} left</Text>
          </TouchableOpacity>
        </View>

        {/* Wild Joker Display */}
        {wildJokerCard ? (
          <View style={styles.centerPileContainer}>
            <Text style={styles.jokerLabel}>WILD JOKER</Text>
            <View style={styles.jokerCardWrapper}>
              <Card 
                card={wildJokerCard} 
                isWildJoker={false}
                isSelected={false}
                onPress={() => {}}
              />
              <Text style={styles.jokerIndicatorText}>
                Rank {wildJokerValue === 1 ? 'A' : wildJokerValue} is Joker
              </Text>
            </View>
          </View>
        ) : null}

        {/* Discard Pile */}
        <View style={styles.centerPileContainer}>
          <Text style={styles.pileLabel}>DISCARD PILE</Text>
          {topDiscardCard ? (
            <TouchableOpacity 
              activeOpacity={0.8}
              onPress={handleDrawDiscard}
              disabled={!isActiveTurn || turnState !== 'draw'}
              style={[
                styles.discardCardWrapper,
                isActiveTurn && turnState === 'draw' && styles.drawGlow
              ]}
            >
              <Card 
                card={topDiscardCard} 
                isWildJoker={topDiscardCard.value === wildJokerValue}
                isSelected={false}
                onPress={handleDrawDiscard}
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.emptyDiscard}>
              <Text style={styles.emptyDiscardText}>Empty</Text>
            </View>
          )}
        </View>
      </View>

      {/* 3. Action Controls */}
      <View style={styles.controlsBar}>
        <View style={styles.leftControls}>
          <TouchableOpacity 
            style={[styles.controlBtn, styles.sortBtn]} 
            onPress={sortHand}
          >
            <Text style={styles.controlBtnText}>Sort Suits</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.controlBtn, 
              styles.groupBtn, 
              selectedCardIds.length === 0 && styles.disabledControlBtn
            ]} 
            onPress={groupSelectedCards}
            disabled={selectedCardIds.length === 0}
          >
            <Text style={styles.controlBtnText}>Group Selected</Text>
          </TouchableOpacity>
        </View>

        {isActiveTurn && !isDeclaring ? (
          <View style={styles.rightControls}>
            {turnState === 'draw' ? (
              <View style={styles.turnHelpBubble}>
                <Text style={styles.turnHelpText}>← Draw a card</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity 
                  style={[
                    styles.controlBtn, 
                    styles.discardBtn,
                    selectedCardIds.length !== 1 && styles.disabledControlBtn
                  ]} 
                  onPress={handleDiscard}
                  disabled={selectedCardIds.length !== 1}
                >
                  <Text style={styles.discardBtnText}>Discard</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.controlBtn, styles.declareBtn]} 
                  onPress={handleDeclareTrigger}
                >
                  <Text style={styles.declareBtnText}>Declare Show</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : isActiveTurn && isDeclaring ? (
          <View style={styles.rightControls}>
            <Text style={styles.declaringTextStatus}>Tap card to show</Text>
          </View>
        ) : (
          <View style={styles.rightControls}>
            <Text style={styles.waitingTurnText}>Waiting for turn...</Text>
          </View>
        )}
      </View>

      {/* 4. Player Hand (Grouped Cards) */}
      <ScrollView 
        horizontal={false} 
        style={styles.handScrollView} 
        contentContainerStyle={styles.handContentContainer}
      >
        {myHandGroups.map((group, groupIdx) => {
          return (
            <View key={groupIdx} style={styles.groupContainer}>
              <View style={styles.groupHeaderRow}>
                <Text style={styles.groupHeaderText}>Group {groupIdx + 1}</Text>
                
                {/* Selection movement hooks */}
                {selectedCardIds.length > 0 && (
                  <TouchableOpacity 
                    style={styles.moveHereBtn}
                    onPress={() => {
                      selectedCardIds.forEach(id => moveCard(id, groupIdx, 0));
                      clearSelection();
                    }}
                  >
                    <Text style={styles.moveHereText}>Move Selection Here</Text>
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView 
                horizontal={true} 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.groupCardsScroll}
              >
                {group.map((card, cardIdx) => {
                  const isSelected = selectedCardIds.includes(card.id);
                  const isWild = card.value === wildJokerValue;
                  
                  return (
                    <View key={card.id} style={styles.cardItemWrapper}>
                      <Card 
                        card={card}
                        isSelected={isSelected}
                        isWildJoker={isWild}
                        onPress={() => handleCardPress(card)}
                      />
                      
                      {/* Individual card grouping utilities for non-drag environments */}
                      {!isDeclaring && (
                        <View style={styles.cardActionSubrow}>
                          <TouchableOpacity 
                            style={styles.microBtn}
                            onPress={() => handleMoveToNewGroup(card.id)}
                          >
                            <Text style={styles.microBtnText}>New</Text>
                          </TouchableOpacity>
                          {groupIdx > 0 && (
                            <TouchableOpacity 
                              style={styles.microBtn}
                              onPress={() => handleMoveCard(card.id, groupIdx - 1, 99)}
                            >
                              <Text style={styles.microBtnText}>←</Text>
                            </TouchableOpacity>
                          )}
                          {groupIdx < myHandGroups.length - 1 && (
                            <TouchableOpacity 
                              style={styles.microBtn}
                              onPress={() => handleMoveCard(card.id, groupIdx + 1, 0)}
                            >
                              <Text style={styles.microBtnText}>→</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>

      {/* Confirm Declare Modal Dialog */}
      <Modal
        visible={confirmDeclareVisible}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Confirm Show / Declare</Text>
            
            {chosenDeclareCard && (
              <View style={styles.declareCardConfirmDisplay}>
                <Text style={styles.modalText}>You are discarding this card to finish:</Text>
                <Card card={chosenDeclareCard} isSelected={false} isWildJoker={chosenDeclareCard.value === wildJokerValue} />
              </View>
            )}

            <Text style={styles.modalSubText}>
              Are you sure? The server will validate your remaining 13 cards. An invalid declare results in an immediate 80-point penalty.
            </Text>

            {declareLoading ? (
              <ActivityIndicator size="large" color="#E5C158" style={styles.modalLoader} />
            ) : (
              <View style={styles.modalActions}>
                <TouchableOpacity 
                  style={[styles.modalBtn, styles.modalCancelBtn]} 
                  onPress={() => {
                    setConfirmDeclareVisible(false);
                    setChosenDeclareCard(null);
                  }}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.modalBtn, styles.modalConfirmBtn]} 
                  onPress={handleConfirmDeclare}
                >
                  <Text style={styles.modalConfirmBtnText}>Declare Show</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#052F1A', // Rich felt green table
  },
  opponentsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderBottomWidth: 1.5,
    borderBottomColor: '#D4AF37', // Golden boundary line
    paddingVertical: 10,
    paddingHorizontal: 8,
    justifyContent: 'space-around',
  },
  playerAvatarContainer: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    minWidth: 80,
    position: 'relative',
    borderColor: 'transparent',
    borderWidth: 1.5,
  },
  activePlayerBorder: {
    borderColor: '#E5C158',
    backgroundColor: 'rgba(229, 193, 88, 0.08)',
  },
  disconnectedPlayerBorder: {
    borderColor: '#FF6B6B',
    opacity: 0.7,
  },
  avatarCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1E6B47',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  meAvatarCircle: {
    backgroundColor: '#E5C158',
  },
  avatarLetter: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFF',
  },
  playerText: {
    fontSize: 11,
    color: '#A2C2B2',
    fontWeight: '600',
  },
  activePlayerText: {
    color: '#E5C158',
    fontWeight: 'bold',
  },
  cardCountText: {
    fontSize: 9,
    color: '#8AAB99',
    marginTop: 1,
  },
  turnTimerTick: {
    position: 'absolute',
    top: 0,
    right: 2,
    fontSize: 9,
    fontWeight: '900',
    color: '#E5C158',
    backgroundColor: '#000',
    paddingHorizontal: 3,
    borderRadius: 4,
  },
  disconnectedText: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#FF6B6B',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 3,
    borderRadius: 2,
    marginTop: 2,
  },
  errorBanner: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 6,
    alignItems: 'center',
  },
  errorBannerText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  declareBanner: {
    backgroundColor: '#E5C158',
    paddingVertical: 8,
    paddingHorizontal: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  declareBannerText: {
    color: '#052F1A',
    fontSize: 11,
    fontWeight: '900',
    flex: 1,
  },
  cancelDeclareBtn: {
    backgroundColor: '#052F1A',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  cancelDeclareBtnText: {
    color: '#E5C158',
    fontSize: 11,
    fontWeight: 'bold',
  },
  tableCenter: {
    flex: 1,
    minHeight: 140,
    maxHeight: 180,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  centerPileContainer: {
    alignItems: 'center',
  },
  pileLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#8AAB99',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  jokerLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#E5C158',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  closedDeckCover: {
    width: 62,
    height: 94,
    borderRadius: 8,
    backgroundColor: '#8b0000', // Crimson deck back
    borderColor: '#E5C158',
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  deckBackPattern: {
    fontSize: 10,
    color: '#E5C158',
    fontWeight: 'bold',
  },
  deckBackCount: {
    fontSize: 9,
    color: '#FFF',
    fontWeight: '500',
    marginTop: 10,
  },
  drawGlow: {
    shadowColor: '#E5C158',
    shadowOpacity: 0.8,
    shadowRadius: 10,
    borderColor: '#FFF',
    borderWidth: 2,
    transform: [{ scale: 1.03 }],
  },
  jokerCardWrapper: {
    alignItems: 'center',
  },
  jokerIndicatorText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#E5C158',
    marginTop: 4,
  },
  discardCardWrapper: {
    borderRadius: 8,
  },
  emptyDiscard: {
    width: 62,
    height: 94,
    borderRadius: 8,
    borderStyle: 'dashed',
    borderColor: '#8AAB99',
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  emptyDiscardText: {
    fontSize: 10,
    color: '#8AAB99',
    fontWeight: 'bold',
  },
  controlsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  leftControls: {
    flexDirection: 'row',
  },
  rightControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  controlBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 8,
    justifyContent: 'center',
  },
  sortBtn: {
    backgroundColor: '#385C48',
  },
  groupBtn: {
    backgroundColor: '#274D7A',
  },
  disabledControlBtn: {
    opacity: 0.35,
  },
  controlBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  discardBtn: {
    backgroundColor: '#8B0000',
  },
  discardBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  declareBtn: {
    backgroundColor: '#E5C158',
  },
  declareBtnText: {
    color: '#052F1A',
    fontSize: 12,
    fontWeight: '800',
  },
  turnHelpBubble: {
    backgroundColor: '#1E6B47',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 15,
  },
  turnHelpText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  declaringTextStatus: {
    fontSize: 12,
    color: '#E5C158',
    fontWeight: 'bold',
  },
  waitingTurnText: {
    fontSize: 11,
    color: '#8AAB99',
    fontWeight: '600',
  },
  handScrollView: {
    flex: 1,
    backgroundColor: '#042816', // Darker felt table pocket for hand
  },
  handContentContainer: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    paddingBottom: 40,
  },
  groupContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  groupHeaderText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#8AAB99',
  },
  moveHereBtn: {
    backgroundColor: '#1B8A5A',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  moveHereText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: 'bold',
  },
  groupCardsScroll: {
    paddingVertical: 15, // buffer space to accommodate translateY animations
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardItemWrapper: {
    alignItems: 'center',
    marginRight: 4,
  },
  cardActionSubrow: {
    flexDirection: 'row',
    marginTop: 4,
    justifyContent: 'center',
  },
  microBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 4,
    marginHorizontal: 1,
  },
  microBtnText: {
    color: '#8AAB99',
    fontSize: 8,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#0E291B',
    borderColor: '#D4AF37',
    borderWidth: 2,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#E5C158',
    marginBottom: 15,
  },
  declareCardConfirmDisplay: {
    alignItems: 'center',
    marginVertical: 15,
  },
  modalText: {
    fontSize: 13,
    color: '#FFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubText: {
    fontSize: 12,
    color: '#8AAB99',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  modalLoader: {
    marginVertical: 15,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 6,
  },
  modalCancelBtn: {
    backgroundColor: '#3D5E4D',
  },
  modalCancelBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  modalConfirmBtn: {
    backgroundColor: '#E5C158',
  },
  modalConfirmBtnText: {
    color: '#052F1A',
    fontSize: 13,
    fontWeight: 'bold',
  }
});
