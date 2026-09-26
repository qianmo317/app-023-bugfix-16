// 打印视图 /score/:id/print —— A4 横排、可选简谱对照、导出 PNG（PDF 走浏览器打印）
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Score } from '../types';
import { getScore } from '../lib/storage';
import { printLayout } from '../lib/grid';
import { ScoreGrid } from '../components/ScoreGrid';

const A4_LANDSCAPE_PX = 1047; // 297mm 减页边距 @96dpi
const LABEL_W = 64; // 左侧乐器行标宽，与 ScoreGrid 内部一致
const PNG_SCALE = 2; // 导出位图按 2 倍分辨率，放大不发虚
const PNG_PAD = 16; // 导出图片四周留白（白底）

/** SVG → data/blob URL 序列化 */
function svgToUrl(svg: SVGSVGElement): string {
  const ser = new XMLSerializer().serializeToString(svg);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ser);
}

export function Print({ scoreId }: { scoreId: string }) {
  const [score, setScore] = useState<Score | null>(null);
  const [jianpu, setJianpu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false); // 重入保护：导出期间连点不再触发序列化

  useEffect(() => {
    getScore(scoreId).then((s) => setScore(s ?? null));
  }, [scoreId]);

  // 按纸张可用宽度自动决定每行小节数与字号（短谱自动放大铺满）
  const layout = useMemo(() => {
    if (!score) return { barsPerRow: 8, pxPerTick: 8 };
    const bpb = score.bars[0]?.beatsPerBar ?? 4;
    return printLayout(A4_LANDSCAPE_PX - LABEL_W, bpb, score.bars.length);
  }, [score]);

  const exportPng = async () => {
    if (!score || exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    try {
      const svg = document.querySelector<SVGSVGElement>('.score-svg');
      if (!svg) throw new Error('未找到谱面 SVG');
      const w = svg.width.baseVal.value || svg.clientWidth;
      const h = svg.height.baseVal.value || svg.clientHeight;
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('SVG 载入失败'));
        img.src = svgToUrl(svg);
      });

      // 2 倍分辨率 + 白色底 + 四周留白（SVG 本身透明，贴深色页面才不会没字）
      const canvas = document.createElement('canvas');
      canvas.width = Math.round((w + PNG_PAD * 2) * PNG_SCALE);
      canvas.height = Math.round((h + PNG_PAD * 2) * PNG_SCALE);
      const c = canvas.getContext('2d')!;
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, canvas.width, canvas.height);
      c.drawImage(img, PNG_PAD * PNG_SCALE, PNG_PAD * PNG_SCALE, w * PNG_SCALE, h * PNG_SCALE);

      // toBlob 异步编码，避免 toDataURL 在主线程同步压大位图造成页面卡顿
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNG 编码失败');
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${score.title}.png`;
      a.click();
      // 延迟回收，给浏览器下载流程留时间
      setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
    } catch (e) {
      console.error('导出 PNG 失败：', e);
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  };

  if (!score) return <div className="page dim">加载中…</div>;

  // 标题下副行：散板如实写「散板」，不标拍号与固定速度；其余标「x/4 · BPM」
  const meterText = score.freeMeter ? '散板' : `${score.bars[0]?.beatsPerBar ?? 4}/4 · ${score.bpm} BPM`;

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
        <button className="btn" data-testid="btn-export-png" disabled={exporting} onClick={exportPng}>
          {exporting ? '导出中…' : '导出 PNG'}
        </button>
        <span className="dim" data-testid="print-bars-per-row">
          A4 横向 · 每行 {layout.barsPerRow} 小节
        </span>
      </div>
      <h1 className="print-title">{score.title}</h1>
      <p className="print-sub" data-testid="print-sub">
        {score.style ? `${score.style} · ` : ''}
        {meterText}
      </p>
      <div className="print-score" data-testid="print-score">
        <ScoreGrid
          score={score}
          pxPerTick={layout.pxPerTick}
          rowHeight={40}
          barsPerRow={layout.barsPerRow}
          showJianpu={jianpu}
          testIdPrefix="print"
        />
      </div>
      <p className="print-foot no-print dim">打印建议：A4 横向、边距 10mm、勾选「背景图形」。</p>
    </div>
  );
}
