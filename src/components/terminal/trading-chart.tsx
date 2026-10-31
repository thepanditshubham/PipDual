'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Candle, Position, Trade } from '@/lib/engine/types';
import { TIMEFRAME_SECONDS, TIMEFRAMES, type Timeframe } from '@/lib/engine/market-feed';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type CandlestickData,
  type UTCTimestamp,
} from 'lightweight-charts';
import {
  SlidersHorizontal,
  SquareFunction,
  PencilRuler,
  Settings,
  Maximize2,
  Camera,
  Clock,
  Undo2,
  Redo2,
  CandlestickChart,
  LineChart,
  ChevronDown,
  Crosshair,
  Minus,
  Edit3,
  Type,
  Ruler,
  ZoomIn,
  Magnet,
  Lock,
  Eye,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { NOTIONAL_PER_SIZE } from '@/lib/engine/constants';
import { useTerminalMode } from '@/components/terminal/theme-mode';

type DragTarget = 'sl' | 'tp' | null;

/** "00:42" / "1:03:20" — the time left on the candle, printed like a chart clock. */
function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}

/** The drawing rail: one entry per tool the palette shows. */
type DrawTool = { id: string; title: string; Icon: typeof Crosshair; iconClass?: string };
const DRAW_TOOLS: DrawTool[] = [
  { id: 'crosshair', title: 'Crosshair', Icon: Crosshair },
  { id: 'trend', title: 'Trend Line', Icon: Minus, iconClass: 'rotate-45' },
  { id: 'fib', title: 'Gann and Fibonacci Tools', Icon: SlidersHorizontal },
  { id: 'brush', title: 'Brush', Icon: Edit3 },
  { id: 'text', title: 'Text', Icon: Type },
  { id: 'measure', title: 'Measure', Icon: Ruler },
  { id: 'zoom', title: 'Zoom In', Icon: ZoomIn },
  { id: 'magnet', title: 'Magnet Mode', Icon: Magnet },
  { id: 'lock', title: 'Lock All Drawing Tools', Icon: Lock },
  { id: 'hide', title: 'Hide All Drawings', Icon: Eye },
  { id: 'clear', title: 'Remove Drawings', Icon: Trash2 },
];

/** The palette's buttons, shared by the desktop rail and the phone toolbar. */
function DrawToolButtons({
  activeId,
  onPick,
}: {
  activeId: string;
  onPick: (id: string) => void;
}) {
  return (
    <>
      {DRAW_TOOLS.map(({ id, title, Icon, iconClass }) => {
        const active = id === activeId;
        return (
          <button
            key={id}
            type="button"
            title={title}
            onClick={() => onPick(id)}
            className={`p-1.5 rounded transition-colors ${
              active
                ? 'bg-[var(--term-primary)]/12 text-[var(--term-primary)]'
                : 'hover:text-[var(--term-text)] hover:bg-[var(--term-raised)]'
            }`}
          >
            <Icon size={15} className={iconClass} />
          </button>
        );
      })}
    </>
  );
}

/**
 * Candles are painted on a canvas, so they cannot inherit CSS variables the way
 * the surrounding chrome does. Read the terminal tokens off the chart's own
 * container — the element `.term-theme` recolours — and hand lightweight-charts
 * literal colours. A theme flip re-reads this through the effect below.
 */
function readChartPalette(scope: HTMLElement | null) {
  const host = scope ?? (typeof document === 'undefined' ? null : document.documentElement);
  const read = (token: string, fallback: string) => {
    if (!host) return fallback;
    const value = getComputedStyle(host).getPropertyValue(token).trim();
    return value || fallback;
  };
  return {
    background: read('--term-panel-deep', '#292940'),
    text: read('--term-muted', '#928cae'),
    crosshair: read('--term-border-hover', '#55557e'),
    crosshairLabel: read('--term-raised', '#363654'),
    border: read('--term-border', '#3a3a58'),
    up: read('--term-buy', '#3ddc84'),
    down: read('--term-sell', '#ff5f75'),
    line: read('--term-primary', '#f0a53a'),
  };
}

interface TradingChartProps {
  candles: Candle[];
  currentPrice: number;
  position: Position | null;
  trades: Trade[];
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  /** Seconds until the bar on screen seals; null hides the clock (pre-battle). */
  barCloseInSeconds?: number | null;
  instrument?: string;
  /** Instrument decimals from the pair config; falls back to sniffing the ticker. */
  digits?: number;
  readOnly?: boolean;
  onSlChange?: (slPct: number) => void;
  onTpChange?: (tpPct: number) => void;
  onClose?: () => void;
}

