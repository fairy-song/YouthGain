// ============================================================
// HomeVoiceRecorder.js —— 首页"记一笔账"原地录音组件
//
// 和 Dashboard 的 VoiceBillModal 是同一套后端能力(讯飞 ASR +
// billParser 抽取 + /decision/assess 评估 + createTransaction 保存)，
// 但交互完全不同：
//   点"记一笔账" → 立刻开始收音(不弹窗、不跳转、无需再点一次)
//   停止 → 识别 → 字段回显 → AI 评估 → 确认保存，全程在首页原地完成
//
// 状态机：idle → recording → transcribing → reviewing → assessed → 保存
// 文本输入作为兜底(不方便说话时)。
// ============================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Badge, Spinner } from 'react-bootstrap';
import { FaMicrophone, FaStop, FaRobot, FaCheckCircle, FaPiggyBank, FaRedo } from 'react-icons/fa';
import { transcribeAudio, assessPurchase, createTransaction } from '../services/api';
import { parseBillText, parsedToForm, validateBillForm } from '../utils/billParser';

// 讯飞语音听写上限 60 秒，前端同步限制
const MAX_RECORD_SECONDS = 60;

// 类别下拉选项
const CATEGORY_OPTIONS = ['餐饮', '饮品', '零食', '交通', '娱乐', '购物', '学习', '房租', '话费', '医疗', '其他'];

