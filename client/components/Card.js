import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Platform, Animated, PanResponder } from 'react-native';

const SUIT_SYMBOLS = {
  'H': '♥',
  'D': '♦',
  'C': '♣',
  'S': '♠',
  'J': '★'
};

const SUIT_NAMES = {
  'H': 'Hearts',
  'D': 'Diamonds',
  'C': 'Clubs',
  'S': 'Spades',
  'J': 'Joker'
};

const VALUE_NAMES = {
  1: 'A',
  11: 'J',
  12: 'Q',
  13: 'K'
};

export default function Card({ card, isSelected, onPress, isWildJoker, style, onDragRelease, onDragStart, dragEnabled = true }) {
  if (!card) return null;

  const { suit, value, isPrintedJoker } = card;
  const isRed = suit === 'H' || suit === 'D';
  const symbol = SUIT_SYMBOLS[suit] || '';
  const displayValue = VALUE_NAMES[value] || value;

  const pan = useRef(new Animated.ValueXY()).current;
  const [isDragging, setIsDragging] = useState(false);

  // Keep props fresh to prevent stale closure bugs in PanResponder
  const propsRef = useRef({ card, dragEnabled, onDragStart, onDragRelease });
  propsRef.current = { card, dragEnabled, onDragStart, onDragRelease };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        if (!propsRef.current.dragEnabled) return false;
        // Capture only if dragged more than 5 pixels
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        setIsDragging(true);
        pan.setOffset({
          x: pan.x._value,
          y: pan.y._value
        });
        pan.setValue({ x: 0, y: 0 });
        if (propsRef.current.onDragStart) {
          propsRef.current.onDragStart();
        }
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (e, gestureState) => {
        setIsDragging(false);
        pan.flattenOffset();
        
        if (propsRef.current.onDragRelease) {
          propsRef.current.onDragRelease(propsRef.current.card.id, gestureState.moveX, gestureState.moveY, () => {
            // Spring back if dropped invalidly
            Animated.spring(pan, {
              toValue: { x: 0, y: 0 },
              useNativeDriver: false,
              friction: 7,
              tension: 40
            }).start();
          });
        } else {
          // Default spring back
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false
          }).start();
        }
      }
    })
  ).current;

  // Combine drag offset and selection height offset (-15px)
  const transformStyles = {
    transform: [
      { translateX: pan.x },
      { translateY: Animated.add(pan.y, isSelected ? -15 : 0) }
    ]
  };

  // Render printed joker card
  if (isPrintedJoker) {
    return (
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.cardContainer,
          transformStyles,
          style,
          isDragging && { zIndex: 999, elevation: 999 },
          isSelected && { zIndex: 10, elevation: 10 }
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onPress}
          style={[
            styles.card,
            styles.jokerCard,
            isSelected && styles.selectedCard,
          ]}
        >
          <Text style={styles.jokerText}>JOKER</Text>
          <Text style={styles.jokerSymbol}>★</Text>
          <Text style={styles.jokerTextBottom}>JOKER</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.cardContainer,
        transformStyles,
        style,
        isDragging && { zIndex: 999, elevation: 999 },
        isSelected && { zIndex: 10, elevation: 10 }
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        style={[
          styles.card,
          isRed ? styles.redCard : styles.blackCard,
          isSelected && styles.selectedCard,
        ]}
      >
        {/* Wild Joker Badge Indicator */}
        {isWildJoker && (
          <View style={styles.wildBadge}>
            <Text style={styles.wildBadgeText}>JOKER</Text>
          </View>
        )}

        {/* Top Left Rank and Suit */}
        <View style={styles.topLeft}>
          <Text style={[styles.cornerValue, isRed ? styles.redText : styles.blackText]}>
            {displayValue}
          </Text>
          <Text style={[styles.cornerSuit, isRed ? styles.redText : styles.blackText]}>
            {symbol}
          </Text>
        </View>

        {/* Center Large Suit Symbol */}
        <Text style={[styles.centerSymbol, isRed ? styles.redText : styles.blackText]}>
          {symbol}
        </Text>

        {/* Bottom Right Rank and Suit (Inverted) */}
        <View style={styles.bottomRight}>
          <Text style={[styles.cornerValue, isRed ? styles.redText : styles.blackText]}>
            {displayValue}
          </Text>
          <Text style={[styles.cornerSuit, isRed ? styles.redText : styles.blackText]}>
            {symbol}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 62,
    height: 94,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    padding: 6,
    justifyContent: 'space-between',
    borderColor: '#D4CBB5',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    position: 'relative',
    marginHorizontal: 3,
    ...Platform.select({
      web: {
        transition: 'transform 0.15s ease-in-out',
        userSelect: 'none',
      }
    })
  },
  jokerCard: {
    backgroundColor: '#F0F2F1',
    borderColor: '#BFC5C2',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardContainer: {
    position: 'relative',
    ...Platform.select({
      web: {
        userSelect: 'none',
      }
    })
  },
  selectedCard: {
    borderColor: '#E5C158', // Glowing gold border
    borderWidth: 2.5,
    shadowColor: '#E5C158',
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  redCard: {
    borderColor: '#FFD3D3',
  },
  blackCard: {
    borderColor: '#E2E2E2',
  },
  redText: {
    color: '#D12E2E', // Solid rich red
  },
  blackText: {
    color: '#1A1A1A', // Dark charcoal black
  },
  topLeft: {
    alignSelf: 'flex-start',
    alignItems: 'center',
  },
  bottomRight: {
    alignSelf: 'flex-end',
    alignItems: 'center',
    transform: [{ rotate: '180deg' }],
  },
  cornerValue: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 14,
  },
  cornerSuit: {
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: -2,
  },
  centerSymbol: {
    fontSize: 24,
    textAlign: 'center',
    fontWeight: 'bold',
    position: 'absolute',
    left: 0,
    right: 0,
    top: '32%',
  },
  jokerText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#555',
    letterSpacing: 1.5,
  },
  jokerTextBottom: {
    fontSize: 8,
    fontWeight: '800',
    color: '#555',
    letterSpacing: 1.5,
    transform: [{ rotate: '180deg' }],
  },
  jokerSymbol: {
    fontSize: 28,
    color: '#D12E2E',
  },
  wildBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#E5C158',
    paddingVertical: 1,
    paddingHorizontal: 3,
    borderRadius: 3,
    zIndex: 5,
  },
  wildBadgeText: {
    fontSize: 6,
    fontWeight: '900',
    color: '#052314',
    letterSpacing: 0.5,
  }
});
