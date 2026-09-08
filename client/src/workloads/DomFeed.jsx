import { useEffect, useRef, useState } from "react";

export default function DomFeedStress({ bomb }) {
  const [thrashing, setThrashing] = useState(false);
  const containerRef = useRef(null);
  const titles = ["Storefront row", "Cart line", "Profile header", "Feed post", "Settings row"];
  const items = Array.from({ length: 36 }, (_, i) => ({
    id: i + 1,
    title: `${titles[i % titles.length]} ${Math.floor(i / titles.length) + 1}`,
    latency: `${(6.8 + (i % 5) * 0.15).toFixed(2)} ms`,
    chips: ["contain", "layer", "scroll"],
  }));

  useEffect(() => {
    if (!thrashing && !bomb) return;
    let animId = 0;
    const loop = () => {
      const root = containerRef.current;
      if (root) {
        const cards = root.querySelectorAll(".feed-card-item");
        cards.forEach((card, idx) => {
          const h = card.offsetHeight;
          card.style.transform = `translateY(${Math.sin(performance.now() * 0.01 + idx) * (bomb ? 6 : 2)}px)`;
          if (idx % 4 === 0) card.style.marginBottom = `${8 + (h % 3)}px`;
        });
      }
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [thrashing, bomb]);

  return (
    <div className="feed-stress-wrap" ref={containerRef}>
      <div className="feed-header-panel">
        <span className="feed-tag">List app under test</span>
        <button
          type="button"
          className={`feed-thrash-toggle ${thrashing || bomb ? "active" : ""}`}
          onClick={() => setThrashing((v) => !v)}
        >
          {thrashing || bomb ? "Layout thrash on" : "Induce layout thrash"}
        </button>
      </div>
      <div className="feed-scroll-container">
        {items.map((item) => (
          <div key={item.id} className="feed-card-item">
            <div className="feed-card-avatar">F</div>
            <div className="feed-card-body">
              <div className="feed-card-title">{item.title}</div>
              <div className="feed-card-chips">
                {item.chips.map((c) => (
                  <span key={c} className="feed-chip">{c}</span>
                ))}
              </div>
            </div>
            <div className="feed-card-stat">
              <b>{item.latency}</b>
              <small>label</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
