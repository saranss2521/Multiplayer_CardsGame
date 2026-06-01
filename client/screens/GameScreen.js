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
  Modal,
  useWindowDimensions,
  ActivityIndicator
} from 'react-native';
import { useGameStore } from '../store/gameStore';
import Card from '../components/Card';

const playSound = (url) => {
  let finalUrl = url;
  if (url.includes('button-16')) {
    finalUrl = 'https://cdn.jsdelivr.net/gh/UnknownEnergy/solitaire@master/card-flip.mp3';
  } else if (url.includes('card-flip-1')) {
    finalUrl = 'https://cdn.jsdelivr.net/gh/UnknownEnergy/solitaire@master/card-flip.mp3';
  } else if (url.includes('card-deal-1')) {
    finalUrl = 'https://cdn.jsdelivr.net/gh/UnknownEnergy/solitaire@master/card-place.mp3';
  } else if (url.includes('card-shuffle-1')) {
    finalUrl = 'https://cdn.jsdelivr.net/gh/datturbomoon/Mystic-Draw@master/shuffle.mp3';
  } else if (url.includes('bell-ringing-05')) {
    finalUrl = 'https://cdn.jsdelivr.net/gh/cferdinandi/ding@master/ding.mp3';
  }

  if (Platform.OS === 'web' && typeof Audio !== 'undefined') {
    const audio = new Audio(finalUrl);
    audio.volume = 0.45;
    audio.play().catch((err) => console.log("Sound play blocked:", err));
  }
};

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

  const { width, height } = useWindowDimensions();
  const isPortrait = height > width;

  // Bounding box states for drop targets
  const [dropZones, setDropZones] = useState({
    discard: null,
    finish: null,
    groups: {}
  });

  const discardRef = React.useRef(null);
  const finishRef = React.useRef(null);
  const groupRefs = React.useRef([]);

  // Sync group refs length dynamically
  React.useEffect(() => {
    groupRefs.current = groupRefs.current.slice(0, myHandGroups.length);
  }, [myHandGroups]);

  const measureZone = (ref, name, groupIdx = null) => {
    if (ref && ref.current) {
      setTimeout(() => {
        ref.current?.measureInWindow((x, y, width, height) => {
          if (groupIdx !== null) {
            setDropZones(prev => ({
              ...prev,
              groups: {
                ...prev.groups,
                [groupIdx]: { x, y, width, height }
              }
            }));
          } else {
            setDropZones(prev => ({
              ...prev,
              [name]: { x, y, width, height }
            }));
          }
        });
      }, 150);
    }
  };

  const measureAllZones = () => {
    measureZone(discardRef, 'discard');
    measureZone(finishRef, 'finish');
    myHandGroups.forEach((group, idx) => {
      if (groupRefs.current[idx]) {
        measureZone({ current: groupRefs.current[idx] }, 'groups', idx);
      }
    });
  };

  const handleDragStart = () => {
    playSound('https://www.soundjay.com/misc/sounds/card-flip-1.mp3');
    measureAllZones();
  };

  const handleDragRelease = (cardId, moveX, moveY, resetCardPosition) => {
    // 1. Check Discard Drop Target
    const discardZone = dropZones.discard;
    if (
      discardZone &&
      moveX >= discardZone.x &&
      moveX <= discardZone.x + discardZone.width &&
      moveY >= discardZone.y &&
      moveY <= discardZone.y + discardZone.height
    ) {
      if (isActiveTurn && turnState === 'discard') {
        playSound('https://www.soundjay.com/misc/sounds/card-flip-1.mp3');
        discardCard(cardId);
        return;
      } else {
        Alert.alert('Turn Error', 'You can only discard during your discard turn.');
      }
    }

    // 2. Check Finish Slot Target
    const finishZone = dropZones.finish;
    if (
      finishZone &&
      moveX >= finishZone.x &&
      moveX <= finishZone.x + finishZone.width &&
      moveY >= finishZone.y &&
      moveY <= finishZone.y + finishZone.height
    ) {
      if (isActiveTurn && turnState === 'discard') {
        let foundCard = null;
        for (const g of myHandGroups) {
          foundCard = g.find(c => c.id === cardId);
          if (foundCard) break;
        }
        if (foundCard) {
          setChosenDeclareCard(foundCard);
          setConfirmDeclareVisible(true);
          resetCardPosition();
          return;
        }
      } else {
        Alert.alert('Turn Error', 'You can only declare during your discard turn.');
      }
    }

    // 3. Check Card Group Targets
    let targetGroupIdx = -1;
    for (const key in dropZones.groups) {
      const gZone = dropZones.groups[key];
      if (
        gZone &&
        moveX >= gZone.x &&
        moveX <= gZone.x + gZone.width &&
        moveY >= gZone.y &&
        moveY <= gZone.y + gZone.height
      ) {
        targetGroupIdx = parseInt(key);
        break;
      }
    }

    if (targetGroupIdx !== -1) {
      let sourceGroupIdx = -1;
      for (let i = 0; i < myHandGroups.length; i++) {
        if (myHandGroups[i].some(c => c.id === cardId)) {
          sourceGroupIdx = i;
          break;
        }
      }

      if (sourceGroupIdx !== -1 && sourceGroupIdx !== targetGroupIdx) {
        playSound('https://www.soundjay.com/misc/sounds/card-deal-1.mp3');
        moveCard(cardId, targetGroupIdx, 0);
        return;
      }
    }

    // If no target matches, snap back to initial spot
    playSound('https://www.soundjay.com/misc/sounds/card-deal-1.mp3');
    resetCardPosition();
  };

  // Find index of current client player in players array
  const myIndex = players.findIndex(p => p.username === username);
  const isActiveTurn = turnIndex === myIndex;
  const totalCardsInHand = myHandGroups.flat().length;

  const topDiscardCard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;

  // Handle drawing cards
  const handleDrawDeck = () => {
    if (!isActiveTurn) return;
    if (turnState !== 'draw') return;
    playSound('https://www.soundjay.com/misc/sounds/card-deal-1.mp3');
    drawCard('deck');
  };

  const handleDrawDiscard = () => {
    if (!isActiveTurn) return;
    if (turnState !== 'draw') return;
    playSound('https://www.soundjay.com/misc/sounds/card-deal-1.mp3');
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
    playSound('https://www.soundjay.com/misc/sounds/card-flip-1.mp3');
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
      playSound('https://www.soundjay.com/buttons/sounds/button-16.mp3');
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
          playSound('https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3');
          onNavigate('Results');
        } else {
          playSound('https://www.soundjay.com/misc/sounds/card-shuffle-1.mp3');
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
      if (winner === username) {
        playSound('https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3');
      } else {
        playSound('https://www.soundjay.com/misc/sounds/card-shuffle-1.mp3');
      }
      onNavigate('Results');
    }
  }, [roundEnded]);

  if (isPortrait) {
    return (
      <View style={styles.portraitContainer}>
        <View style={styles.portraitGlow} />
        <Text style={styles.portraitTitle}>ROYAL RUMMY</Text>
        <View style={styles.rotateIconContainer}>
          <Text style={styles.rotateEmoji}>🔄</Text>
        </View>
        <Text style={styles.portraitText}>Please rotate your device to Landscape to play!</Text>
        <Text style={styles.portraitSubText}>The casino card table is optimized for widescreen play.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 2. Wooden Table Border and Rim (Full Screen Layout) */}
      <View style={styles.tableRim}>
        {/* 3. Green Felt Inner Playground */}
        <View style={styles.feltTable}>
          {/* 1. Opponent Bar (Floated absolutely at the top) */}
          <View style={styles.opponentsCompactHeader}>
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
                    🂠 {isMe ? totalCardsInHand : player.cardCount}
                  </Text>
                  
                  {!player.connected ? (
                    <Text style={styles.disconnectedText}>OFF</Text>
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
                ⚠️ SELECT CARD OR DRAG IT TO FINISH SLOT
              </Text>
              <TouchableOpacity 
                style={styles.cancelDeclareBtn} 
                onPress={() => setDeclaringMode(false)}
              >
                <Text style={styles.cancelDeclareBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Table Center (Decks, Discard, Finish Slot) */}
          <View style={styles.tableCenter}>
            
            {/* Closed Deck + Wild Joker Stack */}
            <View style={styles.centerPileContainer}>
              <Text style={styles.pileLabel}>CLOSED DECK</Text>
              <View style={styles.deckStackWrapper}>
                {wildJokerCard && (
                  <View style={styles.wildJokerUnderCard}>
                    <Card 
                      card={wildJokerCard} 
                      isWildJoker={false}
                      isSelected={false}
                      dragEnabled={false}
                      onPress={() => {}}
                    />
                  </View>
                )}
                <TouchableOpacity 
                  activeOpacity={0.8}
                  onPress={handleDrawDeck}
                  disabled={!isActiveTurn || turnState !== 'draw'}
                  style={[
                    styles.closedDeckCover,
                    isActiveTurn && turnState === 'draw' && styles.drawGlow,
                    wildJokerCard && styles.closedDeckOffset
                  ]}
                >
                  <Text style={styles.deckBackPattern}>ROYAL</Text>
                  <Text style={styles.deckBackCount}>{deckCount} left</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Discard Pile */}
            <View style={styles.centerPileContainer}>
              <Text style={styles.pileLabel}>DISCARD PILE</Text>
              <View 
                ref={discardRef}
                onLayout={() => measureZone(discardRef, 'discard')}
                style={styles.discardZoneWrapper}
              >
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
                      dragEnabled={false}
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

            {/* Finish Slot */}
            <View style={styles.centerPileContainer}>
              <Text style={styles.pileLabel}>FINISH SLOT</Text>
              <View 
                ref={finishRef}
                onLayout={() => measureZone(finishRef, 'finish')}
                style={[
                  styles.finishSlotRect,
                  isActiveTurn && turnState === 'discard' && styles.finishSlotActive
                ]}
              >
                <Text style={styles.finishSlotText}>FINISH</Text>
                <Text style={styles.finishSlotSubtext}>SLOT</Text>
              </View>
            </View>

          </View>

          {/* 4. Controls and Player's Hand Row */}
          <View style={styles.handAreaContainer}>
            
            {/* Left Hand side Utility controls */}
            <View style={styles.sideControlsColumn}>
              <TouchableOpacity 
                style={[styles.sideControlBtn, styles.sortBtn]} 
                onPress={() => {
                  playSound('https://www.soundjay.com/misc/sounds/card-shuffle-1.mp3');
                  sortHand();
                }}
              >
                <Text style={styles.sideControlBtnText}>Sort</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[
                  styles.sideControlBtn, 
                  styles.groupBtn, 
                  selectedCardIds.length === 0 && styles.disabledBtn
                ]} 
                onPress={() => {
                  playSound('https://www.soundjay.com/misc/sounds/card-deal-1.mp3');
                  groupSelectedCards();
                }}
                disabled={selectedCardIds.length === 0}
              >
                <Text style={styles.sideControlBtnText}>Group</Text>
              </TouchableOpacity>
            </View>

            {/* Hand Groups Row (rendered horizontally side-by-side, no scroll hijacking) */}
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.handGroupsScrollView}
              contentContainerStyle={styles.handGroupsRowContent}
              onScrollEndDrag={measureAllZones}
              onMomentumScrollEnd={measureAllZones}
            >
              {myHandGroups.map((group, groupIdx) => {
                const stackWidth = group.length > 0 ? (group.length - 1) * 26 + 68 : 0;
                return (
                  <View 
                    key={groupIdx} 
                    ref={el => groupRefs.current[groupIdx] = el}
                    onLayout={() => measureZone({ current: groupRefs.current[groupIdx] }, 'groups', groupIdx)}
                    style={styles.groupContainer}
                  >
                    <View style={styles.groupHeaderRow}>
                      <Text style={styles.groupHeaderText}>G{groupIdx + 1}</Text>
                      
                      {selectedCardIds.length > 0 && (
                        <TouchableOpacity 
                          style={styles.moveHereBtn}
                          onPress={() => {
                            playSound('https://www.soundjay.com/misc/sounds/card-flip-1.mp3');
                            selectedCardIds.forEach(id => moveCard(id, groupIdx, 0));
                            clearSelection();
                          }}
                        >
                          <Text style={styles.moveHereText}>Move</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <View style={[styles.groupCardsStack, { width: stackWidth }]}>
                      {group.map((card, cardIdx) => {
                        const isSelected = selectedCardIds.includes(card.id);
                        const isWild = card.value === wildJokerValue;
                        const isLast = cardIdx === group.length - 1;
                        
                        return (
                          <Card 
                            key={card.id}
                            card={card}
                            isSelected={isSelected}
                            isWildJoker={isWild}
                            onPress={() => handleCardPress(card)}
                            onDragStart={handleDragStart}
                            onDragRelease={handleDragRelease}
                            style={!isLast ? { marginRight: -42 } : { marginRight: 0 }}
                          />
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {/* Right Hand side Action controls */}
            <View style={styles.sideControlsColumn}>
              {isActiveTurn && !isDeclaring ? (
                <View style={styles.activeTurnControls}>
                  {turnState === 'draw' ? (
                    <View style={styles.turnBubble}>
                      <Text style={styles.turnBubbleText}>Draw</Text>
                      <Text style={styles.turnBubbleTextSub}>Card</Text>
                    </View>
                  ) : (
                    <>
                      <TouchableOpacity 
                        style={[
                          styles.sideControlBtn, 
                          styles.discardBtn,
                          selectedCardIds.length !== 1 && styles.disabledBtn
                        ]} 
                        onPress={handleDiscard}
                        disabled={selectedCardIds.length !== 1}
                      >
                        <Text style={styles.sideControlBtnText}>Discard</Text>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={[styles.sideControlBtn, styles.declareBtn]} 
                        onPress={handleDeclareTrigger}
                      >
                        <Text style={styles.sideControlBtnTextDark}>Declare</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              ) : isActiveTurn && isDeclaring ? (
                <View style={styles.turnBubble}>
                  <Text style={styles.turnBubbleText}>Drag</Text>
                  <Text style={styles.turnBubbleTextSub}>Card</Text>
                </View>
              ) : (
                <View style={styles.turnBubbleOffline}>
                  <Text style={styles.turnBubbleTextOffline}>Wait...</Text>
                </View>
              )}
            </View>

          </View>

        </View>
      </View>

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
                <Card card={chosenDeclareCard} isSelected={false} isWildJoker={chosenDeclareCard.value === wildJokerValue} dragEnabled={false} />
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
  // Portrait locker styles
  portraitContainer: {
    flex: 1,
    backgroundColor: '#03170d', // Very dark green casino background
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  portraitGlow: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(229, 193, 88, 0.12)',
    filter: Platform.OS === 'web' ? 'blur(60px)' : undefined,
  },
  portraitTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#E5C158',
    letterSpacing: 2,
    marginBottom: 30,
    textAlign: 'center',
  },
  rotateIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  rotateEmoji: {
    fontSize: 40,
  },
  portraitText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  portraitSubText: {
    fontSize: 12,
    color: '#8AAB99',
    textAlign: 'center',
  },

  // Main landscape styles
  container: {
    flex: 1,
    backgroundColor: '#1b0e06', // Wooden floor background color
    padding: 2, // Minimal outer padding
    flexDirection: 'column',
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(90deg, rgba(0,0,0,0.15) 1px, transparent 1px)',
        backgroundSize: '80px 100%',
      }
    })
  },
  opponentsCompactHeader: {
    position: 'absolute',
    top: 4,
    left: 20,
    right: 20,
    height: 26, // Low-profile height
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: 14,
    paddingHorizontal: 8,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    zIndex: 10,
  },
  playerAvatarContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingVertical: 1,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderColor: 'transparent',
    borderWidth: 1.2,
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
    width: 18, // Compact avatar
    height: 18,
    borderRadius: 9,
    backgroundColor: '#1E6B47',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  meAvatarCircle: {
    backgroundColor: '#E5C158',
  },
  avatarLetter: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#FFF',
  },
  playerText: {
    fontSize: 10,
    color: '#A2C2B2',
    fontWeight: '600',
    marginRight: 6,
  },
  activePlayerText: {
    color: '#E5C158',
    fontWeight: 'bold',
  },
  cardCountText: {
    fontSize: 9,
    color: '#8AAB99',
  },
  turnTimerTick: {
    fontSize: 9,
    fontWeight: '900',
    color: '#E5C158',
    backgroundColor: '#000',
    paddingHorizontal: 3,
    borderRadius: 3,
    marginLeft: 4,
  },
  disconnectedText: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#FF6B6B',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 3,
    borderRadius: 2,
    marginLeft: 4,
  },
  errorBanner: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 6,
  },
  errorBannerText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  declareBanner: {
    backgroundColor: '#E5C158',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
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
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  cancelDeclareBtnText: {
    color: '#E5C158',
    fontSize: 10,
    fontWeight: 'bold',
  },

  // Wood border table style
  tableRim: {
    flex: 1,
    backgroundColor: '#522b16', // Wooden trim background
    borderRadius: 24, // Optimized roundness
    borderWidth: 6, // Sleek border width
    borderColor: '#3c1d0e', // Wood border shadow
    padding: 3, // Minimal trim padding
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  feltTable: {
    flex: 1,
    backgroundColor: '#0d562f',
    borderRadius: 18,
    paddingHorizontal: 6,
    paddingBottom: 4,
    paddingTop: 34, // Clear space for top floated HUD
    flexDirection: 'column',
    justifyContent: 'space-between',
    borderColor: 'rgba(229, 193, 88, 0.15)',
    borderWidth: 1.5,
    position: 'relative',
    ...Platform.select({
      web: {
        backgroundImage: 'radial-gradient(circle, #0e5e32 0%, #06341b 100%)',
        boxShadow: 'inset 0 0 50px rgba(0,0,0,0.6)',
      }
    })
  },
  tableCenter: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    flex: 1.2, // Allocate a bit more space for piles
  },
  centerPileContainer: {
    alignItems: 'center',
  },
  pileLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#8AAB99',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  deckStackWrapper: {
    width: 80,
    height: 94,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wildJokerUnderCard: {
    position: 'absolute',
    left: 0,
    top: 0,
    opacity: 0.95,
    transform: [{ rotate: '-10deg' }],
  },
  closedDeckCover: {
    width: 62,
    height: 94,
    borderRadius: 8,
    backgroundColor: '#8b0000',
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
  closedDeckOffset: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
  },
  deckBackPattern: {
    fontSize: 9,
    color: '#E5C158',
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  deckBackCount: {
    fontSize: 8,
    color: '#FFF',
    fontWeight: '500',
    marginTop: 6,
  },
  drawGlow: {
    shadowColor: '#E5C158',
    shadowOpacity: 0.8,
    shadowRadius: 10,
    borderColor: '#FFF',
    borderWidth: 2,
    transform: [{ scale: 1.03 }],
  },
  discardZoneWrapper: {
    width: 62,
    height: 94,
    borderRadius: 8,
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
    fontSize: 9,
    color: '#8AAB99',
    fontWeight: 'bold',
  },
  finishSlotRect: {
    width: 62,
    height: 94,
    borderRadius: 8,
    borderStyle: 'dashed',
    borderColor: 'rgba(229, 193, 88, 0.4)',
    borderWidth: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  finishSlotActive: {
    borderColor: '#E5C158',
    backgroundColor: 'rgba(229, 193, 88, 0.08)',
  },
  finishSlotText: {
    fontSize: 10,
    color: '#E5C158',
    fontWeight: '900',
    letterSpacing: 1,
  },
  finishSlotSubtext: {
    fontSize: 9,
    color: '#E5C158',
    fontWeight: '800',
    marginTop: 2,
  },

  // Hand area and controls layout
  handAreaContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 6,
    flex: 1.5, // Hand takes up slightly more vertical space
  },
  sideControlsColumn: {
    width: 70,
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    paddingBottom: 10,
  },
  sideControlBtn: {
    width: 62,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  sortBtn: {
    backgroundColor: '#385C48',
  },
  groupBtn: {
    backgroundColor: '#274D7A',
  },
  discardBtn: {
    backgroundColor: '#8B0000',
  },
  declareBtn: {
    backgroundColor: '#E5C158',
  },
  disabledBtn: {
    opacity: 0.35,
  },
  sideControlBtnText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  sideControlBtnTextDark: {
    color: '#052F1A',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  activeTurnControls: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  turnBubble: {
    backgroundColor: '#1E6B47',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    width: 62,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  turnBubbleText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '900',
  },
  turnBubbleTextSub: {
    color: '#E5C158',
    fontSize: 8,
    fontWeight: 'bold',
    marginTop: 1,
  },
  turnBubbleOffline: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 10,
    width: 62,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  turnBubbleTextOffline: {
    color: '#8AAB99',
    fontSize: 10,
    fontWeight: 'bold',
  },

  // Hand groups fanning list
  handGroupsRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    height: '100%',
    paddingHorizontal: 4,
  },
  handGroupsScrollView: {
    flex: 1,
    height: '100%',
  },
  handGroupsRowContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 4,
    minWidth: '100%',
  },
  groupContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 1.2,
    borderRadius: 12,
    padding: 6,
    marginHorizontal: 3,
    height: 124,
    minWidth: 72, // Ensure it expands naturally without squashing cards
    flexShrink: 0, // Ensure it never collapses under flex constraints
    justifyContent: 'space-between',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(5px)',
      }
    })
  },
  groupHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    height: 16,
  },
  groupHeaderText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#8AAB99',
  },
  moveHereBtn: {
    backgroundColor: '#1B8A5A',
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 4,
  },
  moveHereText: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: 'bold',
  },
  groupCardsStack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingLeft: 4,
    height: 94,
  },

  // Modal styles
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
