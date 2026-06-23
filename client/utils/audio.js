import { createAudioPlayer } from 'expo-audio';
import { useGameStore } from '../store/gameStore';

let lobbyPlayer = null;
const sfxPlayers = {};

/**
 * Starts playing the lobby background music (looping).
 * Respects the user's mute settings.
 */
export const playLobbyMusic = async () => {
  const { soundMuted } = useGameStore.getState();
  if (soundMuted) return;

  try {
    // If lobby player already exists, make sure it's playing
    if (lobbyPlayer) {
      lobbyPlayer.play();
      return;
    }

    // Create a new AudioPlayer instance for the lobby music
    lobbyPlayer = createAudioPlayer('https://ccrma.stanford.edu/~jos/mp3/pno-cs.mp3');
    lobbyPlayer.loop = true;
    
    // Set background volume directly as a property (0.0 to 1.0)
    lobbyPlayer.volume = 0.25;
    
    lobbyPlayer.play();
    console.log('[Audio BGM Engine] Lobby music started.');
  } catch (err) {
    console.log('[Audio BGM Engine] Error playing lobby music:', err);
  }
};

/**
 * Stops and pauses the lobby background music player without releasing native resource to keep instance alive.
 */
export const stopLobbyMusic = async () => {
  try {
    if (lobbyPlayer) {
      lobbyPlayer.pause();
      if (typeof lobbyPlayer.seekTo === 'function') {
        lobbyPlayer.seekTo(0);
      }
      console.log('[Audio BGM Engine] Lobby music paused.');
    }
  } catch (err) {
    console.log('[Audio BGM Engine] Error stopping lobby music:', err);
  }
};

/**
 * Plays a standalone sound effect from cache, with defensive error checks.
 * Supports friendly type names or remote URL strings.
 */
export const playSoundEffect = async (urlOrType) => {
  const { soundMuted } = useGameStore.getState();
  if (soundMuted) return;

  let finalUrl = urlOrType;
  
  // Resolve standard gameplay sound URLs
  if (urlOrType.includes('button-16') || urlOrType === 'button-16') {
    finalUrl = 'https://cdn.jsdelivr.net/gh/UnknownEnergy/solitaire@master/card-flip.mp3';
  } else if (urlOrType.includes('card-flip-1') || urlOrType === 'card_flip') {
    finalUrl = 'https://cdn.jsdelivr.net/gh/UnknownEnergy/solitaire@master/card-flip.mp3';
  } else if (urlOrType.includes('card-deal-1') || urlOrType === 'card_place') {
    finalUrl = 'https://cdn.jsdelivr.net/gh/UnknownEnergy/solitaire@master/card-place.mp3';
  } else if (urlOrType.includes('card-shuffle-1') || urlOrType === 'shuffle') {
    finalUrl = 'https://cdn.jsdelivr.net/gh/datturbomoon/Mystic-Draw@master/shuffle.mp3';
  } else if (
    urlOrType.includes('bell-ringing-05') || 
    urlOrType === 'turn' || 
    urlOrType === 'declare_success'
  ) {
    finalUrl = 'https://raw.githubusercontent.com/wesbos/Learn-Node/master/public/sound.mp3';
  }

  try {
    let player = sfxPlayers[finalUrl];
    if (!player) {
      player = createAudioPlayer(finalUrl);
      player.volume = 0.5; // Set volume directly as a property
      sfxPlayers[finalUrl] = player;
      console.log(`[Audio SFX Engine] Cached player for URL: ${finalUrl}`);
    }

    if (typeof player.seekTo === 'function') {
      player.seekTo(0);
    }
    player.play();
  } catch (err) {
    console.log('[Audio SFX Engine] Error playing sound effect:', err);
  }
};
