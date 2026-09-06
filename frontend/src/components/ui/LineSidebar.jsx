import React, { useRef, useState, useCallback, useEffect } from 'react';
import './LineSidebar.css';

const FALLOFF_CURVES = {
  linear: p => p,
  smooth: p => p * p * (3 - 2 * p),
  sharp: p => p * p * p,
};

const DEFAULT_ITEMS = [
  'Overview',
  'Components',
  'Animations',
  'Backgrounds',
  'Showcase',
  'Playground',
  'Templates',
  'Changelog',
  'Community',
  'Resources',
  'Documentation',
  'Support',
];

const LineSidebar = ({
  items = DEFAULT_ITEMS,
  accentColor = '#8B7FE8',
  textColor = '#8A8CA0',
  markerColor = '#2C3040',
  showIndex = false,
  showMarker = false,
  proximityRadius = 100,
  maxShift = 10,
  falloff = 'smooth',
  markerLength = 40,
  markerGap = 0,
  tickScale = 0.5,
  scaleTick = true,
  itemGap = 2,
  fontSize = 0.8125,
  smoothing = 100,
  defaultActive = null,
  activeRoute = null,
  onItemClick,
  className = '',
}) => {
  const listRef = useRef(null);
  const itemRefs = useRef([]);
  const targetsRef = useRef([]);
  const currentRef = useRef([]);
  const rafRef = useRef(null);
  const lastRef = useRef(0);
  const activeRef = useRef(defaultActive);
  const smoothingRef = useRef(smoothing);

  // Compute active index based on activeRoute or defaultActive
  const computeActiveIndex = useCallback(() => {
    if (activeRoute != null) {
      const idx = items.findIndex(item => {
        if (typeof item === 'object' && item !== null) {
          return item.id === activeRoute;
        }
        return item === activeRoute;
      });
      return idx >= 0 ? idx : defaultActive;
    }
    return defaultActive;
  }, [activeRoute, defaultActive, items]);

  const [activeIndex, setActiveIndex] = useState(computeActiveIndex);

  useEffect(() => {
    const nextActive = computeActiveIndex();
    setActiveIndex(nextActive);
  }, [computeActiveIndex]);

  activeRef.current = activeIndex;
  smoothingRef.current = smoothing;

  const runFrame = useCallback(now => {
    const dt = Math.min((now - lastRef.current) / 1000, 0.05);
    lastRef.current = now;
    const tau = Math.max(smoothingRef.current, 1) / 1000;
    const k = 1 - Math.exp(-dt / tau);

    let moving = false;
    const itemEls = itemRefs.current;
    for (let i = 0; i < itemEls.length; i++) {
      const el = itemEls[i];
      if (!el) continue;
      const target = Math.max(targetsRef.current[i] || 0, activeRef.current === i ? 1 : 0);
      const cur = currentRef.current[i] || 0;
      const next = cur + (target - cur) * k;
      const settled = Math.abs(target - next) < 0.0015;
      const value = settled ? target : next;
      currentRef.current[i] = value;
      el.style.setProperty('--effect', value.toFixed(4));
      if (!settled) moving = true;
    }

    rafRef.current = moving ? requestAnimationFrame(runFrame) : null;
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
    }
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  const handlePointerMove = useCallback(
    e => {
      const list = listRef.current;
      if (!list) return;
      const rect = list.getBoundingClientRect();
      const pointerY = e.clientY - rect.top;
      const ease = FALLOFF_CURVES[falloff] ?? FALLOFF_CURVES.linear;
      const itemEls = itemRefs.current;
      for (let i = 0; i < itemEls.length; i++) {
        const el = itemEls[i];
        if (!el) continue;
        const center = el.offsetTop + el.offsetHeight / 2;
        const distance = Math.abs(pointerY - center);
        targetsRef.current[i] = ease(Math.max(0, 1 - distance / proximityRadius));
      }
      startLoop();
    },
    [falloff, proximityRadius, startLoop]
  );

  const handlePointerLeave = useCallback(() => {
    targetsRef.current = (targetsRef.current || []).map(() => 0);
    startLoop();
  }, [startLoop]);

  const handleClick = useCallback(
    (index, item) => {
      setActiveIndex(index);
      onItemClick?.(index, item);
    },
    [onItemClick]
  );

  useEffect(() => {
    startLoop();
  }, [activeIndex, startLoop]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    },
    []
  );

  return (
    <nav
      className={`line-sidebar${showMarker ? ' line-sidebar--markers' : ''}${
        scaleTick ? ' line-sidebar--scale-tick' : ''
      }${className ? ` ${className}` : ''}`}
      style={{
        '--accent-color': accentColor,
        '--text-color': textColor,
        '--marker-color': markerColor,
        '--marker-length': `${markerLength}px`,
        '--marker-gap': `${markerGap}px`,
        '--tick-scale': tickScale,
        '--max-shift': `${maxShift}px`,
        '--item-gap': `${itemGap}px`,
        '--font-size': typeof fontSize === 'number' ? `${fontSize}rem` : fontSize,
        '--smoothing': `${smoothing}ms`,
      }}
    >
      <ul
        ref={listRef}
        className="line-sidebar__list"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {items.map((item, index) => {
          const isObj = typeof item === 'object' && item !== null;
          const label = isObj ? item.label : item;
          const id = isObj ? item.id : `item-${index}`;
          const icon = isObj ? item.icon : null;
          const isActive = activeIndex === index;

          return (
            <li
              key={`${id}-${index}`}
              ref={el => {
                itemRefs.current[index] = el;
              }}
              className={`navitem line-sidebar__item ${isActive ? 'active' : ''}`}
              data-page={id}
              aria-current={isActive ? 'true' : undefined}
              onClick={() => handleClick(index, item)}
            >
              {showMarker && <span className="line-sidebar__marker" aria-hidden="true" />}
              {icon && <span className="line-sidebar__icon">{icon}</span>}
              <span className="line-sidebar__label">
                {showIndex && (
                  <span className="line-sidebar__index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                )}
                <span className="line-sidebar__text label">{label}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default LineSidebar;
