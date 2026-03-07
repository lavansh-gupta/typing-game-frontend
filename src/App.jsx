import React, { useState, useEffect, useRef } from 'react';
import { Send, Copy, Check, Play, RotateCcw } from 'lucide-react';
import io from 'socket.io-client';

const GAME_TIME_LIMIT_SECONDS = 60;
const getTimeLimitForMode = (mode) => (mode === 'sprint' ? 60 : null);

const App = () => {
  // ===== SOCKET.IO SETUP =====
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const audioContextRef = useRef(null);
  const timeUpPlayedRef = useRef(false);
  const winningTonePlayedRef = useRef(false);

  // ===== COMPONENT STATES =====
  const [screen, setScreen] = useState('home');
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [currentRoom, setCurrentRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [gameText, setGameText] = useState('');
  const [userInput, setUserInput] = useState('');
  const [selectedGameMode, setSelectedGameMode] = useState('sprint');
  const [isRoomHost, setIsRoomHost] = useState(false);
  const [gameTimeLimit, setGameTimeLimit] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameTime, setGameTime] = useState(0);
  const [results, setResults] = useState(null);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const inputRef = useRef(null);
  const typingTextContainerRef = useRef(null);
  const confettiParticlesRef = useRef(
    Array.from({ length: 64 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 2.8 + Math.random() * 2.6,
      drift: (Math.random() - 0.5) * 180,
      size: 8 + Math.random() * 10,
      color: ['#22d3ee', '#84cc16', '#f59e0b', '#f43f5e', '#a78bfa', '#ffffff'][i % 6]
    }))
  );
