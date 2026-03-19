"use client";

import { useState, useEffect } from "react";
import styles from "./page.module.css";

export default function Home() {
  const [options, setOptions] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState(null);

  const [chips, setChips] = useState({}); // { optionId: boolean }
  const [highlightedId, setHighlightedId] = useState(null);
  const [rotationDegrees, setRotationDegrees] = useState(0);

  // LocalStorage Persistence (Week 6)
  useEffect(() => {
    const saved = localStorage.getItem("electio-options");
    const savedChips = localStorage.getItem("electio-chips");
    if (saved) setOptions(JSON.parse(saved));
    if (savedChips) setChips(JSON.parse(savedChips));
  }, []);

  useEffect(() => {
    localStorage.setItem("electio-options", JSON.stringify(options));
    localStorage.setItem("electio-chips", JSON.stringify(chips));
  }, [options, chips]);

  const addOption = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    setOptions([...options, { id: Date.now(), text: inputValue.trim() }]);
    setInputValue("");
  };

  const toggleChip = (id) => {
    setChips(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const spinRoulette = () => {
    if (options.length < 2) return;
    setIsSpinning(true);
    setWinner(null);
    setHighlightedId(null);

    // Calculate Weights for Risk Chips
    const weightedOptions = options.map(opt => {
      let weight = 100; // base weight
      if (chips[opt.id]) {
        const isUp = Math.random() > 0.5;
        weight = isUp ? 200 : 50; // Double or Halve
      }
      return { ...opt, weight };
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

    const winnerIndex = options.findIndex(o => o.id === selectedWinner.id);
    const sliceAngle = 360 / options.length;
    
    // Calculate Rotation: Target angle places the winner at 0 degrees (top).
    // The visual wheel slices are offset, so we compute exactly where the slice sits.
    const targetAngle = 1800 + (360 - (winnerIndex * sliceAngle + sliceAngle / 2));
    
    setRotationDegrees(prev => prev + targetAngle);

    // Finalize after 3s CSS transition
    setTimeout(() => {
      setHighlightedId(selectedWinner.id);
      setWinner(selectedWinner);
      setIsSpinning(false);
    }, 3000);
  };

  // Generate Conic Gradient for the Wheel
  let wheelGradient = "var(--border) 0deg 360deg";
  if (options.length > 0) {
    wheelGradient = options.map((opt, i) => {
      const startAngle = (i * 360) / options.length;
      const endAngle = ((i + 1) * 360) / options.length;
      // Vibrant alternative colors
      const color = i % 2 === 0 ? "var(--secondary)" : "var(--primary)";
      return `${color} ${startAngle}deg ${endAngle}deg`;
    }).join(", ");
  }

  return (
    <main>
      <header>
        <h1>ELECTIO</h1>
        <p className="subtitle">High-Tech Decision Roulette</p>
      </header>

      <section className="glass">
        <form onSubmit={addOption} className={styles.inputArea}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={`Add an option...`}
            disabled={isSpinning}
          />
          <button type="submit" className={styles.addBtn} disabled={isSpinning}>+</button>
        </form>
      </section>

      {/* DYNAMIC ROULETTE TABLE */}
      <section className={`${styles.tableGrid} glass`}>
        {options.length === 0 ? (
          <p className={styles.emptyMsg}>Add options to populate the table</p>
        ) : (
          options.map((opt, index) => (
            <div 
              key={opt.id} 
              className={`${styles.tableCell} ${highlightedId === opt.id ? styles.highlighted : ""}`}
              onClick={() => !isSpinning && toggleChip(opt.id)}
            >
              <div className={styles.cellColor} style={{ background: index % 2 === 0 ? 'var(--secondary)' : 'var(--primary)' }}></div>
              <div className={styles.cellNum}>{index + 1}</div>
              <div className={styles.cellText}>{opt.text}</div>
              {chips[opt.id] && <div className={styles.chip}>C</div>}
              <button 
                className={styles.removeSmall}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isSpinning) setOptions(options.filter(o => o.id !== opt.id));
                }}
              >
                ×
              </button>
            </div>
          ))
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
              transform: `rotate(${rotationDegrees}deg)`
            }}
          ></div>
        </div>
        
        <button 
          className="primary spinBtn" 
          onClick={spinRoulette}
          disabled={isSpinning || options.length < 2}
        >
          {isSpinning ? "SPINNING..." : `SPIN WHEEL`}
        </button>
      </section>

      {winner && (
        <section className={`${styles.winnerCard} glass`}>
          <p>THE CHOICE IS:</p>
          <h2>{winner.text}</h2>
          {chips[winner.id] && <p className={styles.riskMsg}>Risk Chip Played!</p>}
        </section>
      )}
    </main>
  );
}
