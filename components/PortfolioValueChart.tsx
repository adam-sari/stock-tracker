'use client';

import { useEffect, useRef } from 'react';
import {
  createChart,
  AreaSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type Time,
  ColorType,
} from 'lightweight-charts';

export type ValuePoint = { ts: number; value: number; cost_basis: number };

type Props = {
  series: ValuePoint[];
  height?: number;
};

export function PortfolioValueChart({ series, height = 360 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const valueSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const costSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Mount chart once
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

    // Area series for portfolio value
    const valueSeries = chart.addSeries(AreaSeries, {
      lineColor: '#60a5fa',
      topColor: 'rgba(96, 165, 250, 0.25)',
      bottomColor: 'rgba(96, 165, 250, 0.01)',
      lineWidth: 2,
    });

    // Dashed line for cost basis
    const costSeries = chart.addSeries(LineSeries, {
      color: '#94a3b8',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
    });

    chartRef.current = chart;
    valueSeriesRef.current = valueSeries;
    costSeriesRef.current = costSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      valueSeriesRef.current = null;
      costSeriesRef.current = null;
    };
  }, [height]);

  // Update data whenever series changes
  useEffect(() => {
    if (!valueSeriesRef.current || !costSeriesRef.current) return;

    const valueData = series.map(p => ({
      time: p.ts as Time,
      value: p.value,
    }));
    const costData = series.map(p => ({
      time: p.ts as Time,
      value: p.cost_basis,
    }));

    valueSeriesRef.current.setData(valueData);
    costSeriesRef.current.setData(costData);

    if (series.length > 0) {
      chartRef.current?.timeScale().fitContent();
    }
  }, [series]);

  if (series.length === 0) {
    return (
      <div
        style={{ height }}
        className="rounded border border-border flex items-center justify-center text-muted text-sm"
      >
        No portfolio data — add holdings to see your value chart.
      </div>
    );
  }

  return <div ref={containerRef} style={{ width: '100%', height }} className="rounded border border-border" />;
}
