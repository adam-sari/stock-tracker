'use client';

import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries, type IChartApi, type ISeriesApi, type Time, ColorType } from 'lightweight-charts';
import { SessionHighlightingPrimitive } from '@/vendor/lightweight-charts-session-highlighting';
import type { Bar } from '@/lib/providers/types';

type Props = {
  bars: Bar[];
  height?: number;
  showSessions?: boolean;
};

const PRE_COLOR = 'rgba(125, 211, 252, 0.06)';
const POST_COLOR = 'rgba(252, 165, 165, 0.06)';

export function Chart({ bars, height = 320, showSessions = true }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const sessionPrimitiveRef = useRef<SessionHighlightingPrimitive | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#0f172a' },
        textColor: '#e2e8f0',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#334155' },
      rightPriceScale: { borderColor: '#334155' },
    });
    // v5 API: addSeries(SeriesDefinition, options) replaces addCandlestickSeries(options)
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#86efac', downColor: '#fca5a5',
      borderUpColor: '#86efac', borderDownColor: '#fca5a5',
      wickUpColor: '#86efac', wickDownColor: '#fca5a5',
    });
    if (showSessions) {
      const primitive = new SessionHighlightingPrimitive((time) => {
        const ts = typeof time === 'number' ? time : (time as unknown as { timestamp: number }).timestamp;
        const bar = bars.find(b => b.ts === ts);
        if (!bar) return null;
        if (bar.session === 'pre') return PRE_COLOR;
        if (bar.session === 'post') return POST_COLOR;
        return null;
      });
      series.attachPrimitive(primitive);
      sessionPrimitiveRef.current = primitive;
    }
    chartRef.current = chart;
    seriesRef.current = series;
    return () => { chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, [height, showSessions]);

  useEffect(() => {
    if (!seriesRef.current) return;
    const data = bars.map(b => ({
      time: b.ts as Time,
      open: b.open, high: b.high, low: b.low, close: b.close,
    }));
    seriesRef.current.setData(data);
    if (sessionPrimitiveRef.current) {
      sessionPrimitiveRef.current.setData(bars.map(b => b.ts as Time));
    }
  }, [bars]);

  return <div ref={containerRef} style={{ width: '100%', height }} className="rounded border border-border" />;
}
