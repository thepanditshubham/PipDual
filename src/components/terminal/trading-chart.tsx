'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Candle, Position, Trade } from '@/lib/engine/types';
import type { Timeframe } from '@/lib/engine/market-feed';
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
} from 'lightweight-charts';
import {
  SlidersHorizontal,
  Undo2,
  Redo2,
  Settings,
  Maximize2,
  Camera,
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

type DragTarget = 'sl' | 'tp' | null;

interface TradingChartProps {
  candles: Candle[];
  currentPrice: number;
  position: Position | null;
  trades: Trade[];
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  instrument?: string;
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
  instrument = 'XAU/USD',
  readOnly = false,
  onSlChange,
  onTpChange,
  onClose,
}: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Price lines refs for active position
  const entryLineRef = useRef<IPriceLine | null>(null);
  const slLineRef = useRef<IPriceLine | null>(null);
  const tpLineRef = useRef<IPriceLine | null>(null);

  // Chart settings
  const [chartType, setChartType] = useState<'candlestick' | 'line'>('candlestick');

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

  // Precision based on instrument
  const isForex = instrument.includes('/') && !instrument.includes('BTC') && !instrument.includes('XAU') && !instrument.includes('JPY');
  const precision = isForex ? 4 : instrument.includes('JPY') ? 3 : 2;
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

  // ── 1. Initialize TradingView Chart with Exact Dark Theme ──
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    // TradingView authentic dark theme options
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#111215' },
        textColor: '#787b86',
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 12,
      },
      // No grid mesh: the price canvas stays clean, only the candles and levels show.
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#6c7080',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1f2229',
        },
        horzLine: {
          color: '#6c7080',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1f2229',
        },
      },
      rightPriceScale: {
        borderColor: '#1f2229',
        scaleMargins: {
          top: 0.1,
          bottom: 0.15,
        },
      },
      timeScale: {
        borderColor: '#1f2229',
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

    // Candlestick Series — TradingView Exact Colors
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#089981',
      downColor: '#f23645',
      borderVisible: true,
      borderUpColor: '#089981',
      borderDownColor: '#f23645',
      wickUpColor: '#089981',
      wickDownColor: '#f23645',
      priceFormat: {
        type: 'price',
        precision,
        minMove,
      },
    });
    candleSeriesRef.current = candleSeries;

    // Line Series
    const lineSeries = chart.addSeries(LineSeries, {
      color: '#2962ff',
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
          chart.applyOptions({ width, height });
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

  // ── 2. Populate / Update Series Data ──
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const lineSeries = lineSeriesRef.current;
    if (!candleSeries || !lineSeries || candles.length === 0) return;

    const sorted = [...candles].sort((a, b) => a.time - b.time);
    const cleanCandles: any[] = [];
    let lastTime = -1;

    for (const c of sorted) {
      if (c.time > lastTime) {
        cleanCandles.push({
          time: c.time as any,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        });

        lastTime = c.time;
      }
    }

    candleSeries.setData(cleanCandles);
    lineSeries.setData(cleanCandles.map((c) => ({ time: c.time, value: c.close })));
  }, [candles]);

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
      const color = isLong ? '#089981' : '#f23645';

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
          color: '#f23645',
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
          color: '#089981',
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
  // bars, so it is stable while setData() appends ticks every frame.
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

  const chartCtrlBtn =
    'flex items-center justify-center w-[24px] h-[24px] rounded-[3px] bg-[#131417]/90 border border-[#2a2e39] text-[#787b86] hover:text-white hover:bg-[#1f2229] hover:border-[#3d4250] transition-colors cursor-pointer shadow-sm';

  return (
    <div className="flex flex-col h-full w-full relative overflow-hidden select-none bg-[#111215]">
      {/* ── Top Bar: TradingView Chart Toolbar ── */}
      <div className="h-9 px-2 flex items-center justify-between text-xs shrink-0 border-b border-[#1f2229] bg-[#131417]">
        {/* Left Controls */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {/* Ticker Name in Bold */}
          <span className="font-extrabold text-sm tracking-wide text-white px-1.5 select-text">
            {instrument}
          </span>

          <span className="h-3.5 w-px bg-[#1f2229] mx-0.5" />

          {/* Timeframe Selector */}
          <div className="flex items-center gap-0.5">
            {(['1m', '5m', '15m', '1h'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => onTimeframeChange(tf)}
                className={`px-2 py-1 rounded text-xs font-semibold uppercase transition-colors ${
                  timeframe === tf
                    ? 'text-[#2962ff] bg-[#2962ff]/10'
                    : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1a1c22]'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <span className="h-3.5 w-px bg-[#1f2229] mx-0.5" />

          {/* Chart Type (Candles vs Line) */}
          <button
            onClick={() => setChartType(chartType === 'candlestick' ? 'line' : 'candlestick')}
            className="px-2 py-1 rounded text-xs font-semibold text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1a1c22] transition-colors"
            title="Chart Type"
          >
            {chartType === 'candlestick' ? 'Candles' : 'Line'}
          </button>

          {/* Indicators Button */}
          <button
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1a1c22] transition-colors"
            title="Indicators"
          >
            <span className="italic font-serif text-[13px] text-[#2962ff]">fx</span>
            <span>Indicators</span>
          </button>

          <span className="h-3.5 w-px bg-[#1f2229] mx-0.5" />

          {/* Undo / Redo */}
          <button className="p-1 rounded text-[#6c7080] hover:text-[#d1d4dc] hover:bg-[#1a1c22]" title="Undo">
            <Undo2 size={13} />
          </button>
          <button className="p-1 rounded text-[#6c7080] hover:text-[#d1d4dc] hover:bg-[#1a1c22]" title="Redo">
            <Redo2 size={13} />
          </button>
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center gap-1 shrink-0 text-[#6c7080]">
          <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-[#9598a1] border border-[#22252c] bg-[#181a20]">
            <span>Dark</span>
            <ChevronDown size={11} />
          </div>
          <button className="p-1.5 rounded hover:text-[#d1d4dc] hover:bg-[#1a1c22]" title="Chart Settings">
            <Settings size={13} />
          </button>
          <button className="p-1.5 rounded hover:text-[#d1d4dc] hover:bg-[#1a1c22]" title="Fullscreen">
            <Maximize2 size={13} />
          </button>
          <button className="p-1.5 rounded hover:text-[#d1d4dc] hover:bg-[#1a1c22]" title="Take Snapshot">
            <Camera size={13} />
          </button>
        </div>
      </div>

      {/* ── Chart Body with Left Tool Strip ── */}
      <div className="flex-1 flex w-full relative min-h-0 overflow-hidden">
        {/* Left Vertical TradingView Tool Strip */}
        <div className="w-10 flex flex-col items-center py-2 shrink-0 border-r border-[#1f2229] bg-[#131417] text-[#6c7080] gap-3 z-10">
          <button className="p-1.5 rounded hover:text-[#d1d4dc] hover:bg-[#1a1c22] transition-colors" title="Crosshair">
            <Crosshair size={15} />
          </button>
          <button className="p-1.5 rounded hover:text-[#d1d4dc] hover:bg-[#1a1c22] transition-colors" title="Trend Line">
            <Minus size={15} className="rotate-45" />
          </button>
          <button className="p-1.5 rounded hover:text-[#d1d4dc] hover:bg-[#1a1c22] transition-colors" title="Gann and Fibonacci Tools">
            <SlidersHorizontal size={15} />
          </button>
          <button className="p-1.5 rounded hover:text-[#d1d4dc] hover:bg-[#1a1c22] transition-colors" title="Brush">
            <Edit3 size={15} />
          </button>
          <button className="p-1.5 rounded hover:text-[#d1d4dc] hover:bg-[#1a1c22] transition-colors" title="Text">
            <Type size={15} />
          </button>
          <button className="p-1.5 rounded hover:text-[#d1d4dc] hover:bg-[#1a1c22] transition-colors" title="Measure">
            <Ruler size={15} />
          </button>
          <button className="p-1.5 rounded hover:text-[#d1d4dc] hover:bg-[#1a1c22] transition-colors" title="Zoom In">
            <ZoomIn size={15} />
          </button>

          <span className="w-5 h-px bg-[#1f2229]" />

          <button className="p-1.5 rounded hover:text-[#d1d4dc] hover:bg-[#1a1c22] transition-colors" title="Magnet Mode">
            <Magnet size={15} />
          </button>
          <button className="p-1.5 rounded hover:text-[#d1d4dc] hover:bg-[#1a1c22] transition-colors" title="Lock All Drawing Tools">
            <Lock size={15} />
          </button>
          <button className="p-1.5 rounded hover:text-[#d1d4dc] hover:bg-[#1a1c22] transition-colors" title="Hide All Drawings">
            <Eye size={15} />
          </button>
          <button className="p-1.5 rounded hover:text-[#d1d4dc] hover:bg-[#1a1c22] transition-colors" title="Remove Drawings">
            <Trash2 size={15} />
          </button>

          {/* TV Logo at bottom */}
          <div className="mt-auto flex flex-col items-center gap-1 pt-2">
            <div
              className="w-5 h-5 rounded-full border border-[#2a2e39] flex items-center justify-center text-[8px] font-bold text-[#787b86]"
              title="TradingView"
            >
              tv
            </div>
          </div>
        </div>

        {/* Center Chart Container with Faint Watermark */}
        <div className="flex-1 w-full h-full relative overflow-hidden bg-[#111215]">
          {/* Subtle Watermark behind candles */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
            <span className="text-3xl md:text-5xl font-black tracking-wider text-[#181a20] uppercase font-mono">
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

          {/* ── TopstepX Order Visualization Overlay ── */}
          {position && bandCoords && (() => {
            const isLong = position.direction === 'long';
            const { entryY, slY, tpY, scaleW } = bandCoords;
            // Breathing room between the pills and the price axis on the right.
            const axisGap = 36;
            const entryColor = isLong ? '#089981' : '#f23645';
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
                      <rect x={0} y={Math.min(entryY, slY)} width="100%" height={Math.max(1, Math.abs(entryY - slY))} fill="rgba(242,54,69,0.07)" />
                      <line x1={0} y1={slY} x2="100%" y2={slY} stroke="#f23645" strokeWidth={1.5} strokeDasharray="6 4" />
                    </>
                  )}
                  {/* TP band */}
                  {tpY != null && (
                    <>
                      <rect x={0} y={Math.min(entryY, tpY)} width="100%" height={Math.max(1, Math.abs(entryY - tpY))} fill="rgba(8,153,129,0.07)" />
                      <line x1={0} y1={tpY} x2="100%" y2={tpY} stroke="#089981" strokeWidth={1.5} strokeDasharray="6 4" />
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
                        border: '1px solid rgba(242,54,69,0.55)',
                        color: '#f23645',
                        textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                      }}
                    >
                      <span className="opacity-70 text-[11px]">~</span>
                      <span className="tabular-nums">{previewSlPnl < 0 ? '' : '+'}{previewSlPnl.toFixed(2)}</span>
                      <span className="opacity-60 font-bold mx-0.5">|</span>
                      <span className="text-[11px] font-bold">{position.size}</span>
                      <button
                        className="ml-1 font-bold text-[12px] leading-none cursor-pointer text-[#f23645] hover:text-white transition-colors"
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
                    className="flex items-center justify-center h-[22px] min-w-[28px] px-1.5 rounded-[3px] font-mono text-[12px] font-extrabold text-white shadow-lg"
                    style={{ background: entryColor }}
                    title={`${isLong ? 'Long' : 'Short'} ${position.size} @ ${fmt(position.entryPrice)}`}
                  >
                    {isLong ? '+' : '-'}{position.size}
                  </div>

                  {/* Live P&L box */}
                  <div
                    className="flex items-center gap-1 h-[22px] px-2 rounded-[3px] font-mono text-[12px] font-extrabold tabular-nums shadow-lg"
                    style={{
                      background: '#1c1f27',
                      border: `1px solid ${livePnl >= 0 ? '#089981' : '#f23645'}80`,
                      color: livePnl >= 0 ? '#0ecb81' : '#f23645',
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
                      className="flex items-center justify-center h-[22px] w-[22px] rounded-[3px] bg-[#1c1f27] border border-[#2a2e39] text-[#9598a1] font-bold text-[13px] leading-none hover:bg-[#f23645] hover:border-[#f23645] hover:text-white transition-colors shadow-lg"
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
                        border: '1px solid rgba(8,153,129,0.55)',
                        color: '#0ecb81',
                        textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                      }}
                    >
                      <span className="opacity-70 text-[11px]">~</span>
                      <span className="tabular-nums">+{previewTpPnl.toFixed(2)}</span>
                      <span className="opacity-60 font-bold mx-0.5">|</span>
                      <span className="text-[11px] font-bold">{position.size}</span>
                      <button
                        className="ml-1 font-bold text-[12px] leading-none cursor-pointer text-[#0ecb81] hover:text-white transition-colors"
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
                  background: dragInfo.target === 'sl' ? '#1a0608' : '#011a15',
                  borderColor: dragInfo.target === 'sl' ? '#f23645' : '#089981',
                  color: '#fff',
                }}
              >
                <span className="font-extrabold uppercase text-[10px] tracking-widest" style={{ color: dragInfo.target === 'sl' ? '#f23645' : '#089981' }}>
                  {dragInfo.target === 'sl' ? '🛑 Stop Loss' : '🎯 Take Profit'}
                </span>
                <span className="font-bold tabular-nums text-[#d1d4dc]">{fmt(dragInfo.price)}</span>
                <span className="font-extrabold tabular-nums text-[15px]" style={{ color: dragInfo.pnl >= 0 ? '#089981' : '#f23645' }}>
                  P/L {dragInfo.pnl >= 0 ? '+' : ''}${dragInfo.pnl.toFixed(2)}
                </span>
                <span className="text-[9px] text-[#787b86]">
                  {dragInfo.pct >= 0 ? '+' : ''}{dragInfo.pct.toFixed(3)}% from entry
                </span>
              </div>
            </div>
          )}

          {/* SL/TP drag hint */}
          {position && (position.slPct || position.tpPct) && !dragInfo && (
            <div className="absolute bottom-3 left-14 z-10 text-[9px] font-mono text-[#6c7080] bg-[#131417]/80 px-2 py-0.5 rounded border border-[#1f2229] pointer-events-none">
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

      {/* ── Bottom Bar: Time Scale & TradingView Status ── */}
      <div className="h-6 px-3 flex justify-between items-center shrink-0 text-[10px] font-mono bg-[#131417] border-t border-[#1f2229] text-[#6c7080] z-10">
        <div className="flex items-center gap-2">
          {['1d', '5d', '1m', '3m', '6m', '1y', '5y'].map((rng) => (
            <span key={rng} className="hover:text-[#d1d4dc] cursor-pointer transition-colors uppercase">
              {rng}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span>{candles.length} bars</span>
          <span className="text-[#2a2e39]">•</span>
          <span>UTC+5:30</span>
          <span className="text-[#2a2e39]">•</span>
          <span className="text-[#089981] font-semibold">% log auto</span>
        </div>
      </div>
    </div>
  );
}