export default function HomeVoiceRecorder({ monthlyIncome, onDone }) {
  // 模式：idle(待机) / recording(录音中) / transcribing(识别中) /
  //       reviewing(回显+评估) / saving(保存中) / saved(已保存)
  const [mode, setMode] = useState('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');

  // 录音资源与缓冲
  const audioRef = useRef(null);
  const timerRef = useRef(null);

  // 文本兜底
  const [manualMode, setManualMode] = useState(false);
  const [manualText, setManualText] = useState('');

  // 抽取结果与表单
  const [parsed, setParsed] = useState(null);
  const [form, setForm] = useState(null);
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [recognizedText, setRecognizedText] = useState('');

  // 评估与保存
  const [assessment, setAssessment] = useState(null);
  const [assessing, setAssessing] = useState(false);

  // 卸载时释放麦克风与定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      const a = audioRef.current;
      if (a) {
        try { a.processor && a.processor.disconnect(); } catch (e) { /* noop */ }
        try { a.source && a.source.disconnect(); } catch (e) { /* noop */ }
        try { a.ctx && a.ctx.close(); } catch (e) { /* noop */ }
        try { a.stream && a.stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* noop */ }
      }
      audioRef.current = null;
    };
  }, []);

  // 停止录音 → 转 PCM → 上传讯飞
  const finishRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const a = audioRef.current;
    if (!a) return;
    setMode('transcribing');

    // 释放麦克风
    try { a.processor && a.processor.disconnect(); } catch (e) { /* noop */ }
    try { a.source && a.source.disconnect(); } catch (e) { /* noop */ }
    try { a.ctx && a.ctx.close(); } catch (e) { /* noop */ }
    try { a.stream && a.stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* noop */ }
    audioRef.current = null;

    if (a.samples.length === 0) {
      setError('没有录到声音，请再试一次');
      setMode('idle');
      return;
    }

    // Float32 → 16k Int16 PCM → base64
    let audioB64;
    try {
      const totalLen = a.samples.reduce((n, c) => n + c.length, 0);
      const all = new Float32Array(totalLen);
      let offset = 0;
      a.samples.forEach((c) => { all.set(c, offset); offset += c.length; });
      const ratio = a.rate / 16000;
      const outLen = Math.floor(all.length / ratio);
      const pcm = new Int16Array(outLen);
      for (let i = 0; i < outLen; i += 1) {
        const v = all[Math.floor(i * ratio)];
        pcm[i] = v < 0 ? Math.max(-32768, Math.round(v * 32768))
                       : Math.min(32767, Math.round(v * 32767));
      }
      const bytes = new Uint8Array(pcm.buffer);
      let binary = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
      }
      audioB64 = btoa(binary);
    } catch (e) {
      setError('音频处理失败，请用文字输入');
      setMode('idle');
      return;
    }

    transcribeAudio(audioB64)
      .then((text) => {
        if (text && text.trim()) {
          enterReview(text.trim());
        } else {
          setError('没有识别到语音内容，请靠近麦克风、放慢语速再试');
          setMode('idle');
        }
      })
      .catch((err) => {
        setError(err?.response?.data?.message || err?.message || '语音识别失败，请确认后端服务已启动');
        setMode('idle');
      });
  }, []);

  // 开始录音(直接开麦)
  const startListening = async () => {
    setError('');
    setManualMode(false);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setError('无法使用麦克风(权限被拒绝或没有麦克风)，可改用文字输入');
      setMode('idle'); // 从重录进来时 mode 已被切到 recording，失败要退回待机
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const samples = [];
    processor.onaudioprocess = (e) => {
      samples.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    source.connect(processor);
    processor.connect(ctx.destination);

    audioRef.current = { ctx, source, processor, stream, samples, rate: ctx.sampleRate };
    setMode('recording');
    setSeconds(0);

    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        if (next >= MAX_RECORD_SECONDS) {
          clearInterval(timerRef.current);
          finishRecording();
        }
        return next;
      });
    }, 1000);
  };

  // 手动停止录音
  const stopListening = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    finishRecording();
  };

  // 进入回显：识别文本 → 规则抽取 → 表单
  const enterReview = (text) => {
    setRecognizedText(text);
    const result = parseBillText(text);
    setParsed(result);
    setForm(parsedToForm(result, new Date().toISOString().slice(0, 10)));
    setSelectedAmount(result.amount != null ? result.amount : null);
    setMode('reviewing');
  };

  // 文本兜底解析
  const handleManualParse = (e) => {
    e.preventDefault();
    if (!manualText.trim()) { setError('请输入消费内容'); return; }
    setError('');
    enterReview(manualText.trim());
  };

  // 多金额切换
  const pickAmount = (v) => {
    setSelectedAmount(v);
    setForm((f) => ({ ...f, amount: String(v) }));
  };

  // AI 消费评估
  const handleAssess = async () => {
    const errMsg = validateBillForm(form);
    if (errMsg) { setError(errMsg); return; }
    setAssessing(true);
    setError('');
    try {
      const result = await assessPurchase({
        amount: parseFloat(form.amount),
        category: form.category,
        merchant: form.merchant,
        note: form.note,
        monthly_income: monthlyIncome,
      });
      setAssessment(result);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || '评估失败，请确认后端服务已启动');
    } finally {
      setAssessing(false);
    }
  };

  // 确认保存
  const handleSave = async () => {
    const errMsg = validateBillForm(form);
    if (errMsg) { setError(errMsg); return; }
    setMode('saving');
    setError('');
    try {
      const payload = {
        amount: parseFloat(form.amount),
        category: form.category.trim(),
        date: form.date,
        merchant: form.merchant.trim(),
        note: form.note.trim(),
      };
      if (form.hour !== '') payload.hour = parseInt(form.hour, 10);
      await createTransaction(payload);
      setMode('saved');
      if (onDone) onDone();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || '保存失败，请确认后端服务已启动');
      setMode('reviewing');
    }
  };

  // 重新录入：清掉本次识别结果，直接重新开录(没听清/识别错时用)
  // 注意顺序：必须先把 mode 切走，再清空 parsed/form——
  // 否则在 getUserMedia 异步等待期间界面还停在回显态，
  // 而 parsed/form 已是 null，渲染会直接抛错。
  const retryRecording = () => {
    setMode('recording');
    setParsed(null);
    setForm(null);
    setSelectedAmount(null);
    setAssessment(null);
    setRecognizedText('');
    setError('');
    startListening();
  };

  // 重置回"待机"状态
  const resetAll = () => {
    setMode('idle');
    setSeconds(0);
    setError('');
    setManualMode(false);
    setManualText('');
    setParsed(null);
    setForm(null);
    setSelectedAmount(null);
    setAssessment(null);
    setRecognizedText('');
  };

  // ================= 渲染 =================

  // —— 待机：一个醒目的"记一笔账"按钮，点了直接开录 ——
  if (mode === 'idle') {
    return (
      <div className="demo-card">
        <button type="button" className="demo-start-btn demo-start-btn-lg" onClick={startListening}>
          <FaMicrophone className="me-2" />记一笔账
        </button>
        <div className="text-center demo-hint">点一下，直接说话，30 秒内记完一笔</div>
        {error && <div className="demo-error">{error}</div>}
        <div className="text-center demo-alt">
          <button type="button" className="demo-link" onClick={() => { setManualMode(true); setMode('manual'); }}>不方便说话？用文字输入</button>
        </div>
      </div>
    );
  }

  // —— 手动文字输入 ——
  if (mode === 'manual') {
    return (
      <div className="demo-card">
        <div className="demo-card-header">
          <FaMicrophone className="me-2 text-success" />文字记一笔
        </div>
        <form onSubmit={handleManualParse}>
          <textarea
            className="demo-textarea"
            rows={3}
            placeholder="例如：昨天在食堂吃了18块"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
          />
          <div className="d-flex gap-2 mt-2">
            <button type="submit" className="demo-start-btn flex-fill">解析成账单</button>
            <button type="button" className="demo-ghost-btn" onClick={resetAll}>返回</button>
          </div>
        </form>
        {error && <div className="demo-error">{error}</div>}
      </div>
    );
  }

  // —— 录音中：正在聆听 ——
  if (mode === 'recording') {
    return (
      <div className="demo-card">
        <div className="demo-card-header">
          <span className="rec-dot me-2"></span>正在聆听…
          <span className="ms-auto demo-live">{seconds}s</span>
        </div>
        <div className="text-center my-3 demo-rec-wave">
          <div className="rec-bar" style={{ animationDelay: '0s' }}></div>
          <div className="rec-bar" style={{ animationDelay: '0.2s' }}></div>
          <div className="rec-bar" style={{ animationDelay: '0.4s' }}></div>
          <div className="rec-bar" style={{ animationDelay: '0.1s' }}></div>
          <div className="rec-bar" style={{ animationDelay: '0.3s' }}></div>
        </div>
        <div className="text-center demo-hint mb-3">说完点停止，比如"在食堂吃了18块"</div>
        <button type="button" className="demo-stop-btn" onClick={stopListening}>
          <FaStop className="me-2" />停止
        </button>
      </div>
    );
  }

  // —— 识别中 ——
  if (mode === 'transcribing') {
    return (
      <div className="demo-card">
        <div className="demo-card-header">
          <FaMicrophone className="me-2 text-success" />语音记一笔
        </div>
        <div className="text-center py-4">
          <Spinner animation="border" variant="success" className="mb-3" />
          <div className="demo-hint">正在识别…</div>
        </div>
      </div>
    );
  }

  // —— 回显 + 评估 + 保存 ——
  // 加 parsed && form 守卫：防止状态被清空(如重录瞬间)时渲染崩溃
  if ((mode === 'reviewing' || mode === 'saving') && parsed && form) {
    return (
      <div className="demo-card">
        {/* 识别文本 */}
        <div className="demo-block">
          <div className="demo-label d-flex align-items-center">
            识别文本
            <button type="button" className="demo-link ms-auto" onClick={retryRecording}>
              <FaRedo className="me-1" />没听清？重录
            </button>
          </div>
          <div className="demo-text">{recognizedText}</div>
        </div>

        {/* 缺金额 / 多金额提示 */}
        {parsed.missingAmount && (
          <div className="demo-error">没听清金额，请在上方金额框手动填写。</div>
        )}
        {parsed.multipleAmounts && (
          <div className="demo-block">
            <div className="demo-label">识别到多个金额，选这一笔实际花的：</div>
            <div className="d-flex flex-wrap gap-2">
              {parsed.amounts.map((v) => (
                <button key={v} type="button"
                  className={`demo-field demo-field-btn ${selectedAmount === v ? 'demo-field-active' : ''}`}
                  onClick={() => pickAmount(v)}>
                  ¥{v}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 表单(可编辑) */}
        <div className="demo-block">
          <div className="demo-label">账单(可改)</div>
          <div className="demo-form-grid">
            <input
              type="number" min="0" step="0.01"
              className="demo-input"
              placeholder="金额*"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <select
              className="demo-input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORY_OPTIONS.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input
              type="text" className="demo-input" placeholder="商户"
              value={form.merchant}
              onChange={(e) => setForm({ ...form, merchant: e.target.value })}
            />
            <input
              type="text" className="demo-input" placeholder="买了什么"
              value={form.items}
              onChange={(e) => setForm({ ...form, items: e.target.value })}
            />
            <input
              type="date" className="demo-input"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
            <input
              type="text" className="demo-input" placeholder="备注(口语描述)"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
        </div>

        {error && <div className="demo-error">{error}</div>}

        {/* AI 评估结果 */}
        {assessment && (
          <div className="demo-block demo-ai">
            <div className="demo-label">
              <FaRobot className="me-1 text-primary" />AI 消费评估
            </div>
            <div className="d-flex align-items-start gap-2 mb-2">
              <Badge pill
                bg={assessment.necessity.level === 'necessary' ? 'success'
                  : assessment.necessity.level === 'optional' ? 'warning' : 'danger'}
                text={assessment.necessity.level === 'optional' ? 'dark' : 'white'}
                className="flex-shrink-0 px-3 py-2"
              >
                {assessment.necessity.label}
              </Badge>
              <span className="small">{assessment.necessity.reason}</span>
            </div>
            {assessment.goal.has_goal && assessment.goal.status_before !== assessment.goal.status_after && (
              <div className="small text-warning mb-1">
                储蓄目标「{assessment.goal.name}」将从「{assessment.goal.status_before}」变为「{assessment.goal.status_after}」
              </div>
            )}
            <div className="small text-muted mb-1">
              本月已花 ¥{assessment.budget.spent_this_month.toLocaleString()}，剩 ¥{assessment.budget.remaining.toLocaleString()}
              ，结余 ¥{assessment.surplus.before.toLocaleString()} → ¥{assessment.surplus.after.toLocaleString()}
            </div>
            <div className="small">{assessment.suggestion}</div>
            {assessment.tip && (
              <div className="small text-muted mt-1"><FaPiggyBank className="me-1" />{assessment.tip}</div>
            )}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="d-flex gap-2 mt-3">
          {!assessment && (
            <button type="button" className="demo-ghost-btn" onClick={handleAssess} disabled={assessing || mode === 'saving'}>
              {assessing ? '评估中…' : (<><FaRobot className="me-1" />AI 评估</>)}
            </button>
          )}
          <button type="button" className="demo-start-btn flex-fill" onClick={handleSave} disabled={mode === 'saving'}>
            {mode === 'saving' ? '保存中…' : (<><FaCheckCircle className="me-1" />确认保存</>)}
          </button>
        </div>
      </div>
    );
  }

  // —— 已保存 ——
  if (mode === 'saved') {
    return (
      <div className="demo-card">
        <div className="text-center py-4">
          <FaCheckCircle size={40} className="text-success mb-2" />
          <div className="fw-bold text-white mb-1">这笔记好了</div>
          <div className="demo-hint mb-3">¥{form.amount} · {form.category}</div>
          <button type="button" className="demo-ghost-btn" onClick={resetAll}>再记一笔</button>
        </div>
      </div>
    );
  }

  return null;
}
