"use client";

import { useState, useEffect } from "react";
import styles from "./page.module.css";

export default function Home() {
  const [options, setOptions] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState(null);
  const [activeCategory, setActiveCategory] = useState("Eat");

  const [chips, setChips] = useState({}); // { optionId: boolean }
  const [highlightedId, setHighlightedId] = useState(null);

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
    setOptions([...options, { id: Date.now(), text: inputValue.trim(), category: activeCategory }]);
    setInputValue("");
  };

  const toggleChip = (id) => {
    setChips(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredOptions = options.filter(opt => opt.category === activeCategory);

  const spinRoulette = () => {
    if (filteredOptions.length < 2) return;
    setIsSpinning(true);
    setWinner(null);
    setHighlightedId(null);

    // Calculate Weights for Risk Chips
    const weightedOptions = filteredOptions.map(opt => {
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

    // Animation Loop: Cycling through cells
    let cycleCount = 0;
    const maxCycles = 20;
    const interval = setInterval(() => {
      setHighlightedId(filteredOptions[cycleCount % filteredOptions.length].id);
      cycleCount++;
      if (cycleCount > maxCycles) {
        clearInterval(interval);
        setHighlightedId(selectedWinner.id);
        setWinner(selectedWinner);
        setIsSpinning(false);
      }
    }, 100);
  };

  return (
    <main>
      <header>
        <h1>ELECTIO</h1>
        <p className="subtitle">High-Tech Decision Roulette</p>
      </header>

      <section className="glass">
        <div className={styles.categories}>
          {["Eat", "Do", "Buy"].map((cat) => (
            <button
              key={cat}
              className={activeCategory === cat ? styles.activeTab : ""}
              onClick={() => {
                setActiveCategory(cat);
                setWinner(null);
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        <form onSubmit={addOption} className={styles.inputArea}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={`Add option to ${activeCategory}...`}
          />
          <button type="submit" className={styles.addBtn}>+</button>
        </form>
      </section>

      {/* DYNAMIC ROULETTE TABLE */}
      <section className={`${styles.tableGrid} glass`}>
        {filteredOptions.length === 0 ? (
          <p className={styles.emptyMsg}>Add options to populate the table</p>
        ) : (
          filteredOptions.map((opt, index) => (
            <div 
              key={opt.id} 
              className={`${styles.tableCell} ${highlightedId === opt.id ? styles.highlighted : ""}`}
              onClick={() => toggleChip(opt.id)}
            >
              <div className={styles.cellNum}>{index + 1}</div>
              <div className={styles.cellText}>{opt.text}</div>
              {chips[opt.id] && <div className={styles.chip}>C</div>}
              <button 
                className={styles.removeSmall}
                onClick={(e) => {
                  e.stopPropagation();
                  setOptions(options.filter(o => o.id !== opt.id));
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
          <div className={`${styles.wheel} ${isSpinning ? styles.spinning : ""}`}>
            {/* Minimalist wheel design */}
          </div>
        </div>
        
        <button 
          className="primary" 
          onClick={spinRoulette}
          disabled={isSpinning || filteredOptions.length < 2}
        >
          {isSpinning ? "SPINNING..." : `SPIN ${activeCategory.toUpperCase()}`}
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
