"use client";

import { useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { io } from "socket.io-client";
import styles from "./page.module.css";

const PRESETS = {
  dinner: ["Pizza 🍕", "Sushi 🍣", "Burgers 🍔", "Tacos 🌮", "Thai 🍜", "Pasta 🍝"],
  decisions: ["Yes 👍", "No 👎", "Maybe 🤔", "Spin Again 🔄"],
  activities: ["Movie Night 🍿", "Gym Session 🏋️", "Gaming 🎮", "Read Book 📚", "Walk in Park 🌳"]
};

// Generate 4-digit numeric room code
const generateRoomCode = () => Math.floor(1000 + Math.random() * 9000).toString();

// Web Audio API Synthesizers
const playTickSound = (audioCtx) => {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
  } catch (e) {}
};

const playFanfareSound = (audioCtx) => {
  if (!audioCtx) return;
  try {
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const startTime = audioCtx.currentTime + i * 0.12;

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.4, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.5);
    });
  } catch (e) {}
};

export default function Home() {
  const [options, setOptions] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState(null);
  const [isMounted, setIsMounted] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [chips, setChips] = useState({});
  const [highlightedId, setHighlightedId] = useState(null);
  const [rotationDegrees, setRotationDegrees] = useState(0);

  // Socket & Room States
  const [roomCode, setRoomCode] = useState("");
  const [joinInputCode, setJoinInputCode] = useState("");
  const [roomNameInput, setRoomNameInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [peerCount, setPeerCount] = useState(1);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [publicRooms, setPublicRooms] = useState([]);
  const [networkIp, setNetworkIp] = useState("");

  const socketRef = useRef(null);
  const audioCtxRef = useRef(null);

  const getAudioContext = () => {
    if (!soundEnabled) return null;
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  // Initialize Socket.io Connection
  useEffect(() => {
    setIsMounted(true);
    const socket = io();
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("GET_LOCAL_INFO", (data) => {
        if (data?.ip) setNetworkIp(data.ip);
      });
    });

    socket.on("ROOM_LIST_UPDATE", (rooms) => {
      setPublicRooms(rooms || []);
    });

    socket.on("ROOM_STATE_SYNC", ({ options: newOpts, chips: newChips }) => {
      setOptions(newOpts);
      setChips(newChips);
    });

    socket.on("PLAYER_COUNT_UPDATE", (count) => {
      setPeerCount(count);
    });

    socket.on("SPIN_EVENT", ({ selectedWinner, winnerIndex, weightedOptions }) => {
      executeSpinAnimation(selectedWinner, winnerIndex, weightedOptions);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Hydration-safe LocalStorage Persistence
  useEffect(() => {
    try {
      const saved = localStorage.getItem("electio-options");
      const savedChips = localStorage.getItem("electio-chips");
      if (saved) setOptions(JSON.parse(saved));
      if (savedChips) setChips(JSON.parse(savedChips));
    } catch (e) {
      console.error("Failed to parse stored electio state:", e);
    }
  }, []);

  useEffect(() => {
    if (!isMounted || isConnected) return;
    localStorage.setItem("electio-options", JSON.stringify(options));
    localStorage.setItem("electio-chips", JSON.stringify(chips));
  }, [options, chips, isMounted, isConnected]);

  // Host a Room with 4-digit PIN
  const hostRoom = () => {
    const code = generateRoomCode();
    const roomTitle = roomNameInput.trim() || `Group Room #${code}`;

    if (!socketRef.current) return;
    socketRef.current.emit("CREATE_ROOM", { roomCode: code, name: roomTitle }, (res) => {
      if (res?.success) {
        setRoomCode(code);
        setIsConnected(true);
        setPeerCount(1);
        setShowRoomModal(false);

        // Sync initial options
        socketRef.current.emit("UPDATE_ROOM_STATE", { roomCode: code, options, chips });
      }
    });
  };

  // Join a Room with 4-digit code/password
  const joinRoom = (codeToJoin) => {
    const code = codeToJoin || joinInputCode.trim();
    if (!code || code.length !== 4 || !socketRef.current) return;

    socketRef.current.emit("JOIN_ROOM", { roomCode: code }, (res) => {
      if (res?.success) {
        setRoomCode(code);
        setIsConnected(true);
        setOptions(res.options || []);
        setChips(res.chips || {});
        setShowRoomModal(false);
      } else {
        alert(res?.error || "Could not find room with code #" + code);
      }
    });
  };

  const leaveRoom = () => {
    setIsConnected(false);
    setRoomCode("");
    setPeerCount(1);
  };

  const addOption = (e) => {
    e?.preventDefault();
    if (!inputValue.trim()) return;
    const newOpt = { id: Date.now(), text: inputValue.trim() };
    const updated = [...options, newOpt];

    setOptions(updated);
    setInputValue("");

    if (isConnected && socketRef.current) {
      socketRef.current.emit("UPDATE_ROOM_STATE", { roomCode, options: updated, chips });
    }
  };

  const toggleChip = (id) => {
    if (isSpinning) return;
    const updated = { ...chips, [id]: !chips[id] };
    setChips(updated);

    if (isConnected && socketRef.current) {
      socketRef.current.emit("UPDATE_ROOM_STATE", { roomCode, options, chips: updated });
    }
  };

  const removeOption = (id) => {
    if (isSpinning) return;
    const updated = options.filter((o) => o.id !== id);
    setOptions(updated);

    if (isConnected && socketRef.current) {
      socketRef.current.emit("UPDATE_ROOM_STATE", { roomCode, options: updated, chips });
    }
  };

  const clearAll = () => {
    if (isSpinning) return;
    setOptions([]);
    setChips({});
    setWinner(null);
    setHighlightedId(null);

    if (isConnected && socketRef.current) {
      socketRef.current.emit("UPDATE_ROOM_STATE", { roomCode, options: [], chips: {} });
    }
  };

  const loadPreset = (key) => {
    if (isSpinning) return;
    const presetItems = PRESETS[key] || [];
    const newOptions = presetItems.map((text, idx) => ({
      id: Date.now() + idx,
      text,
    }));

    setOptions(newOptions);
    setChips({});
    setWinner(null);
    setHighlightedId(null);

    if (isConnected && socketRef.current) {
      socketRef.current.emit("UPDATE_ROOM_STATE", { roomCode, options: newOptions, chips: {} });
    }
  };

  const executeSpinAnimation = (selectedWinner, winnerIndex, weightedOpts) => {
    const audioCtx = getAudioContext();
    setIsSpinning(true);
    setWinner(null);
    setHighlightedId(null);

    const sliceAngle = 360 / options.length;
    const extraSpins = 1800;
    const targetAngle = extraSpins + (360 - (winnerIndex * sliceAngle + sliceAngle / 2));

    setRotationDegrees((prev) => prev + targetAngle);

    const tickTimes = [100, 250, 450, 700, 1000, 1350, 1750, 2200, 2650];
    tickTimes.forEach((delay) => {
      setTimeout(() => playTickSound(audioCtx), delay);
    });

    setTimeout(() => {
      setHighlightedId(selectedWinner.id);
      setWinner(selectedWinner);
      setIsSpinning(false);

      playFanfareSound(audioCtx);
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ["#ffd700", "#d40000", "#ffffff", "#008000"],
      });
    }, 3000);
  };

  const spinRoulette = () => {
    if (options.length < 2 || isSpinning) return;

    const weightedOptions = options.map((opt) => {
      let weight = 100;
      let isRiskApplied = false;
      if (chips[opt.id]) {
        const isUp = Math.random() > 0.5;
        weight = isUp ? 200 : 50;
        isRiskApplied = true;
      }
      return { ...opt, weight, isRiskApplied };
    });

    const totalWeight = weightedOptions.reduce((acc, opt) => acc + opt.weight, 0);
    let random = Math.random() * totalWeight;
    let selectedWinner = weightedOptions[0];

    for (const opt of weightedOptions) {
      if (random < opt.weight) {
        selectedWinner = opt;
        break;
      }
      random -= opt.weight;
    }

    const winnerIndex = options.findIndex((o) => o.id === selectedWinner.id);

    if (isConnected && socketRef.current) {
      socketRef.current.emit("TRIGGER_SPIN", {
        roomCode,
        selectedWinner,
        winnerIndex,
        weightedOptions,
      });
    } else {
      executeSpinAnimation(selectedWinner, winnerIndex, weightedOptions);
    }
  };

  const totalBaseWeight = options.length * 100;
  let wheelGradient = "var(--border) 0deg 360deg";
  if (options.length > 0) {
    wheelGradient = options
      .map((opt, i) => {
        const startAngle = (i * 360) / options.length;
        const endAngle = ((i + 1) * 360) / options.length;
        const color = i % 2 === 0 ? "var(--secondary)" : "var(--primary)";
        return `${color} ${startAngle}deg ${endAngle}deg`;
      })
      .join(", ");
  }

  const numOptions = options.length;
  const sliceAngle = numOptions > 0 ? 360 / numOptions : 360;

  return (
    <main>
      <header>
        <div className={styles.headerTop}>
          <h1>ELECTIO</h1>
          <div className={styles.topRightBtns}>
            <button className={styles.roomBadgeBtn} onClick={() => setShowRoomModal(true)}>
              {isConnected ? `🌐 Room #${roomCode} (${peerCount} online)` : "👥 Host / Join"}
            </button>
            <button
              className={styles.soundToggle}
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? "Mute audio" : "Enable audio"}
            >
              {soundEnabled ? "🔊" : "🔇"}
            </button>
          </div>
        </div>
        <p className="subtitle">High-Tech Decision Roulette</p>

        {/* NETWORK ACCESS BANNER */}
        {networkIp && (
          <div className={styles.networkBanner}>
            📱 Connect nearby phones/devices to: <strong>http://{networkIp}:3000</strong>
          </div>
        )}
      </header>

      {/* MULTIPLAYER ROOM LOBBY MODAL */}
      {showRoomModal && (
        <div className={styles.modalOverlay} onClick={() => setShowRoomModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2>Multiplayer Lobby</h2>
            <p className={styles.modalSub}>Host a room or pick an active room to join!</p>

            {isConnected ? (
              <div className={styles.roomActiveInfo}>
                <div className={styles.codeDisplay}>
                  PIN / Passcode: <span>{roomCode}</span>
                </div>
                <p>Players Connected: <strong>{peerCount}</strong></p>
                <button className={styles.leaveBtn} onClick={leaveRoom}>
                  Leave Room (Solo Mode)
                </button>
              </div>
            ) : (
              <div className={styles.modalActions}>
                {/* CREATE ROOM SECTION */}
                <div className={styles.createBox}>
                  <input
                    type="text"
                    placeholder="Room Name (e.g. Lunch Squad)"
                    value={roomNameInput}
                    onChange={(e) => setRoomNameInput(e.target.value)}
                  />
                  <button className={styles.hostActionBtn} onClick={hostRoom}>
                    🎲 Create Room
                  </button>
                </div>

                <div className={styles.divider}>DISCOVERED ROOMS ON NETWORK</div>

                {/* DISCOVERED PUBLIC ROOMS LIST */}
                <div className={styles.discoveredList}>
                  {publicRooms.length === 0 ? (
                    <p className={styles.noRoomsMsg}>No active rooms found. Host one above!</p>
                  ) : (
                    publicRooms.map((r) => (
                      <div key={r.roomCode} className={styles.roomCard}>
                        <div className={styles.roomCardLeft}>
                          <strong>{r.name}</strong>
                          <span>PIN: #{r.roomCode} • {r.playerCount} players</span>
                        </div>
                        <button className={styles.joinCardBtn} onClick={() => joinRoom(r.roomCode)}>
                          Join
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className={styles.divider}>OR ENTER 4-DIGIT PIN DIRECTLY</div>

                {/* DIRECT CODE JOIN */}
                <div className={styles.joinBox}>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="Enter 4-digit PIN"
                    value={joinInputCode}
                    onChange={(e) => setJoinInputCode(e.target.value.replace(/[^0-9]/g, ""))}
                  />
                  <button
                    className={styles.joinActionBtn}
                    onClick={() => joinRoom()}
                    disabled={joinInputCode.length !== 4}
                  >
                    Join
                  </button>
                </div>
              </div>
            )}

            <button className={styles.closeModalBtn} onClick={() => setShowRoomModal(false)}>×</button>
          </div>
        </div>
      )}

      {/* INPUT & CONTROL BAR */}
      <section className="glass">
        <form onSubmit={addOption} className={styles.inputArea}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Add an option..."
            disabled={isSpinning}
          />
          <button type="submit" className={styles.addBtn} disabled={isSpinning || !inputValue.trim()}>
            +
          </button>
        </form>

        <div className={styles.presetBar}>
          <span className={styles.presetLabel}>Presets:</span>
          <button className={styles.presetBtn} onClick={() => loadPreset("dinner")} disabled={isSpinning}>
            🍕 Dinner
          </button>
          <button className={styles.presetBtn} onClick={() => loadPreset("decisions")} disabled={isSpinning}>
            👍 Yes/No
          </button>
          <button className={styles.presetBtn} onClick={() => loadPreset("activities")} disabled={isSpinning}>
            🎮 Fun
          </button>
          {options.length > 0 && (
            <button className={styles.clearBtn} onClick={clearAll} disabled={isSpinning}>
              Clear All
            </button>
          )}
        </div>
      </section>

      {/* DYNAMIC ROULETTE TABLE */}
      <section className={`${styles.tableGrid} glass`}>
        {!isMounted ? (
          <p className={styles.emptyMsg}>Loading saved options...</p>
        ) : options.length === 0 ? (
          <p className={styles.emptyMsg}>Add options or load a preset above to begin!</p>
        ) : (
          options.map((opt, index) => {
            const baseOdds = ((100 / totalBaseWeight) * 100).toFixed(1);
            return (
              <div
                key={opt.id}
                className={`${styles.tableCell} ${highlightedId === opt.id ? styles.highlighted : ""}`}
                onClick={() => toggleChip(opt.id)}
                title="Click to toggle Risk Chip (C)"
              >
                <div
                  className={styles.cellColor}
                  style={{ background: index % 2 === 0 ? "var(--secondary)" : "var(--primary)" }}
                ></div>
                <div className={styles.cellNum}>#{index + 1}</div>
                <div className={styles.cellText}>{opt.text}</div>

                {chips[opt.id] ? (
                  <div className={styles.chipHUD}>
                    <div className={styles.chip}>C</div>
                    <span className={styles.riskOddsText}>⚡ 50% 2x | 50% 0.5x</span>
                  </div>
                ) : (
                  <span className={styles.baseOddsText}>{baseOdds}% odds</span>
                )}

                <button
                  className={styles.removeSmall}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeOption(opt.id);
                  }}
                  disabled={isSpinning}
                  title="Remove option"
                >
                  ×
                </button>
              </div>
            );
          })
        )}
      </section>

      {/* ROULETTE WHEEL & CONTROLS */}
      <section className={`${styles.rouletteContainer} glass`}>
        <div className={styles.wheelWrapper}>
          <div className={styles.pointer}>▼</div>
          <div
            className={styles.wheel}
            style={{
              background: `conic-gradient(${wheelGradient})`,
              transform: `rotate(${rotationDegrees}deg)`,
            }}
          >
            {options.map((opt, index) => {
              const midAngle = index * sliceAngle + sliceAngle / 2;
              return (
                <div
                  key={opt.id}
                  className={styles.sliceLabel}
                  style={{ transform: `rotate(${midAngle}deg)` }}
                >
                  <span
                    className={styles.sliceContent}
                    style={{ color: index % 2 === 0 ? "#ffffff" : "#000000" }}
                  >
                    #{index + 1} {opt.text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <button
          className="primary spinBtn"
          onClick={spinRoulette}
          disabled={isSpinning || options.length < 2}
        >
          {isSpinning ? "SPINNING..." : "SPIN WHEEL"}
        </button>
      </section>

      {winner && (
        <section className={`${styles.winnerCard} glass`}>
          <p>THE CHOICE IS:</p>
          <h2>{winner.text}</h2>
          {winner.isRiskApplied && (
            <p className={styles.riskMsg}>⚡ Risk Chip Outcome Triggered ({winner.weight}% weight)!</p>
          )}
        </section>
      )}
    </main>
  );
}




