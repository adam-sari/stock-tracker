import type {
  IChartApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  PrimitivePaneViewZOrder,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

/**
 * Renders translucent vertical bands behind chart bars to mark trading sessions.
 *
 * Vendored from the official tradingview/lightweight-charts plugin example:
 * https://github.com/tradingview/lightweight-charts/blob/master/plugin-examples/src/plugins/session-highlighting/
 *
 * v5 adaptations:
 * - ISeriesPrimitivePaneRenderer -> IPrimitivePaneRenderer
 * - ISeriesPrimitivePaneView -> IPrimitivePaneView
 * - attached() param is SeriesAttachedParameter<Time> (has .chart, .series, .requestUpdate)
 */
export type SessionColorFn = (time: Time) => string | null;

class SessionHighlightingRenderer implements IPrimitivePaneRenderer {
  constructor(private bars: Array<{ time: Time; color: string }>, private chart: IChartApi) {}

  draw(target: CanvasRenderingTarget2D) {
    target.useBitmapCoordinateSpace((scope: BitmapCoordinatesRenderingScope) => {
      const ctx = scope.context;
      const timeScale = this.chart.timeScale();
      for (let i = 0; i < this.bars.length; i++) {
        const bar = this.bars[i];
        const nextBar = this.bars[i + 1];
        const x1 = timeScale.timeToCoordinate(bar.time);
        const x2 = nextBar ? timeScale.timeToCoordinate(nextBar.time) : null;
        if (x1 == null) continue;
        const width = x2 != null ? Math.max(1, x2 - x1) : 4;
        ctx.fillStyle = bar.color;
        ctx.fillRect(x1 * scope.horizontalPixelRatio, 0, width * scope.horizontalPixelRatio, scope.bitmapSize.height);
      }
    });
  }
}

class SessionHighlightingView implements IPrimitivePaneView {
  constructor(private _renderer: SessionHighlightingRenderer) {}
  zOrder(): PrimitivePaneViewZOrder { return 'bottom'; }
  renderer() { return this._renderer; }
}

export class SessionHighlightingPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private bars: Array<{ time: Time; color: string }> = [];

  constructor(private sessionFor: SessionColorFn) {}

  setData(times: Time[]) {
    this.bars = [];
    for (const t of times) {
      const color = this.sessionFor(t);
      if (color) this.bars.push({ time: t, color });
    }
  }

  attached({ chart }: { chart: IChartApi }) {
    this.chart = chart;
  }

  detached() {
    this.chart = null;
  }

  updateAllViews() { /* no-op */ }

  paneViews(): readonly IPrimitivePaneView[] {
    if (!this.chart) return [];
    return [new SessionHighlightingView(new SessionHighlightingRenderer(this.bars, this.chart))];
  }
}
