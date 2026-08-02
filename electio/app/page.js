"use client";

import { useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import styles from "./page.module.css";

const PRESETS = {
  dinner: ["Pizza 🍕", "Sushi 🍣", "Burgers 🍔", "Tacos 🌮", "Thai 🍜", "Pasta 🍝"],
  decisions: ["Yes 👍", "No 👎", "Maybe 🤔", "Spin Again 🔄"],
  activities: ["Movie Night 🍿", "Gym Session 🏋️", "Gaming 🎮", "Read Book 📚", "Walk in Park 🌳"]
};

// Web Audio API Synthesizers (no external asset files required)
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
  } catch (e) {
    // audio context muted or user hasn't interacted
  }
};

const playFanfareSound = (audioCtx) => {
  if (!audioCtx) return;
  try {
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
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
  } catch (e) {
    // audio context error fallback
  }
};

export default function Home() {
  const [options, setOptions] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState(null);
  const [isMounted, setIsMounted] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [chips, setChips] = useState({}); // { optionId: boolean }
  const [highlightedId, setHighlightedId] = useState(null);
  const [rotationDegrees, setRotationDegrees] = useState(0);

  const audioCtxRef = useRef(null);

  // Initialize Web Audio Context on user interaction
  const getAudioContext = () => {
    if (!soundEnabled) return null;
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  // Hydration-safe LocalStorage Persistence
  useEffect(() => {
    setIsMounted(true);
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
    if (!isMounted) return;
    localStorage.setItem("electio-options", JSON.stringify(options));
    localStorage.setItem("electio-chips", JSON.stringify(chips));
  }, [options, chips, isMounted]);

  const addOption = (e) => {
    e?.preventDefault();
    if (!inputValue.trim()) return;
    setOptions((prev) => [...prev, { id: Date.now(), text: inputValue.trim() }]);
    setInputValue("");
  };

  const toggleChip = (id) => {
    if (isSpinning) return;
    setChips((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const clearAll = () => {
    if (isSpinning) return;
    setOptions([]);
    setChips({});
    setWinner(null);
    setHighlightedId(null);
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
  };

  const spinRoulette = () => {
    if (options.length < 2 || isSpinning) return;

    const audioCtx = getAudioContext();
    setIsSpinning(true);
    setWinner(null);
    setHighlightedId(null);

    // Calculate Weights for Risk Chips
    const weightedOptions = options.map((opt) => {
      let weight = 100; // base weight
      let isRiskApplied = false;
      if (chips[opt.id]) {
        const isUp = Math.random() > 0.5;
        weight = isUp ? 200 : 50; // Double or Halve
        isRiskApplied = true;
      }
      return { ...opt, weight, isRiskApplied };
    });

    // Weighted Random Selection
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
    const sliceAngle = 360 / options.length;

    // Target angle places winner slice under pointer (0° / top center)
    const extraSpins = 1800; // 5 full revolutions
    const targetAngle = extraSpins + (360 - (winnerIndex * sliceAngle + sliceAngle / 2));

    setRotationDegrees((prev) => prev + targetAngle);

    // Play ticking sounds periodically during wheel deceleration
    const tickTimes = [100, 250, 450, 700, 1000, 1350, 1750, 2200, 2650];
    tickTimes.forEach((delay) => {
      setTimeout(() => {
        playTickSound(audioCtx);
      }, delay);
    });

    // Finalize after 3s CSS transition
    setTimeout(() => {
      setHighlightedId(selectedWinner.id);
      setWinner(selectedWinner);
      setIsSpinning(false);

      // Play Victory Fanfare & Fire Confetti
      playFanfareSound(audioCtx);
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ["#ffd700", "#d40000", "#ffffff", "#008000"]
      });
    }, 3000);
  };

  // Dynamic Base Probability Calculation for HUD
  const totalBaseWeight = options.length * 100;

  // Generate Conic Gradient background
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
          <button
            className={styles.soundToggle}
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? "Mute audio" : "Enable audio"}
          >
            {soundEnabled ? "🔊 Sound ON" : "🔇 Sound OFF"}
          </button>
        </div>
        <p className="subtitle">High-Tech Decision Roulette</p>
      </header>

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

                {/* Risk Chip Indicator & Odds HUD */}
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
                    if (!isSpinning) setOptions(options.filter((o) => o.id !== opt.id));
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
            {/* Slice Labels Overlay */}
            {options.map((opt, index) => {
              const midAngle = index * sliceAngle + sliceAngle / 2;
              return (
                <div
                  key={opt.id}
                  className={styles.sliceLabel}
                  style={{
                    transform: `rotate(${midAngle}deg)`,
                  }}
                >
                  <span
                    className={styles.sliceContent}
                    style={{
                      color: index % 2 === 0 ? "#ffffff" : "#000000",
                    }}
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


