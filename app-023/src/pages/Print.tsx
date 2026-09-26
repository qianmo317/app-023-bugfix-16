// 打印视图 /score/:id/print —— A4 横排、可选简谱对照、导出 PNG（PDF 走浏览器打印）
import { useEffect, useMemo, useState } from 'react';
import type { Score } from '../types';
import { getScore } from '../lib/storage';
import { barsPerRow } from '../lib/grid';
import { ScoreGrid } from '../components/ScoreGrid';

const A4_LANDSCAPE_PX = 1047; // 297mm 减页边距 @96dpi

export function Print({ scoreId }: { scoreId: string }) {
  const [score, setScore] = useState<Score | null>(null);
  const [jianpu, setJianpu] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getScore(scoreId).then((s) => setScore(s ?? null));
  }, [scoreId]);

  const pxPerTick = useMemo(() => {
    if (!score) return 8;
    const bpb = score.bars[0]?.beatsPerBar ?? 4;
    // 目标：一行最多 16 小节（2/4）；4/4 自然折半。先按 16 小节算，若放不下 4 小节再放宽。
    let n = barsPerRow(A4_LANDSCAPE_PX, bpb, 8);
    if (n > 16) n = 16;
    if (n < 4) n = Math.min(4, score.bars.length);
    const usable = A4_LANDSCAPE_PX - 40;
    const px = Math.floor(usable / (n * bpb * 4 + (n - 1) * 1.2));
    return Math.max(6, Math.min(px, 14));
  }, [score]);

  // 每行小节数：按纸张可用宽度（1047px 减页边距）与当前字号反算，与 ScoreGrid 的 barGap=10 对齐
  const barsPerRowVal = useMemo(() => {
    if (!score) return 8;
    const bpb = score.bars[0]?.beatsPerBar ?? 4;
    const fit = barsPerRow(A4_LANDSCAPE_PX, bpb, pxPerTick, 10);
    return Math.max(1, Math.min(16, fit, score.bars.length || 1));
  }, [score, pxPerTick]);

  const exportPng = async () => {
    if (!score || exporting) return; // 导出中禁止重入，连点不叠加卡顿
    const svg = document.querySelector<SVGSVGElement>('.score-svg');
    if (!svg) return;
    setExporting(true);
    try {
      const SCALE = 2; // 两倍分辨率，放大不虚
      const w = svg.viewBox.baseVal.width || svg.clientWidth;
      const h = svg.viewBox.baseVal.height || svg.clientHeight;
      const ser = new XMLSerializer().serializeToString(svg);
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ser);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('SVG 栅格化失败'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * SCALE);
      canvas.height = Math.round(h * SCALE);
      const c = canvas.getContext('2d')!;
      c.fillStyle = '#ffffff'; // 白底，贴深色页面字不漏
      c.fillRect(0, 0, canvas.width, canvas.height);
      c.drawImage(img, 0, 0, canvas.width, canvas.height);
      // toBlob 异步出图，避免 toDataURL 同步编码大 base64 卡住页面
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
      if (!blob) return;
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `${score.title}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    } finally {
      setExporting(false);
    }
  };

  if (!score) return <div className="page dim">加载中…</div>;

  return (
    <div className="print-page" data-testid="print-page">
      <div className="print-toolbar no-print">
        <a className="btn" href={`#/score/${score.id}`}>
          ← 返回编辑
        </a>
        <label className="dim">
          <input type="checkbox" data-testid="chk-jianpu" checked={jianpu} onChange={(e) => setJianpu(e.target.checked)} />
          简谱对照行
        </label>
        <button className="btn primary" data-testid="btn-do-print" onClick={() => window.print()}>
          打印 / 导出 PDF
        </button>
        <button className="btn" data-testid="btn-export-png" onClick={exportPng} disabled={exporting}>
          {exporting ? '导出中…' : '导出 PNG'}
        </button>
        <span className="dim">A4 横向 · 每行 {barsPerRowVal} 小节</span>
      </div>
      <h1 className="print-title">{score.title}</h1>
      <p className="print-sub" data-testid="print-sub">
        {score.style ? `${score.style} · ` : ''}
        {score.freeMeter ? '散板' : `${score.bars[0]?.beatsPerBar ?? 4}/4 · ${score.bpm} BPM`}
      </p>
      <div className="print-score" data-testid="print-score">
        <ScoreGrid score={score} pxPerTick={pxPerTick} rowHeight={40} barsPerRow={barsPerRowVal} showJianpu={jianpu} testIdPrefix="print" />
      </div>
      <p className="print-foot no-print dim">打印建议：A4 横向、边距 10mm、勾选「背景图形」。</p>
    </div>
  );
}