//hehe remember never give up bro 

  const ensureAudioContext = () => {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioCtx();
    }

    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }

    return audioContextRef.current;
  };

  const playTone = ({ frequency, duration = 0.12, type = 'sine', volume = 0.12 }) => {
    const audioCtx = ensureAudioContext();
    if (!audioCtx) return;

    const startAt = audioCtx.currentTime;
    const endAt = startAt + duration;
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    oscillator.connect(gain);
    gain.connect(audioCtx.destination);
    oscillator.start(startAt);
    oscillator.stop(endAt + 0.02);
  };

  const playWrongKeyBeep = () => {
    playTone({ frequency: 220, duration: 0.08, type: 'square', volume: 0.09 });
  };

  const playWinningTone = () => {
    playTone({ frequency: 523.25, duration: 0.11, type: 'triangle', volume: 0.1 });
    setTimeout(() => playTone({ frequency: 659.25, duration: 0.11, type: 'triangle', volume: 0.1 }), 120);
    setTimeout(() => playTone({ frequency: 783.99, duration: 0.14, type: 'triangle', volume: 0.11 }), 240);
  };

  const playTimeUpTone = () => {
    playTone({ frequency: 329.63, duration: 0.14, type: 'sawtooth', volume: 0.1 });
    setTimeout(() => playTone({ frequency: 277.18, duration: 0.16, type: 'sawtooth', volume: 0.1 }), 160);
  };

  const applyMode = (mode) => {
    const nextMode = mode || 'sprint';
    setSelectedGameMode(nextMode);
    setGameTimeLimit(getTimeLimitForMode(nextMode));
  };

  const handleModeSelect = (mode) => {
    if (!isRoomHost || !currentRoom) return;
    if (!connected) {
      setErrorMessage('Backend server is not connected. Start backend on port 5000.');
      return;
    }

    socketRef.current.emit('setGameMode', {
      roomCode: currentRoom,
      gameMode: mode
    }, (response) => {
      if (response.success) {
        applyMode(response.gameMode || mode);
        setScreen('waiting');
        setErrorMessage('');
      } else {
        setErrorMessage(response.error);
      }
    });
  };

  // ===== INITIALIZE SOCKET CONNECTION =====
  useEffect(() => {
    const configuredServerUrl = import.meta.env.VITE_SERVER_URL?.trim();
    const isLocalHost =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const serverUrl = configuredServerUrl || (isLocalHost ? 'http://localhost:5000' : null);

    if (!serverUrl) {
      setErrorMessage('Server URL is not configured. Set VITE_SERVER_URL in frontend deployment.');
      return;
    }

    // Connect to backend server
    socketRef.current = io(serverUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    // Connected to server
    socketRef.current.on('connect', () => {
      console.log('✅ Connected to server');
      setConnected(true);
    });

    // Disconnected from server
    socketRef.current.on('disconnect', () => {
      console.log('❌ Disconnected from server');
      setConnected(false);
    });

    socketRef.current.on('connect_error', (err) => {
      console.error('Socket connection error:', err?.message || err);
      setErrorMessage(`Unable to connect to server: ${serverUrl}`);
    });

    // ===== LISTEN FOR SERVER EVENTS =====

    // Event: Player joined room
    socketRef.current.on('playerJoined', (data) => {
      console.log('🟢 playerJoined event:', data);
      setPlayers(data.players);
      if (data.gameMode) {
        applyMode(data.gameMode);
      }
      setErrorMessage('');
    });

    socketRef.current.on('gameModeUpdated', (data) => {
      if (data.gameMode) {
        applyMode(data.gameMode);
      }
    });

    // Event: Game started
    socketRef.current.on('gameStarted', (data) => {
      console.log('🎮 gameStarted event');
      setGameText(data.text);
      const modeFromServer = data.gameMode || 'sprint';
      applyMode(modeFromServer);
      setGameTime(0);
      setUserInput('');
      if (typingTextContainerRef.current) {
        typingTextContainerRef.current.scrollTop = 0;
      }
      timeUpPlayedRef.current = false;
      winningTonePlayedRef.current = false;
      // Countdown 3 seconds then show game screen
      setTimeout(() => {
        setGameStarted(true);
        setScreen('game');
      }, 3000);
    });

    // Event: Players progress (live updates - 10x per second)
    socketRef.current.on('playersProgress', (data) => {
      console.log('📊 playersProgress event');
      setPlayers(data.players);
      if (data.gameMode) {
        applyMode(data.gameMode);
      }
    });

    // Event: Someone finished
    socketRef.current.on('playerFinished', (data) => {
      console.log('🏁 playerFinished event:', data);
      // Optional: Show toast notification
    });

    // Event: Race complete (all players finished)
    socketRef.current.on('raceComplete', (data) => {
      console.log('🎉 raceComplete event:', data);
      setResults(data.results);
      if (data.gameMode) {
        applyMode(data.gameMode);
      }
      setGameStarted(false);
      setScreen('results');
    });

    // Event: Player left
    socketRef.current.on('playerLeft', (data) => {
      console.log('👤 playerLeft event:', data);
      setPlayers(data.players);
      if (data.gameMode) {
        applyMode(data.gameMode);
      }
      setErrorMessage(data.message);
    });

    return () => {
      socketRef.current?.disconnect();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  // ===== SEND TYPING PROGRESS TO SERVER =====
  useEffect(() => {
    if (!gameStarted || !currentRoom) return;

    // Throttle to 50ms intervals
    const timer = setTimeout(() => {
      socketRef.current?.emit('typingProgress', {
        roomCode: currentRoom,
        typed: userInput,
        characterIndex: userInput.length
      });
    }, 50);

    return () => clearTimeout(timer);
  }, [userInput, gameStarted, currentRoom]);

  useEffect(() => {
    const container = typingTextContainerRef.current;
    if (!container || !gameText.length || screen !== 'game') return;
    if (userInput.length === 0) {
      container.scrollTop = 0;
      return;
    }

    const activeIndex = Math.min(userInput.length, Math.max(gameText.length - 1, 0));
    const activeChar = container.querySelector(`[data-char-index="${activeIndex}"]`);
    if (!activeChar) return;

    const lineHeight = parseFloat(window.getComputedStyle(container).lineHeight) || 32;
    const topBuffer = lineHeight * 1.8;

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeChar.getBoundingClientRect();
    const charTop = activeRect.top - containerRect.top + container.scrollTop;
    const nextScrollTop = charTop - topBuffer;

    const maxScrollTop = container.scrollHeight - container.clientHeight;
    const clamped = Math.max(0, Math.min(maxScrollTop, nextScrollTop));
    container.scrollTop = Math.max(container.scrollTop, clamped);
  }, [userInput, gameText, screen]);

  // ===== GAME TIMER =====
  useEffect(() => {
    if (!gameStarted) return;
    const interval = setInterval(() => {
      setGameTime(t => t + 0.1);
    }, 100);
    return () => clearInterval(interval);
  }, [gameStarted]);

  useEffect(() => {
    if (!gameStarted || timeUpPlayedRef.current) return;
    if (selectedGameMode === 'sprint' && gameTime >= (gameTimeLimit || GAME_TIME_LIMIT_SECONDS)) {
      playTimeUpTone();
      timeUpPlayedRef.current = true;
    }
  }, [gameStarted, gameTime, selectedGameMode, gameTimeLimit]);

  useEffect(() => {
    if (!results || winningTonePlayedRef.current) return;
    const winner = results[0];
    if (winner?.name === playerName) {
      playWinningTone();
      winningTonePlayedRef.current = true;
    }
  }, [results, playerName]);

  // ===== CALCULATIONS =====
  const calculateWPM = () => {
    if (gameTime < 0.016) return 0;
    const correctChars = userInput.length;
    const minutes = gameTime / 60;
    return Math.round((correctChars / 5) / minutes);
  };

  const calculateAccuracy = () => {
    if (userInput.length === 0) return 0;
    let correct = 0;
    for (let i = 0; i < userInput.length && i < gameText.length; i++) {
      if (userInput[i] === gameText[i]) correct++;
    }
    return Math.round((correct / userInput.length) * 100);
  };

  const calculateProgressPercent = () => {
    if (!gameText.length) return 0;
    return Math.min(100, Math.round((userInput.length / gameText.length) * 100));
  };

  const renderTextWithCharLevelHighlight = () => {
    if (!gameText) return null;

    return (
      <>
        {gameText.split('').map((char, charIndex) => {
          let color = 'text-gray-400';
          if (charIndex < userInput.length) {
            color = userInput[charIndex] === char ? 'text-lime-400' : 'text-red-400';
          }

          return (
            <span
              key={`char-${charIndex}`}
              className={color}
              data-char-index={charIndex}
            >
              {char}
            </span>
          );
        })}

        {userInput.length > gameText.length && (
          <span className="text-red-400">
            {userInput.slice(gameText.length)}
          </span>
        )}
      </>
    );
  };

  // ===== HOME SCREEN =====
  const HomeScreen = () => (
    <div className="min-h-screen bg-black text-white overflow-hidden relative">
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(0, 255, 136, .05) 25%, rgba(0, 255, 136, .05) 26%, transparent 27%, transparent 74%, rgba(0, 255, 136, .05) 75%, rgba(0, 255, 136, .05) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(0, 255, 136, .05) 25%, rgba(0, 255, 136, .05) 26%, transparent 27%, transparent 74%, rgba(0, 255, 136, .05) 75%, rgba(0, 255, 136, .05) 76%, transparent 77%, transparent)',
          backgroundSize: '50px 50px'
        }}></div>
      </div>

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4">
        <div className="text-center mb-12 animate-pulse" style={{
          textShadow: '0 0 30px rgba(0, 255, 136, 0.8), 0 0 60px rgba(0, 255, 255, 0.5)'
        }}>
          <h1 className="text-7xl md:text-8xl font-black mb-2" style={{
            fontFamily: 'monospace',
            letterSpacing: '-0.02em'
          }}>
            TYPE
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-lime-400 to-cyan-400">
              RUSH
            </span>
          </h1>
          <p className="text-lg text-gray-400 font-light tracking-widest">REAL-TIME MULTIPLAYER RACING</p>
          
          {/* CONNECTION STATUS */}
          <p className={`text-sm mt-4 font-semibold ${connected ? 'text-lime-400' : 'text-red-400'}`}>
            {connected ? '🟢 Connected to Server' : '🔴 Connecting...'}
          </p>
        </div>

        <div className="w-full max-w-md">
          <input
            type="text"
            placeholder="Enter your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="w-full px-6 py-3 mb-4 bg-gray-900 border-2 border-cyan-400/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-lime-400 transition-all"
            onKeyDown={(e) => e.key === 'Enter' && playerName.trim() && setScreen('lobby')}
          />
          <button
            onClick={() => playerName.trim() && setScreen('lobby')}
            disabled={!playerName.trim()}
            className="w-full py-3 bg-gradient-to-r from-cyan-500 to-lime-500 text-black font-bold rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            START RACING
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-16 max-w-2xl">
          {['🏎️ 1v1 Races', '⚡ Real-time WPM', '🏆 Global Leaderboard', '📊 Live Stats', '🎯 Ranked Mode', '🌍 Multiplayer'].map((feature, i) => (
            <div key={i} className="p-4 bg-gray-900/50 border border-cyan-400/30 rounded-lg text-center text-sm">
              {feature}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ===== LOBBY SCREEN =====
  const LobbyScreen = () => (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => setScreen('home')}
            className="text-cyan-400 hover:text-lime-400 transition mb-4"
          >
            ← Back
          </button>
          <h2 className="text-4xl font-black mb-2">LOBBY</h2>
          <p className="text-gray-400">Find your opponent or create a new race</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* CREATE ROOM */}
          <div className="bg-gray-900 border-2 border-cyan-400/50 rounded-lg p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span className="text-lime-400">+</span> CREATE ROOM
            </h3>
            <button
              onClick={() => {
                if (!connected) {
                  setErrorMessage('Backend server is not connected. Start backend on port 5000.');
                  return;
                }
                // EMIT: createRoom to server
                socketRef.current.emit('createRoom', { playerName }, (response) => {
                  if (response.success) {
                    console.log('✅ Room created:', response.room.roomCode);
                    setCurrentRoom(response.room.roomCode);
                    setPlayers(response.room.players);
                    setIsRoomHost(true);
                    const mode = response.room.gameMode || 'sprint';
                    applyMode(mode);
                    setScreen('modeSelection');
                    setErrorMessage('');
                  } else {
                    console.error('❌ Error:', response.error);
                    setErrorMessage(response.error);
                  }
                });
              }}
              className="w-full py-3 bg-gradient-to-r from-lime-500 to-cyan-500 text-black font-bold rounded-lg hover:shadow-lg hover:shadow-lime-500/50 transition-all"
            >
              Create & Wait
            </button>
            <p className="text-gray-400 text-sm mt-4">You'll be the host. Other players can join with your room code.</p>
          </div>

          {/* JOIN ROOM */}
          <div className="bg-gray-900 border-2 border-cyan-400/50 rounded-lg p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span className="text-cyan-400">→</span> JOIN ROOM
            </h3>
            <input
              type="text"
              placeholder="Room Code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="w-full px-4 py-2 bg-gray-800 border border-cyan-400/30 rounded mb-3 text-white placeholder-gray-500 focus:outline-none focus:border-lime-400"
              maxLength="6"
            />
            <button
              onClick={() => {
                if (roomCode) {
                  if (!connected) {
                    setErrorMessage('Backend server is not connected. Start backend on port 5000.');
                    return;
                  }
                  // EMIT: joinRoom to server
                  socketRef.current.emit('joinRoom', { roomCode, playerName }, (response) => {
                    if (response.success) {
                      console.log('✅ Joined room:', roomCode);
                      setCurrentRoom(roomCode);
                      setPlayers(response.room.players);
                      setIsRoomHost(false);
                      const mode = response.room.gameMode || 'sprint';
                      applyMode(mode);
                      setScreen('waiting');
                      setErrorMessage('');
                    } else {
                      console.error('❌ Error:', response.error);
                      setErrorMessage(response.error);
                    }
                  });
                }
              }}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-lime-500 text-black font-bold rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all disabled:opacity-50"
              disabled={!roomCode}
            >
              Join
            </button>
            <p className="text-gray-400 text-sm mt-4">Get a room code from a friend and join their race.</p>
          </div>
        </div>

        {/* ERROR MESSAGE */}
        {errorMessage && (
          <div className="mt-6 p-4 bg-red-900/30 border border-red-500 rounded text-red-400 text-center">
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  );

  // ===== MODE SELECTION SCREEN =====
  const ModeSelectionScreen = () => (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => setScreen('waiting')}
          className="text-cyan-400 hover:text-lime-400 transition mb-8"
        >
          ← Back
        </button>

        <div className="mb-8">
          <h2 className="text-4xl font-black mb-2">SELECT GAME MODE</h2>
          <p className="text-gray-400">
            {isRoomHost ? 'Choose your typing challenge!' : 'Only room creator can choose mode.'}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div
            onClick={() => {
              if (!isRoomHost) return;
              handleModeSelect('sprint');
            }}
            className={`p-6 rounded-lg border-2 transition transform ${
              isRoomHost ? 'cursor-pointer hover:scale-105' : 'cursor-not-allowed opacity-70'
            } ${
              selectedGameMode === 'sprint'
                ? 'border-lime-400 bg-lime-400/10'
                : 'border-cyan-400/50 bg-gray-900 hover:border-cyan-400'
            }`}
          >
            <h3 className="text-2xl font-bold mb-3 text-lime-400">SPRINT</h3>
            <div className="space-y-2 mb-4">
              <p className="text-gray-400 text-sm"><span className="font-semibold">Duration:</span> 1 minute</p>
              <p className="text-gray-400 text-sm"><span className="font-semibold">Text:</span> 3-4 lines</p>
            </div>
            <p className="text-gray-500 text-xs mb-4">Lightning-fast race focused on SPEED. Type as quick as you can!</p>
            <div className="bg-black/50 p-3 rounded border border-lime-400/30">
              <p className="text-lime-400 text-xs font-semibold">Highest WPM wins!</p>
            </div>
          </div>

          <div
            onClick={() => {
              if (!isRoomHost) return;
              handleModeSelect('marathon');
            }}
            className={`p-6 rounded-lg border-2 transition transform ${
              isRoomHost ? 'cursor-pointer hover:scale-105' : 'cursor-not-allowed opacity-70'
            } ${
              selectedGameMode === 'marathon'
                ? 'border-cyan-400 bg-cyan-400/10'
                : 'border-cyan-400/50 bg-gray-900 hover:border-cyan-400'
            }`}
          >
            <h3 className="text-2xl font-bold mb-3 text-cyan-400">MARATHON</h3>
            <div className="space-y-2 mb-4">
              <p className="text-gray-400 text-sm"><span className="font-semibold">Duration:</span> No limit</p>
              <p className="text-gray-400 text-sm"><span className="font-semibold">Text:</span> 2-3 paragraphs</p>
            </div>
            <p className="text-gray-500 text-xs mb-4">Longer race focused on ACCURACY. Quality over speed!</p>
            <div className="bg-black/50 p-3 rounded border border-cyan-400/30">
              <p className="text-cyan-400 text-xs font-semibold">First to finish wins!</p>
            </div>
          </div>

          <div
            onClick={() => {
              if (!isRoomHost) return;
              handleModeSelect('endless');
            }}
            className={`p-6 rounded-lg border-2 transition transform ${
              isRoomHost ? 'cursor-pointer hover:scale-105' : 'cursor-not-allowed opacity-70'
            } ${
              selectedGameMode === 'endless'
                ? 'border-purple-400 bg-purple-400/10'
                : 'border-cyan-400/50 bg-gray-900 hover:border-cyan-400'
            }`}
          >
            <h3 className="text-2xl font-bold mb-3 text-purple-400">ENDLESS</h3>
            <div className="space-y-2 mb-4">
              <p className="text-gray-400 text-sm"><span className="font-semibold">Duration:</span> No limit</p>
              <p className="text-gray-400 text-sm"><span className="font-semibold">Text:</span> 20 paragraphs</p>
            </div>
            <p className="text-gray-500 text-xs mb-4">Ultimate endurance challenge! Type as much as you can!</p>
            <div className="bg-black/50 p-3 rounded border border-purple-400/30">
              <p className="text-purple-400 text-xs font-semibold">Most progress wins!</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ===== WAITING SCREEN =====
  const WaitingScreen = () => (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => setScreen('lobby')}
          className="text-cyan-400 hover:text-lime-400 transition mb-8"
        >
          ← Back
        </button>

        <div className="bg-gray-900 border-2 border-cyan-400/50 rounded-lg p-8">
          <h2 className="text-3xl font-bold mb-8">Room Code</h2>
          
          <div className="mb-8 p-6 bg-black/50 border-2 border-lime-400/50 rounded-lg">
            <p className="text-gray-400 text-sm mb-2">SHARE THIS CODE</p>
            <div className="flex items-center gap-3">
              <span className="text-4xl font-black tracking-widest text-lime-400">{currentRoom}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(currentRoom);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="p-2 hover:bg-gray-800 rounded transition"
              >
                {copied ? <Check className="text-green-400" /> : <Copy className="text-gray-400" />}
              </button>
            </div>
          </div>

          <div className="mb-6 p-4 bg-gray-800/50 border border-cyan-400/30 rounded">
            <p className="text-gray-400 text-sm mb-2">GAME MODE</p>
            <div className="flex items-center gap-3">
              {selectedGameMode === 'sprint' && (
                <>
                  <span className="text-2xl"></span>
                  <span className="text-lg font-bold text-lime-400">SPRINT - 1 Minute</span>
                </>
              )}
              {selectedGameMode === 'marathon' && (
                <>
                  <span className="text-2xl">🏃</span>
                  <span className="text-lg font-bold text-cyan-400">MARATHON - No Timer</span>
                </>
              )}
              {selectedGameMode === 'endless' && (
                <>
                  <span className="text-2xl"></span>
                  <span className="text-lg font-bold text-purple-400">ENDLESS - No Timer</span>
                </>
              )}
            </div>
            <p className="text-gray-400 text-xs mt-2">
              {selectedGameMode === 'sprint' && 'Speed race - who types fastest?'}
              {selectedGameMode === 'marathon' && 'Accuracy race - first to finish wins!'}
              {selectedGameMode === 'endless' && 'Endurance race - who types the most?'}
            </p>
          </div>

          <h3 className="text-xl font-bold mb-4">PLAYERS ({players.length})</h3>
          <div className="space-y-2 mb-8">
            {players.map((player, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-cyan-400/20">
                <div className="w-3 h-3 rounded-full bg-lime-400 animate-pulse"></div>
                <span className="font-semibold">{player.name}</span>
              </div>
            ))}
          </div>

          {isRoomHost ? (
            <button
              onClick={() => {
                if (!connected) {
                  setErrorMessage('Backend server is not connected. Start backend on port 5000.');
                  return;
                }
                // EMIT: startGame to server
                socketRef.current.emit('startGame', {
                  roomCode: currentRoom,
                  gameMode: selectedGameMode
                }, (response) => {
                  if (response.success) {
                    console.log('Game starting in', selectedGameMode, 'mode!');
                    // Server will emit 'gameStarted' event
                    // Listener above will handle showing game screen
                  } else {
                    console.error('❌ Error:', response.error);
                    setErrorMessage(response.error);
                  }
                });
              }}
              className="w-full py-4 bg-gradient-to-r from-cyan-500 to-lime-500 text-black font-bold text-lg rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all flex items-center justify-center gap-2"
            >
              <Play size={20} />
              START RACE
              {selectedGameMode === 'sprint' && ' (1 MIN)'}
              {selectedGameMode === 'marathon' && ' (MARATHON)'}
              {selectedGameMode === 'endless' && ' (ENDLESS)'}
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="w-full py-4 bg-gray-800 border border-cyan-400/40 text-gray-400 font-bold text-lg rounded-lg cursor-not-allowed"
            >
              WAITING FOR HOST TO START
            </button>
          )}

          <p className="text-gray-400 text-sm mt-4 text-center">Waiting for {players.length < 2 ? 'opponent' : 'host to start'}</p>
        </div>
      </div>
    </div>
  );

  // ===== GAME SCREEN =====
  const GameScreen = () => {
    const progress = calculateProgressPercent();
    const wpm = calculateWPM();
    const accuracy = calculateAccuracy();
    const timeRemaining = selectedGameMode === 'sprint'
      ? Math.max(0, (gameTimeLimit || GAME_TIME_LIMIT_SECONDS) - gameTime)
      : 0;
    const isTimeUp = selectedGameMode === 'sprint' && gameTime >= (gameTimeLimit || GAME_TIME_LIMIT_SECONDS);

    return (
      <div className="min-h-screen bg-black text-white p-6">
        <div className="max-w-4xl mx-auto">
          {selectedGameMode === 'sprint' && (
            <div className="mb-4 p-3 bg-lime-400/10 border border-lime-400/50 rounded text-center">
              <p className={`text-xl font-bold ${isTimeUp ? 'text-red-400' : 'text-lime-400'}`}>
                {isTimeUp ? "TIME'S UP!" : `${timeRemaining.toFixed(0)}s remaining`}
              </p>
            </div>
          )}
          {selectedGameMode === 'marathon' && (
            <div className="mb-4 p-3 bg-cyan-400/10 border border-cyan-400/50 rounded text-center">
              <p className="text-cyan-400 font-semibold">
                🏃 Marathon Mode - Accuracy Focused (No time limit)
              </p>
            </div>
          )}
          {selectedGameMode === 'endless' && (
            <div className="mb-4 p-3 bg-purple-400/10 border border-purple-400/50 rounded text-center">
              <p className="text-purple-400 font-semibold">
                Endless Mode - Type as much as you can!
              </p>
            </div>
          )}

          {/* STATS BAR */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-gray-900 border border-cyan-400/30 rounded p-4">
              <p className="text-gray-400 text-sm">WPM</p>
              <p className="text-3xl font-black text-cyan-400">{wpm}</p>
            </div>
            <div className="bg-gray-900 border border-cyan-400/30 rounded p-4">
              <p className="text-gray-400 text-sm">ACCURACY</p>
              <p className="text-3xl font-black text-lime-400">{accuracy}%</p>
            </div>
            <div className="bg-gray-900 border border-cyan-400/30 rounded p-4">
              <p className="text-gray-400 text-sm">
                {selectedGameMode === 'sprint' ? 'TIME' : 'PROGRESS'}
              </p>
              <p className="text-3xl font-black text-purple-400">
                {selectedGameMode === 'sprint'
                  ? `${gameTime.toFixed(1)}s`
                  : `${progress}%`
                }
              </p>
            </div>
          </div>

          {/* RACE VISUAL - PROGRESS BARS */}
          <div className="bg-gray-900 border-2 border-cyan-400/50 rounded-lg p-6 mb-8">
            <h3 className="text-sm font-bold text-gray-400 mb-4 uppercase">RACE</h3>
            <div className="space-y-4">
              {players.map((player, i) => (
                <div key={i}>
                  <div className="flex justify-between mb-2">
                    <span className="font-semibold text-sm">{player.name}</span>
                    <span className="text-cyan-400 text-sm">{player.progress}%</span>
                  </div>
                  <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden border border-cyan-400/20">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-lime-500 transition-all duration-100"
                      style={{ width: `${player.progress}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TEXT TO TYPE */}
          <div className="bg-gray-900 border-2 border-cyan-400/50 rounded-lg p-8 mb-8">
            <div
              ref={typingTextContainerRef}
              className="text-center text-xl leading-relaxed font-mono text-gray-300 mb-6 max-h-32 overflow-y-auto py-5"
            >
              {renderTextWithCharLevelHighlight()}
            </div>

            <input
              ref={inputRef}
              type="text"
              value={userInput}
              onChange={(e) => {
                let nextInput = e.target.value;

                if (selectedGameMode === 'sprint') {
                  let validPrefixLength = 0;
                  while (
                    validPrefixLength < nextInput.length &&
                    validPrefixLength < gameText.length &&
                    nextInput[validPrefixLength] === gameText[validPrefixLength]
                  ) {
                    validPrefixLength++;
                  }

                  if (nextInput.length > validPrefixLength) {
                    playWrongKeyBeep();
                  }
                  nextInput = nextInput.slice(0, validPrefixLength);
                } else if (nextInput.length > userInput.length) {
                  const lastTypedIndex = nextInput.length - 1;
                  if (gameText[lastTypedIndex] !== nextInput[lastTypedIndex]) {
                    playWrongKeyBeep();
                  }
                }

                setUserInput(nextInput);
              }}
              autoFocus
              disabled={isTimeUp}
              className="w-full px-6 py-4 bg-black border-2 border-cyan-400/30 rounded-lg text-white font-mono focus:outline-none focus:border-lime-400 transition-all"
              placeholder={isTimeUp ? "TIME'S UP" : 'START TYPING...'}
            />
          </div>
        </div>
      </div>
    );
  };

  // ===== RESULTS SCREEN =====
  const ResultsScreen = () => {
    const isCurrentPlayerWinner = Boolean(results?.[0] && results[0].name === playerName);

    return (
      <div className="min-h-screen bg-black text-white p-6 relative overflow-hidden">
        {isCurrentPlayerWinner && (
          <div className="confetti-overlay" aria-hidden="true">
            {confettiParticlesRef.current.map((piece) => (
              <span
                key={piece.id}
                className="confetti-piece"
                style={{
                  left: `${piece.left}%`,
                  width: `${piece.size}px`,
                  height: `${piece.size * 0.45}px`,
                  backgroundColor: piece.color,
                  animationDelay: `${piece.delay}s`,
                  animationDuration: `${piece.duration}s`,
                  '--confetti-drift': `${piece.drift}px`
                }}
              />
            ))}
          </div>
        )}
        <div className="max-w-2xl mx-auto relative z-10">
          <h2 className="text-5xl font-black mb-8 text-center">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-lime-400 to-cyan-400">
              {selectedGameMode === 'sprint' && 'SPRINT COMPLETE'}
              {selectedGameMode === 'marathon' && '🏃 MARATHON COMPLETE'}
              {selectedGameMode === 'endless' && 'ENDLESS SESSION COMPLETE'}
            </span>
          </h2>
          <div className="mb-8 p-4 bg-gray-800/50 border border-cyan-400/30 rounded text-center">
            <p className="text-gray-400 text-sm mb-2">WINNER DETERMINED BY</p>
            <p className="text-lg font-bold">
              {selectedGameMode === 'sprint' && 'Highest WPM (Speed)'}
              {selectedGameMode === 'marathon' && '🏃 First to Finish (Accuracy)'}
              {selectedGameMode === 'endless' && 'Most Progress % (Endurance)'}
            </p>
          </div>
          {isCurrentPlayerWinner && (
            <p className="text-center text-yellow-300 font-bold tracking-widest mb-6">VICTORY</p>
          )}

          {/* FINAL STATS */}
          <div className="bg-gray-900 border-2 border-lime-400/50 rounded-lg p-8 mb-8">
            <div className="text-center mb-8">
              <p className="text-gray-400 mb-2">Your WPM</p>
              <p className="text-5xl font-black text-cyan-400">{calculateWPM()}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-black/50 p-4 rounded border border-cyan-400/20">
                <p className="text-gray-400 text-sm">ACCURACY</p>
                <p className="text-3xl font-black text-lime-400">{calculateAccuracy()}%</p>
              </div>
              <div className="bg-black/50 p-4 rounded border border-cyan-400/20">
                <p className="text-gray-400 text-sm">{selectedGameMode === 'sprint' ? 'TIME' : 'PROGRESS'}</p>
                <p className="text-3xl font-black text-purple-400">
                  {selectedGameMode === 'sprint' ? `${gameTime.toFixed(1)}s` : `${calculateProgressPercent()}%`}
                </p>
              </div>
            </div>
          </div>

          {/* LEADERBOARD - FROM SERVER */}
          {results && (
            <div className="bg-gray-900 border-2 border-cyan-400/50 rounded-lg p-6 mb-8">
              <h3 className="text-xl font-bold mb-4">LEADERBOARD</h3>
              <div className="space-y-2">
                {results.map((entry, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-800/50 rounded border border-cyan-400/20">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{['🥇', '🥈', '🥉'][i] || '•'}</span>
                      <span className="font-semibold">{entry.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-cyan-400 font-bold">{entry.wpm} WPM</div>
                      <div className="text-lime-400 text-sm">
                        {selectedGameMode === 'endless' ? `${entry.progress}% progress` : `${entry.accuracy}% acc`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ACTION BUTTONS */}
          <div className="flex gap-4">
            <button
              onClick={() => {
                setScreen('waiting');
                setUserInput('');
                setGameTime(0);
                setGameStarted(false);
                setResults(null);
                timeUpPlayedRef.current = false;
                winningTonePlayedRef.current = false;
              }}
              className="flex-1 py-4 bg-gradient-to-r from-cyan-500 to-lime-500 text-black font-bold rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all flex items-center justify-center gap-2"
            >
              <RotateCcw size={20} /> REMATCH
            </button>
            <button
              onClick={() => {
                setScreen('lobby');
                setRoomCode('');
                setCurrentRoom(null);
                setPlayers([]);
                setIsRoomHost(false);
                setResults(null);
                timeUpPlayedRef.current = false;
                winningTonePlayedRef.current = false;
              }}
              className="flex-1 py-4 bg-gray-800 border border-cyan-400/50 text-white font-bold rounded-lg hover:bg-gray-700 transition-all"
            >
              Back to Lobby
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ===== RENDER CURRENT SCREEN =====
  return (
    <div className="font-mono">
      {screen === 'home' && HomeScreen()}
      {screen === 'lobby' && LobbyScreen()}
      {screen === 'modeSelection' && ModeSelectionScreen()}
      {screen === 'waiting' && WaitingScreen()}
      {screen === 'game' && GameScreen()}
      {screen === 'results' && ResultsScreen()}
    </div>
  );
};

export default App;