export function TradingChart({
  candles,
  currentPrice,
  position,
  trades,
  timeframe,
  onTimeframeChange,
  barCloseInSeconds = null,
  instrument = 'XAU/USD',
  digits,
  readOnly = false,
  onSlChange,
  onTpChange,
  onClose,
}: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const mode = useTerminalMode();

  // Price lines refs for active position
  const entryLineRef = useRef<IPriceLine | null>(null);
  const slLineRef = useRef<IPriceLine | null>(null);
  const tpLineRef = useRef<IPriceLine | null>(null);

  // Chart settings
  const [chartType, setChartType] = useState<'candlestick' | 'line'>('candlestick');
  // Toolbar menus keep one control on screen: the current timeframe, or the
  // tool in hand. Opening either one hides the rest of that dock.
  const [tfMenuOpen, setTfMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [drawToolId, setDrawToolId] = useState('crosshair');

  // Drag state
  const dragTargetRef = useRef<DragTarget>(null);
  // Bracket chip / line drag: which level moves and the price currently under the pointer
  const chipDragRef = useRef<{ target: 'sl' | 'tp'; startY: number; moved: boolean } | null>(null);
  const dragPriceRef = useRef<number | null>(null);
  // Latest pointer sample waiting for the next animation frame (one preview per frame)
  const pendingPreviewRef = useRef<{ target: 'sl' | 'tp'; x: number; y: number } | null>(null);
  const previewRafRef = useRef(0);
  const [cursorStyle, setCursorStyle] = useState<string>('default');
  const [dragInfo, setDragInfo] = useState<{
    target: DragTarget;
    price: number;
    pnl: number;
    pct: number;
    x: number;
    y: number;
  } | null>(null);

  // Order visualization overlay coords (pixel Y per price level)
  const [bandCoords, setBandCoords] = useState<{
    entryY: number;
    slY: number | null;
    tpY: number | null;
    height: number;
    /** Width of the right price scale, so overlay pills can hug the axis from the right */
    scaleW: number;
  } | null>(null);
  const rafRef = useRef<number>(0);

  // Right price-scale width, kept in sync so bottom-right controls clear the axis
  const [scaleWidth, setScaleWidth] = useState(0);

  // Precision based on instrument — the pair's own config wins when supplied, so a
  // renamed instrument is not at the mercy of name sniffing.
  const isForex = instrument.includes('/') && !instrument.includes('BTC') && !instrument.includes('XAU') && !instrument.includes('JPY');
  const precision = digits ?? (isForex ? 4 : instrument.includes('JPY') ? 3 : 2);
  const minMove = Math.pow(10, -precision);

  const fmt = (p: number) => p.toFixed(precision);

  // Convert pixel Y on the chart canvas to a price
  const yToPrice = useCallback((clientY: number): number | null => {
    const container = chartContainerRef.current;
    const series = candleSeriesRef.current;
    if (!container || !series) return null;
    const rect = container.getBoundingClientRect();
    const y = clientY - rect.top;
    try {
      return series.coordinateToPrice(y) as number;
    } catch {
      return null;
    }
  }, []);

  const computePnl = useCallback((price: number, pos: Position) => {
    const sign = pos.direction === 'long' ? 1 : -1;
    return sign * ((price - pos.entryPrice) / pos.entryPrice) * pos.size * NOTIONAL_PER_SIZE;
  }, []);

  const computePct = useCallback((price: number, pos: Position) => {
    const sign = pos.direction === 'long' ? 1 : -1;
    return sign * ((price - pos.entryPrice) / pos.entryPrice) * 100;
  }, []);

  // ── RAF loop: keep overlay band pixel coords in sync with chart ──
  useEffect(() => {
    const updateBands = () => {
      // Track the price-scale width even with no open position (drives control placement)
      try {
        const w = chartRef.current?.priceScale('right').width();
        if (w != null) setScaleWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
      } catch {
        /* chart not ready yet */
      }

      const series = candleSeriesRef.current;
      const container = chartContainerRef.current;
      if (!series || !container || !position) {
        setBandCoords(null);
        rafRef.current = requestAnimationFrame(updateBands);
        return;
      }
      const h = container.clientHeight;
      const isLong = position.direction === 'long';
      // While a bracket is dragged, the pill and its dashed lane follow the price
      // under the pointer instead of snapping only on drop.
      const chipDrag = chipDragRef.current;
      const dragged: DragTarget = (chipDrag && chipDrag.moved ? chipDrag.target : null) ?? dragTargetRef.current;
      const previewPrice = dragPriceRef.current;
      try {
        const entryY = series.priceToCoordinate(position.entryPrice) as number | null;
        const slPrice = position.slPct
          ? isLong ? position.entryPrice * (1 - position.slPct / 100) : position.entryPrice * (1 + position.slPct / 100)
          : null;
        const tpPrice = position.tpPct
          ? isLong ? position.entryPrice * (1 + position.tpPct / 100) : position.entryPrice * (1 - position.tpPct / 100)
          : null;
        const slY = dragged === 'sl' && previewPrice != null
          ? (series.priceToCoordinate(previewPrice) as number | null)
          : slPrice != null ? (series.priceToCoordinate(slPrice) as number | null) : null;
        const tpY = dragged === 'tp' && previewPrice != null
          ? (series.priceToCoordinate(previewPrice) as number | null)
          : tpPrice != null ? (series.priceToCoordinate(tpPrice) as number | null) : null;
        if (entryY != null) {
          const scaleW = chartRef.current?.priceScale('right').width() ?? 0;
          const next = { entryY, slY: slY ?? null, tpY: tpY ?? null, height: h, scaleW };
          // Only re-render when a coordinate actually moved — keeps the overlay
          // off the render path while the chart idles between ticks.
          setBandCoords((prev) =>
            prev && prev.entryY === next.entryY && prev.slY === next.slY &&
            prev.tpY === next.tpY && prev.height === next.height && prev.scaleW === next.scaleW
              ? prev
              : next,
          );
        } else {
          setBandCoords(null);
        }
      } catch {
        setBandCoords(null);
      }
      rafRef.current = requestAnimationFrame(updateBands);
    };
    rafRef.current = requestAnimationFrame(updateBands);
    return () => {
      cancelAnimationFrame(rafRef.current);
      cancelAnimationFrame(previewRafRef.current);
    };
  }, [position]);

  // ── 1. Initialize the chart on the terminal palette ──
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    // Canvas colours are literal values: resolve them from the theme tokens.
    const palette = readChartPalette(container);
    /* The axis labels are canvas text, so the only lever is the chart-wide font
       size (it drives the price scale and the time scale together). Compact
       screens get 10px so the digits stop crowding the plot; the laptop keeps
       the 12px it shipped with. */
    const axisFontSize = (width: number) => (width < 768 ? 10 : 12);
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: palette.background },
        textColor: palette.text,
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: axisFontSize(container.clientWidth),
      },
      // No grid mesh: the price canvas stays clean, only the candles and levels show.
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: palette.crosshair,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: palette.crosshairLabel,
        },
        horzLine: {
          color: palette.crosshair,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: palette.crosshairLabel,
        },
      },
      rightPriceScale: {
        borderColor: palette.border,
        scaleMargins: {
          top: 0.1,
          bottom: 0.15,
        },
      },
      timeScale: {
        borderColor: palette.border,
        timeVisible: true,
        secondsVisible: true,
        barSpacing: 9,
        minBarSpacing: 3,
        rightOffset: 12,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    chartRef.current = chart;

    // Candlestick series — the terminal's buy/sell pair
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: palette.up,
      downColor: palette.down,
      borderVisible: true,
      borderUpColor: palette.up,
      borderDownColor: palette.down,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
      priceFormat: {
        type: 'price',
        precision,
        minMove,
      },
    });
    candleSeriesRef.current = candleSeries;

    // Line series
    const lineSeries = chart.addSeries(LineSeries, {
      color: palette.line,
      lineWidth: 2,
      visible: false,
      priceFormat: {
        type: 'price',
        precision,
        minMove,
      },
    });
    lineSeriesRef.current = lineSeries;


    // Resize Observer for auto responsive sizing
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          chart.applyOptions({ width, height, layout: { fontSize: axisFontSize(width) } });
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [precision, minMove]);

  // ── 1b. Repaint the canvas when the light/dark switch flips ──
  // Everything else on the page repaints from CSS; the canvas holds literal
  // colours, so it takes a fresh palette on every theme change.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const palette = readChartPalette(chartContainerRef.current);
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: palette.background },
        textColor: palette.text,
      },
      crosshair: {
        vertLine: { color: palette.crosshair, labelBackgroundColor: palette.crosshairLabel },
        horzLine: { color: palette.crosshair, labelBackgroundColor: palette.crosshairLabel },
      },
      rightPriceScale: { borderColor: palette.border },
      timeScale: { borderColor: palette.border },
    });
    candleSeriesRef.current?.applyOptions({
      upColor: palette.up,
      downColor: palette.down,
      borderUpColor: palette.up,
      borderDownColor: palette.down,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
    });
    lineSeriesRef.current?.applyOptions({ color: palette.line });
  }, [mode]);

  // ── 1c. Seconds on the axis only where a bar moves in seconds ──
  // A 15s candle is unreadable without them; a 4h chart that printed :07 seconds
  // would only crowd the labels.
  useEffect(() => {
    chartRef.current?.timeScale().applyOptions({
      secondsVisible: TIMEFRAME_SECONDS[timeframe] < 180,
    });
  }, [timeframe]);

  // ── 2. Populate / Update Series Data ──
  // A full load happens once per market and once per timeframe. After that the newest
  // bar is pushed with update(), which mutates a candle in place while it is still
  // forming and appends it when its time moves on — that is what lets the chart move
  // with ticks. setData() rebuilds and re-fits the series, so it cannot animate a live
  // bar and it is far more expensive to do twelve times a second.
  const loadedSignatureRef = useRef<string>('');
  const loadedCountRef = useRef<number>(-1);
  const lastBarTimeRef = useRef<number>(-1);
  // The series the data is on. Precision is a dependency of the chart effect, so
  // selecting an instrument with different decimals builds a brand-new empty chart under
  // the same candles; tracking the series identity is what makes the next pass reload
  // the history instead of pushing one live bar onto nothing.
  const loadedSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const lineSeries = lineSeriesRef.current;
    if (!candleSeries || !lineSeries || candles.length === 0) return;

    // Bars arrive in time order; only a rebuild (market or timeframe switch) sorts.
    let ordered = true;
    for (let i = 1; i < candles.length; i++) {
      if (candles[i].time < candles[i - 1].time) {
        ordered = false;
        break;
      }
    }
    const source = ordered ? candles : [...candles].sort((a, b) => a.time - b.time);

    const cleanCandles: CandlestickData<UTCTimestamp>[] = [];
    let lastTime = -1;

    for (const c of source) {
      if (c.time > lastTime) {
        cleanCandles.push({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        });

        lastTime = c.time;
      }
    }

    const last = cleanCandles[cleanCandles.length - 1];
    // The instrument is part of the key: two series can open on the same minute, and
    // moving between them has to be a reload rather than an update onto the wrong market.
    const signature = `${instrument}:${timeframe}:${cleanCandles[0]?.time ?? 0}`;
    const needsFullLoad =
      candleSeries !== loadedSeriesRef.current ||
      loadedSignatureRef.current !== signature ||
      cleanCandles.length < loadedCountRef.current ||
      last.time < lastBarTimeRef.current;

    if (needsFullLoad) {
      candleSeries.setData(cleanCandles);
      lineSeries.setData(cleanCandles.map((c) => ({ time: c.time, value: c.close })));
    } else {
      // Same time as the bar already on the axis → the forming candle is replaced in
      // place. Later time → a fresh candle is appended.
      candleSeries.update(last);
      lineSeries.update({ time: last.time, value: last.close });
    }

    loadedSignatureRef.current = signature;
    loadedCountRef.current = cleanCandles.length;
    lastBarTimeRef.current = last.time;
    loadedSeriesRef.current = candleSeries;
    // precision is a dependency because a new chart can be built under the same candles;
    // the pass has to run again to notice and refill it.
  }, [candles, timeframe, instrument, precision]);

  // ── 3. Switch between Candlestick and Line mode ──
  useEffect(() => {
    if (candleSeriesRef.current && lineSeriesRef.current) {
      candleSeriesRef.current.applyOptions({
        visible: chartType === 'candlestick',
      });
      lineSeriesRef.current.applyOptions({
        visible: chartType === 'line',
      });
    }
  }, [chartType]);

  // ── 4. Position Lines (Entry, SL, TP) ──
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    if (entryLineRef.current) {
      candleSeries.removePriceLine(entryLineRef.current);
      entryLineRef.current = null;
    }
    if (slLineRef.current) {
      candleSeries.removePriceLine(slLineRef.current);
      slLineRef.current = null;
    }
    if (tpLineRef.current) {
      candleSeries.removePriceLine(tpLineRef.current);
      tpLineRef.current = null;
    }

    if (position) {
      const isLong = position.direction === 'long';
      const color = isLong ? 'var(--term-buy)' : 'var(--term-sell)';

      // Axis tags are intentionally hidden: the price scale stays clean and the
      // floating pills carry the size / P&L information instead.
      entryLineRef.current = candleSeries.createPriceLine({
        price: position.entryPrice,
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
      });

      if (position.slPct) {
        const slPrice = isLong
          ? position.entryPrice * (1 - position.slPct / 100)
          : position.entryPrice * (1 + position.slPct / 100);

        slLineRef.current = candleSeries.createPriceLine({
          price: slPrice,
          color: 'var(--term-sell)',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: false,
        });
      }

      if (position.tpPct) {
        const tpPrice = isLong
          ? position.entryPrice * (1 + position.tpPct / 100)
          : position.entryPrice * (1 - position.tpPct / 100);

        tpLineRef.current = candleSeries.createPriceLine({
          price: tpPrice,
          color: 'var(--term-buy)',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: false,
        });
      }
    }
  }, [position]);

  // ── 5. SL/TP Drag Handlers ──
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!position || readOnly) return;
    const price = yToPrice(e.clientY);
    if (price === null) return;
    const isLong = position.direction === 'long';
    const slPrice = position.slPct
      ? isLong ? position.entryPrice * (1 - position.slPct / 100) : position.entryPrice * (1 + position.slPct / 100)
      : null;
    const tpPrice = position.tpPct
      ? isLong ? position.entryPrice * (1 + position.tpPct / 100) : position.entryPrice * (1 - position.tpPct / 100)
      : null;
    const threshold = price * 0.0025;
    if (slPrice !== null && Math.abs(price - slPrice) < threshold) {
      dragTargetRef.current = 'sl';
      e.preventDefault();
    } else if (tpPrice !== null && Math.abs(price - tpPrice) < threshold) {
      dragTargetRef.current = 'tp';
      e.preventDefault();
    }
  }, [position, readOnly, yToPrice]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = dragTargetRef.current;
    if (!target || !position) return;
    const price = yToPrice(e.clientY);
    if (price === null || price <= 0) return;
    dragPriceRef.current = price;
    setDragInfo({ target, price, pnl: computePnl(price, position), pct: computePct(price, position), x: e.clientX, y: e.clientY });
    // Nudge the line that already exists instead of rebuilding it: applyOptions()
    // is allocation-free, so the level keeps up with the pointer.
    const line = target === 'sl' ? slLineRef.current : tpLineRef.current;
    line?.applyOptions({ price });
  }, [position, yToPrice, computePnl, computePct]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = dragTargetRef.current;
    if (!target || !position) { dragTargetRef.current = null; setDragInfo(null); return; }
    const price = yToPrice(e.clientY);
    dragTargetRef.current = null;
    dragPriceRef.current = null;
    setDragInfo(null);
    if (price === null || price <= 0) return;
    const rawPct = Math.abs((price - position.entryPrice) / position.entryPrice * 100);
    const clampedPct = Math.max(0.01, Math.min(10, rawPct));
    if (target === 'sl' && onSlChange) onSlChange(clampedPct);
    else if (target === 'tp' && onTpChange) onTpChange(clampedPct);
  }, [position, yToPrice, onSlChange, onTpChange]);

  // Snap the preview line back to the committed level when a drag is abandoned
  const restoreBracketLines = useCallback(() => {
    if (!position) return;
    const isLong = position.direction === 'long';
    if (slLineRef.current && position.slPct) {
      slLineRef.current.applyOptions({
        price: isLong
          ? position.entryPrice * (1 - position.slPct / 100)
          : position.entryPrice * (1 + position.slPct / 100),
      });
    }
    if (tpLineRef.current && position.tpPct) {
      tpLineRef.current.applyOptions({
        price: isLong
          ? position.entryPrice * (1 + position.tpPct / 100)
          : position.entryPrice * (1 - position.tpPct / 100),
      });
    }
  }, [position]);

  const handleMouseLeave = useCallback(() => {
    if (dragTargetRef.current) {
      dragTargetRef.current = null;
      dragPriceRef.current = null;
      setDragInfo(null);
      restoreBracketLines();
    }
  }, [restoreBracketLines]);

  // One preview per animation frame — pointermove fires far faster than the
  // display refreshes, and every preview rebuilds the overlay.
  const applyDragPreview = (target: 'sl' | 'tp', clientX: number, clientY: number) => {
    if (!position) return;
    const price = yToPrice(clientY);
    if (price === null || price <= 0) return;
    dragPriceRef.current = price;
    setDragInfo({
      target,
      price,
      pnl: computePnl(price, position),
      pct: computePct(price, position),
      x: clientX,
      y: clientY,
    });
    const line = target === 'sl' ? slLineRef.current : tpLineRef.current;
    line?.applyOptions({ price });
  };

  const queueDragPreview = (target: 'sl' | 'tp', clientX: number, clientY: number) => {
    pendingPreviewRef.current = { target, x: clientX, y: clientY };
    if (previewRafRef.current) return;
    previewRafRef.current = requestAnimationFrame(() => {
      previewRafRef.current = 0;
      const next = pendingPreviewRef.current;
      pendingPreviewRef.current = null;
      if (next) applyDragPreview(next.target, next.x, next.y);
    });
  };

  const flushPendingPreview = () => {
    pendingPreviewRef.current = null;
    if (previewRafRef.current) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = 0;
    }
  };

  const commitBracketDrag = (target: 'sl' | 'tp', clientY: number) => {
    flushPendingPreview();
    setDragInfo(null);
    dragPriceRef.current = null;
    if (!position) return;
    const price = yToPrice(clientY);
    if (price === null || price <= 0) return;
    const rawPct = Math.abs((price - position.entryPrice) / position.entryPrice * 100);
    const clampedPct = Math.max(0.01, Math.min(10, rawPct));
    if (target === 'sl') {
      if (onSlChange) onSlChange(clampedPct);
      else restoreBracketLines();
    } else if (onTpChange) {
      onTpChange(clampedPct);
    } else {
      restoreBracketLines();
    }
  };

  // Chip/line drag: a press arms the pointer, vertical movement past a small
  // dead zone starts previewing, release commits the level.
  const beginChipDrag = (target: 'sl' | 'tp', e: React.PointerEvent<HTMLElement>) => {
    if (readOnly) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    chipDragRef.current = { target, startY: e.clientY, moved: false };
  };

  const moveChipDrag = (e: React.PointerEvent<HTMLElement>) => {
    const drag = chipDragRef.current;
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientY - drag.startY) > 4) drag.moved = true;
    if (drag.moved) queueDragPreview(drag.target, e.clientX, e.clientY);
  };

  // Dragging the SL/TP pills on their own price lines only ever moves the level
  const endLineDrag = (e: React.PointerEvent<HTMLElement>) => {
    const drag = chipDragRef.current;
    chipDragRef.current = null;
    if (!drag) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    if (drag.moved) commitBracketDrag(drag.target, e.clientY);
    else setDragInfo(null);
  };

  const cancelChipDrag = () => {
    chipDragRef.current = null;
    flushPendingPreview();
    dragPriceRef.current = null;
    setDragInfo(null);
    restoreBracketLines();
  };

  const handleMouseMoveForCursor = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (dragTargetRef.current) { handleMouseMove(e); return; }
    if (!position || readOnly) return;
    const price = yToPrice(e.clientY);
    if (price === null) return;
    const isLong = position.direction === 'long';
    const slPrice = position.slPct
      ? isLong ? position.entryPrice * (1 - position.slPct / 100) : position.entryPrice * (1 + position.slPct / 100)
      : null;
    const tpPrice = position.tpPct
      ? isLong ? position.entryPrice * (1 + position.tpPct / 100) : position.entryPrice * (1 - position.tpPct / 100)
      : null;
    const threshold = price * 0.0025;
    if ((slPrice !== null && Math.abs(price - slPrice) < threshold) ||
        (tpPrice !== null && Math.abs(price - tpPrice) < threshold)) {
      setCursorStyle('ns-resize');
    } else {
      setCursorStyle('default');
    }
  }, [position, readOnly, yToPrice, handleMouseMove]);

  // ── Chart view control (bottom-right reset button) ──
  // scrollToPosition() takes the gap between the newest bar and the right edge in
  // bars, so it stays correct while the live series keeps appending every tick.
  const scrollToLatestBar = useCallback((rightGapBars: number) => {
    chartRef.current?.timeScale().scrollToPosition(rightGapBars, false);
  }, []);

  const handleResetChartView = useCallback(() => {
    const chart = chartRef.current;
    const container = chartContainerRef.current;
    if (!chart || !container) return;
    chart.priceScale('right').applyOptions({ autoScale: true });
    chart.timeScale().applyOptions({ barSpacing: 9, rightOffset: 12 });
    // Centre the newest candle: half a viewport of whitespace on the right
    const plotWidth = Math.max(
      160,
      container.clientWidth - (chart.priceScale('right').width() ?? 0),
    );
    scrollToLatestBar(Math.round(plotWidth / 9 / 2));
  }, [scrollToLatestBar]);

  // A frame switch changes how many bars the series holds and how many fit on the
  // axis, so the view is re-anchored on the newest candle instead of inheriting the
  // previous frame's scroll position (a 4h chart opening deep in a 1m chart's history
  // would otherwise land nowhere near the live edge).
  const frameMountedRef = useRef(false);
  useEffect(() => {
    if (!frameMountedRef.current) {
      frameMountedRef.current = true;
      return;
    }
    handleResetChartView();
  }, [timeframe, handleResetChartView]);

  const chartCtrlBtn =
    'flex items-center justify-center w-[24px] h-[24px] rounded-[3px] bg-[var(--term-surface)]/90 border border-[var(--term-border-hi)] text-[var(--term-label)] hover:text-[var(--term-strong)] hover:bg-[var(--term-border)] hover:border-[var(--term-border-hover)] transition-colors cursor-pointer shadow-sm';

  return (
    <div className="flex flex-col h-full w-full relative overflow-hidden select-none bg-[var(--term-panel-deep)]">
      {/* ── Top Bar: TradingView Chart Toolbar ── */}
      <div className="relative h-9 px-2 flex items-center justify-between text-xs shrink-0 border-b border-[var(--term-border)] bg-[var(--term-surface)]">
        {/* Left Controls — the laptop keeps the full strip; below md the bar
            folds down to the controls a thumb actually needs. */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {/* Laptop: the ticker sits in the bar, as it always has */}
          <span className="hidden md:inline font-extrabold text-sm tracking-wide text-white px-1.5 select-text">
            {instrument}
          </span>
          <span className="hidden md:block h-3.5 w-px bg-[var(--term-border)] mx-0.5" />

          {/* Compact: the timeframe in use, alone. Clicking it unfolds the rest,
              and while that list is open the rest of the dock steps aside. */}
          <button
            type="button"
            onClick={() => setTfMenuOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={tfMenuOpen}
            title="Timeframe"
            className={`md:hidden flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-semibold uppercase transition-colors cursor-pointer ${
              tfMenuOpen
                ? 'bg-[var(--term-primary)]/12 text-[var(--term-primary)]'
                : 'text-[var(--term-text)] hover:bg-[var(--term-raised)]'
            }`}
          >
            {timeframe}
            <ChevronDown size={11} className={`transition-transform ${tfMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Laptop: the full ladder inline */}
          <div className="hidden md:flex items-center gap-0.5">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => onTimeframeChange(tf)}
                className={`px-1.5 py-1 rounded text-xs font-semibold uppercase transition-colors ${
                  timeframe === tf
                    ? 'text-[var(--term-primary)] bg-[var(--term-primary)]/10'
                    : 'text-[var(--term-label)] hover:text-[var(--term-text)] hover:bg-[var(--term-raised)]'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {!tfMenuOpen && (
            <>
          <span className="h-3.5 w-px bg-[var(--term-border)] mx-0.5" />

          {/* Chart Type — worded on the laptop, a glyph on a phone */}
          <button
            onClick={() => setChartType(chartType === 'candlestick' ? 'line' : 'candlestick')}
            className="hidden md:inline-flex px-2 py-1 rounded text-xs font-semibold text-[var(--term-label)] hover:text-[var(--term-text)] hover:bg-[var(--term-raised)] transition-colors"
            title="Chart Type"
          >
            {chartType === 'candlestick' ? 'Candles' : 'Line'}
          </button>
          <button
            onClick={() => setChartType(chartType === 'candlestick' ? 'line' : 'candlestick')}
            className="md:hidden p-1 rounded text-[var(--term-label)] hover:text-[var(--term-text)] hover:bg-[var(--term-raised)] transition-colors"
            title={`Chart type: ${chartType === 'candlestick' ? 'candles' : 'line'} — click to switch`}
            aria-label="Chart type"
          >
            {chartType === 'candlestick'
              ? <CandlestickChart size={14} />
              : <LineChart size={14} />}
          </button>

          {/* Compact only: the rail that holds these tools is hidden below md */}
          <button
            type="button"
            onClick={() => setToolsOpen((open) => !open)}
            aria-label="Drawing tools"
            aria-expanded={toolsOpen}
            title="Drawing tools"
            className={`md:hidden p-1 rounded transition-colors ${
              toolsOpen
                ? 'bg-[var(--term-primary)]/12 text-[var(--term-primary)]'
                : 'text-[var(--term-label)] hover:text-[var(--term-text)] hover:bg-[var(--term-raised)]'
            }`}
          >
            <PencilRuler size={14} />
          </button>

          {/* Indicators — worded on the laptop, a glyph on a phone */}
          <button
            className="hidden md:flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold text-[var(--term-label)] hover:text-[var(--term-text)] hover:bg-[var(--term-raised)] transition-colors"
            title="Indicators"
          >
            <span className="italic font-serif text-[13px] text-[var(--term-primary)]">fx</span>
            <span>Indicators</span>
          </button>
          <button
            className="md:hidden p-1 rounded text-[var(--term-label)] hover:text-[var(--term-text)] hover:bg-[var(--term-raised)] transition-colors"
            title="Indicators"
            aria-label="Indicators"
          >
            <SquareFunction size={14} />
          </button>

          <span className="h-3.5 w-px bg-[var(--term-border)] mx-0.5" />

          {/* Undo / Redo */}
          <button className="p-1 rounded text-[var(--term-muted)] hover:text-[var(--term-text)] hover:bg-[var(--term-raised)]" title="Undo">
            <Undo2 size={13} />
          </button>
          <button className="p-1 rounded text-[var(--term-muted)] hover:text-[var(--term-text)] hover:bg-[var(--term-raised)]" title="Redo">
            <Redo2 size={13} />
          </button>
            </>
          )}
        </div>

        {/* The timeframe list is a child of the bar, not of the scrolling control
            row — otherwise its own overflow would clip the dropdown. */}
        {tfMenuOpen && (
          <>
            <button
              type="button"
              aria-label="Close timeframe menu"
              onClick={() => setTfMenuOpen(false)}
              className="fixed inset-0 z-30 cursor-default"
            />
            <div
              role="listbox"
              aria-label="Timeframe"
              className="absolute left-2 top-full z-40 mt-1 grid w-[132px] grid-cols-3 overflow-hidden rounded border border-[var(--term-border-hi)] bg-[var(--term-surface)] shadow-xl"
            >
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  type="button"
                  role="option"
                  aria-selected={tf === timeframe}
                  onClick={() => {
                    onTimeframeChange(tf);
                    setTfMenuOpen(false);
                  }}
                  className={`px-1 py-1.5 text-center text-xs font-semibold uppercase transition-colors ${
                    tf === timeframe
                      ? 'bg-[var(--term-primary)]/12 text-[var(--term-primary)]'
                      : 'text-[var(--term-label)] hover:bg-[var(--term-raised)] hover:text-[var(--term-text)]'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Phone palette: the rail that holds these tools on desktop is hidden
            below md, so the toolbar icon unfolds the same set here. */}
        {toolsOpen && (
          <div className="md:hidden">
            <button
              type="button"
              aria-label="Close drawing tools"
              onClick={() => setToolsOpen(false)}
              className="fixed inset-0 z-30 cursor-default"
            />
            <div className="absolute left-2 top-full z-40 mt-1 grid w-[84px] grid-cols-2 gap-1 rounded border border-[var(--term-border-hi)] bg-[var(--term-surface)] p-1 shadow-xl">
              <DrawToolButtons
                activeId={drawToolId}
                onPick={(id) => {
                  setDrawToolId(id);
                  setToolsOpen(false);
                }}
              />
            </div>
          </div>
        )}

        {/* Right Action Icons — hidden while the timeframe list owns the dock */}
        {!tfMenuOpen && (
        <div className="flex items-center gap-1 shrink-0 text-[var(--term-muted)]">
          {barCloseInSeconds != null && (
            <span
              className={`flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums transition-colors ${
                barCloseInSeconds <= 5
                  ? 'border-[var(--term-primary)]/50 bg-[var(--term-primary)]/10 text-[var(--term-primary)]'
                  : 'border-[var(--term-border)] bg-[var(--term-raised)] text-[var(--term-text)]'
              }`}
              title={`Time left on this ${timeframe.toUpperCase()} bar`}
            >
              <Clock size={11} />
              {formatCountdown(barCloseInSeconds)}
            </span>
          )}
          <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-[var(--term-label)] border border-[var(--term-border)] bg-[var(--term-raised)]">
            <span>Dark</span>
            <ChevronDown size={11} />
          </div>
          <button className="hidden md:inline-flex p-1.5 rounded hover:text-[var(--term-text)] hover:bg-[var(--term-raised)]" title="Chart Settings">
            <Settings size={13} />
          </button>
          <button className="hidden md:inline-flex p-1.5 rounded hover:text-[var(--term-text)] hover:bg-[var(--term-raised)]" title="Fullscreen">
            <Maximize2 size={13} />
          </button>
          <button className="hidden md:inline-flex p-1.5 rounded hover:text-[var(--term-text)] hover:bg-[var(--term-raised)]" title="Take Snapshot">
            <Camera size={13} />
          </button>
        </div>
        )}
      </div>

      {/* ── Chart Body with Left Tool Strip ── */}
      <div className="flex-1 flex w-full relative min-h-0 overflow-hidden">
        {/* Left Vertical TradingView Tool Strip — desktop only. On a phone the
            40px rail cost more chart than the buttons ever returned, so the
            plot gets the full width there. */}
        <div className="hidden md:flex w-10 flex-col items-center py-2 shrink-0 border-r border-[var(--term-border)] bg-[var(--term-surface)] text-[var(--term-muted)] gap-3 z-10">
          <button className="p-1.5 rounded hover:text-[var(--term-text)] hover:bg-[var(--term-raised)] transition-colors" title="Crosshair">
            <Crosshair size={15} />
          </button>
          <button className="p-1.5 rounded hover:text-[var(--term-text)] hover:bg-[var(--term-raised)] transition-colors" title="Trend Line">
            <Minus size={15} className="rotate-45" />
          </button>
          <button className="p-1.5 rounded hover:text-[var(--term-text)] hover:bg-[var(--term-raised)] transition-colors" title="Gann and Fibonacci Tools">
            <SlidersHorizontal size={15} />
          </button>
          <button className="p-1.5 rounded hover:text-[var(--term-text)] hover:bg-[var(--term-raised)] transition-colors" title="Brush">
            <Edit3 size={15} />
          </button>
          <button className="p-1.5 rounded hover:text-[var(--term-text)] hover:bg-[var(--term-raised)] transition-colors" title="Text">
            <Type size={15} />
          </button>
          <button className="p-1.5 rounded hover:text-[var(--term-text)] hover:bg-[var(--term-raised)] transition-colors" title="Measure">
            <Ruler size={15} />
          </button>
          <button className="p-1.5 rounded hover:text-[var(--term-text)] hover:bg-[var(--term-raised)] transition-colors" title="Zoom In">
            <ZoomIn size={15} />
          </button>

          <span className="w-5 h-px bg-[var(--term-border)]" />

          <button className="p-1.5 rounded hover:text-[var(--term-text)] hover:bg-[var(--term-raised)] transition-colors" title="Magnet Mode">
            <Magnet size={15} />
          </button>
          <button className="p-1.5 rounded hover:text-[var(--term-text)] hover:bg-[var(--term-raised)] transition-colors" title="Lock All Drawing Tools">
            <Lock size={15} />
          </button>
          <button className="p-1.5 rounded hover:text-[var(--term-text)] hover:bg-[var(--term-raised)] transition-colors" title="Hide All Drawings">
            <Eye size={15} />
          </button>
          <button className="p-1.5 rounded hover:text-[var(--term-text)] hover:bg-[var(--term-raised)] transition-colors" title="Remove Drawings">
            <Trash2 size={15} />
          </button>

          {/* TV Logo at bottom */}
          <div className="mt-auto flex flex-col items-center gap-1 pt-2">
            <div
              className="w-5 h-5 rounded-full border border-[var(--term-border-hi)] flex items-center justify-center text-[8px] font-bold text-[var(--term-label)]"
              title="TradingView"
            >
              tv
            </div>
          </div>
        </div>

        {/* Center Chart Container with Faint Watermark */}
        <div className="flex-1 w-full h-full relative overflow-hidden bg-[var(--term-panel-deep)]">
          {/* Subtle Watermark behind candles */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
            <span className="text-3xl md:text-5xl font-black tracking-wider text-[var(--term-raised)] uppercase font-mono">
              {instrument} {timeframe}
            </span>
          </div>

          {/* The TradingView Canvas — drag-enabled for SL/TP */}
          <div
            ref={chartContainerRef}
            className="absolute inset-0 w-full h-full z-[1]"
            style={{ cursor: cursorStyle }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMoveForCursor}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          />

          {/* Symbol legend — compact only; the laptop bar already names it */}
          <div className="md:hidden pointer-events-none absolute left-2 top-1.5 z-[3] flex items-center gap-1.5 font-mono select-none">
            <span className="text-[11px] font-bold tracking-wide text-[var(--term-strong)] drop-shadow-[0_1px_2px_var(--term-panel-deep)]">
              {instrument}
            </span>
            <span aria-hidden className="h-3 w-px bg-[var(--term-border-hi)]" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--term-label)] drop-shadow-[0_1px_2px_var(--term-panel-deep)]">
              {timeframe}
            </span>
          </div>

          {/* ── TopstepX Order Visualization Overlay ── */}
          {position && bandCoords && (() => {
            const isLong = position.direction === 'long';
            const { entryY, slY, tpY, scaleW } = bandCoords;
            // Breathing room between the pills and the price axis on the right.
            const axisGap = 36;
            const entryColor = isLong ? 'var(--term-buy)' : 'var(--term-sell)';
            const posLabel   = isLong ? 'BUY' : 'SELL';
            const liveSign   = isLong ? 1 : -1;
            const livePnl    = liveSign * ((currentPrice - position.entryPrice) / position.entryPrice) * position.size * NOTIONAL_PER_SIZE;

            const slPrice = position.slPct
              ? isLong ? position.entryPrice * (1 - position.slPct / 100) : position.entryPrice * (1 + position.slPct / 100)
              : null;
            const tpPrice = position.tpPct
              ? isLong ? position.entryPrice * (1 + position.tpPct / 100) : position.entryPrice * (1 - position.tpPct / 100)
              : null;
            const slPnl = slPrice != null ? liveSign * ((slPrice - position.entryPrice) / position.entryPrice) * position.size * NOTIONAL_PER_SIZE : 0;
            const tpPnl = tpPrice != null ? liveSign * ((tpPrice - position.entryPrice) / position.entryPrice) * position.size * NOTIONAL_PER_SIZE : 0;

            // An unarmed bracket still shows a ghost pill while it is dragged
            const dragging = dragInfo?.target ?? null;
            const previewSl = dragging === 'sl' && dragInfo ? dragInfo.price : slPrice;
            const previewTp = dragging === 'tp' && dragInfo ? dragInfo.price : tpPrice;
            const previewSlPnl = dragging === 'sl' && dragInfo ? dragInfo.pnl : slPnl;
            const previewTpPnl = dragging === 'tp' && dragInfo ? dragInfo.pnl : tpPnl;

            return (
              <div className="absolute inset-0 z-[2] overflow-hidden" style={{ pointerEvents: 'none' }}>
                {/* SVG lines & bands */}
                <svg className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
                  {/* SL band */}
                  {slY != null && (
                    <>
                      <rect x={0} y={Math.min(entryY, slY)} width="100%" height={Math.max(1, Math.abs(entryY - slY))} fill="color-mix(in srgb, var(--term-sell) 7%, transparent)" />
                      <line x1={0} y1={slY} x2="100%" y2={slY} stroke="var(--term-sell)" strokeWidth={1.5} strokeDasharray="6 4" />
                    </>
                  )}
                  {/* TP band */}
                  {tpY != null && (
                    <>
                      <rect x={0} y={Math.min(entryY, tpY)} width="100%" height={Math.max(1, Math.abs(entryY - tpY))} fill="color-mix(in srgb, var(--term-buy) 7%, transparent)" />
                      <line x1={0} y1={tpY} x2="100%" y2={tpY} stroke="var(--term-buy)" strokeWidth={1.5} strokeDasharray="6 4" />
                    </>
                  )}
                  {/* Entry line */}
                  <line x1={0} y1={entryY} x2="100%" y2={entryY} stroke={entryColor} strokeWidth={1.5} />
                </svg>

                {/* ── TopstepX floating pill labels ── */}

                {/* SL pill — no fill, just the level text sitting on the dashed line */}
                {slY != null && previewSl != null && (
                  <div
                    className="absolute flex items-center gap-0 select-none cursor-ns-resize"
                    style={{ right: scaleW + axisGap, top: slY - 13, pointerEvents: 'auto' }}
                    onPointerDown={(e) => beginChipDrag('sl', e)}
                    onPointerMove={moveChipDrag}
                    onPointerUp={endLineDrag}
                    onPointerCancel={cancelChipDrag}
                    title="Drag to move stop loss"
                  >
                    <div
                      className="flex items-center gap-1.5 font-mono font-extrabold text-[12px] px-2 py-[2px] rounded-[3px]"
                      style={{
                        background: 'transparent',
                        border: '1px solid color-mix(in srgb, var(--term-sell) 55%, transparent)',
                        color: 'var(--term-sell)',
                        textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                      }}
                    >
                      <span className="opacity-70 text-[11px]">~</span>
                      <span className="tabular-nums">{previewSlPnl < 0 ? '' : '+'}{previewSlPnl.toFixed(2)}</span>
                      <span className="opacity-60 font-bold mx-0.5">|</span>
                      <span className="text-[11px] font-bold">{position.size}</span>
                      <button
                        className="ml-1 font-bold text-[12px] leading-none cursor-pointer text-[var(--term-sell)] hover:text-[var(--term-strong)] transition-colors"
                        onClick={() => onSlChange?.(0)}
                        title="Remove SL"
                        style={{ pointerEvents: 'auto' }}
                      >×</button>
                    </div>
                  </div>
                )}

                {/* Entry / Position tool — TradingView-style segmented pill:
                    [size] [live P&L in USD] [×] joined to the entry price line.
                    Reverse / SL / TP live in the order panel, typed as prices. */}
                <div
                  className="absolute flex items-center gap-[3px] select-none"
                  style={{ right: scaleW + axisGap, top: entryY - 11, pointerEvents: 'auto' }}
                >
                  {/* Size box — static side colour (long green / short red), not P&L driven */}
                  <div
                    className="flex items-center justify-center h-[22px] min-w-[28px] px-1.5 rounded-[3px] font-mono text-[12px] font-extrabold text-[var(--term-canvas)] shadow-lg"
                    style={{ background: entryColor }}
                    title={`${isLong ? 'Long' : 'Short'} ${position.size} @ ${fmt(position.entryPrice)}`}
                  >
                    {isLong ? '+' : '-'}{position.size}
                  </div>

                  {/* Live P&L box */}
                  <div
                    className="flex items-center gap-1 h-[22px] px-2 rounded-[3px] font-mono text-[12px] font-extrabold tabular-nums shadow-lg"
                    style={{
                      background: 'var(--term-raised-hi)',
                      border: `1px solid ${livePnl >= 0 ? 'color-mix(in srgb, var(--term-buy) 50%, transparent)' : 'color-mix(in srgb, var(--term-sell) 50%, transparent)'}`,
                      color: livePnl >= 0 ? 'var(--term-buy-bright)' : 'var(--term-sell)',
                    }}
                  >
                    <span>
                      {livePnl >= 0 ? '+' : '-'}
                      {Math.abs(livePnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[9px] font-bold tracking-wide opacity-70">USD</span>
                  </div>

                  {/* Close box */}
                  {!readOnly && (
                    <button
                      className="flex items-center justify-center h-[22px] w-[22px] rounded-[3px] bg-[var(--term-raised-hi)] border border-[var(--term-border-hi)] text-[var(--term-label)] font-bold text-[13px] leading-none hover:bg-[var(--term-sell)] hover:border-[var(--term-sell)] hover:text-[var(--term-strong)] transition-colors shadow-lg"
                      onClick={onClose}
                      title="Close position"
                      style={{ pointerEvents: 'auto' }}
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* TP pill — no fill, just the level text sitting on the dashed line */}
                {tpY != null && previewTp != null && (
                  <div
                    className="absolute flex items-center gap-0 select-none cursor-ns-resize"
                    style={{ right: scaleW + axisGap, top: tpY - 13, pointerEvents: 'auto' }}
                    onPointerDown={(e) => beginChipDrag('tp', e)}
                    onPointerMove={moveChipDrag}
                    onPointerUp={endLineDrag}
                    onPointerCancel={cancelChipDrag}
                    title="Drag to move take profit"
                  >
                    <div
                      className="flex items-center gap-1.5 font-mono font-extrabold text-[12px] px-2 py-[2px] rounded-[3px]"
                      style={{
                        background: 'transparent',
                        border: '1px solid color-mix(in srgb, var(--term-buy) 55%, transparent)',
                        color: 'var(--term-buy-bright)',
                        textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                      }}
                    >
                      <span className="opacity-70 text-[11px]">~</span>
                      <span className="tabular-nums">+{previewTpPnl.toFixed(2)}</span>
                      <span className="opacity-60 font-bold mx-0.5">|</span>
                      <span className="text-[11px] font-bold">{position.size}</span>
                      <button
                        className="ml-1 font-bold text-[12px] leading-none cursor-pointer text-[var(--term-buy-bright)] hover:text-[var(--term-strong)] transition-colors"
                        onClick={() => onTpChange?.(0)}
                        title="Remove TP"
                        style={{ pointerEvents: 'auto' }}
                      >×</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Drag Tooltip Overlay ── */}
          {dragInfo && (
            <div
              className="fixed z-50 pointer-events-none"
              style={{ left: dragInfo.x + 18, top: dragInfo.y - 14 }}
            >
              <div
                className="flex flex-col items-start gap-0.5 px-3 py-1.5 rounded-lg border text-[11px] font-mono shadow-2xl"
                style={{
                  background: dragInfo.target === 'sl' ? 'var(--term-sell-dim)' : 'var(--term-buy-dim)',
                  borderColor: dragInfo.target === 'sl' ? 'var(--term-sell)' : 'var(--term-buy)',
                  color: 'var(--term-strong)',
                }}
              >
                <span className="font-extrabold uppercase text-[10px] tracking-widest" style={{ color: dragInfo.target === 'sl' ? 'var(--term-sell)' : 'var(--term-buy)' }}>
                  {dragInfo.target === 'sl' ? '🛑 Stop Loss' : '🎯 Take Profit'}
                </span>
                <span className="font-bold tabular-nums text-[var(--term-text)]">{fmt(dragInfo.price)}</span>
                <span className="font-extrabold tabular-nums text-[15px]" style={{ color: dragInfo.pnl >= 0 ? 'var(--term-buy)' : 'var(--term-sell)' }}>
                  P/L {dragInfo.pnl >= 0 ? '+' : ''}${dragInfo.pnl.toFixed(2)}
                </span>
                <span className="text-[9px] text-[var(--term-label)]">
                  {dragInfo.pct >= 0 ? '+' : ''}{dragInfo.pct.toFixed(3)}% from entry
                </span>
              </div>
            </div>
          )}

          {/* SL/TP drag hint */}
          {position && (position.slPct || position.tpPct) && !dragInfo && (
            <div className="absolute bottom-3 left-14 z-10 text-[9px] font-mono text-[var(--term-muted)] bg-[var(--term-surface)]/80 px-2 py-0.5 rounded border border-[var(--term-border)] pointer-events-none">
              Drag SL/TP lines to adjust
            </div>
          )}

          {/* ── Chart view control: reset zoom / scroll back to the latest bars ── */}
          <div
            className="absolute z-10 flex items-center"
            style={{ right: scaleWidth + 8, bottom: 44 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button onClick={handleResetChartView} className={chartCtrlBtn} title="Reset chart view">
              <RotateCcw size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Bottom Bar: Time Scale & TradingView Status — laptop only; on a
          phone this line had nothing left to say, so the plot keeps the height ── */}
      <div className="hidden md:flex h-6 px-3 justify-between items-center shrink-0 text-[10px] font-mono bg-[var(--term-surface)] border-t border-[var(--term-border)] text-[var(--term-muted)] z-10">
        <div className="hidden md:flex items-center gap-2">
          {['1d', '5d', '1m', '3m', '6m', '1y', '5y'].map((rng) => (
            <span key={rng} className="hover:text-[var(--term-text)] cursor-pointer transition-colors uppercase">
              {rng}
            </span>
          ))}
        </div>
        {/* Compact keeps the clock and the result only; the laptop keeps the
            full status line the chart has always printed */}
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden md:inline">{candles.length} bars</span>
          <span className="hidden md:inline text-[var(--term-border-hi)]">•</span>
          <span>UTC+5:30</span>
          <span className="hidden md:inline text-[var(--term-border-hi)]">•</span>
          <span className="hidden md:inline text-[var(--term-buy)] font-semibold">% log auto</span>
        </div>
      </div>
    </div>
  );
}
