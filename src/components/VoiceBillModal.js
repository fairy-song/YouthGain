// ============================================================
// VoiceBillModal.js —— 语音录入账单 + AI 消费智能评估
//
// 完整流程（与需求一一对应）：
//   1. ASR 语音转文字：浏览器采集 PCM 音频 → 后端调讯飞语音听写返回中文
//      （不用浏览器原生 Web Speech API：Chrome 的识别走 Google 云端，
//       国内网络不可用。改用本地采集 + 国内讯飞服务）
//   2. NLP 信息抽取（billParser 规则引擎：金额/商户/商品/备注；
//      多金额让用户选、缺金额提示补充）
//   3. 表单回显（自动填充，支持手动修改）
//   4. AI 消费评估（后端 /api/decision/assess：合理性判断 + 储蓄影响）
//   5. 干预话术 + 同类消费统计 + 平价建议
//   6. 用户确认后存入数据库（createTransaction）
//
// 语音识别不可用时自动降级为文本输入，流程完全一致。
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal, Button, Form, Row, Col, Alert, Spinner, Badge, ProgressBar } from 'react-bootstrap';
import { FaMicrophone, FaStop, FaRobot, FaPiggyBank, FaCheckCircle } from 'react-icons/fa';
import { assessPurchase, createTransaction, transcribeAudio } from '../services/api';
import { parseBillText, parsedToForm, validateBillForm } from '../utils/billParser';

const CATEGORY_OPTIONS = ['餐饮', '饮品', '零食', '交通', '娱乐', '购物', '学习', '房租', '话费', '医疗', '其他'];

// 流程状态：input(输入) → parsed(已抽取回显) → assessed(已评估)
const STAGE = { INPUT: 'input', PARSED: 'parsed', ASSESSED: 'assessed' };

// 讯飞语音听写上限 60 秒，前端同步限制录音时长
const MAX_RECORD_SECONDS = 60;

export default function VoiceBillModal({ show, onClose, onSaved, monthlyIncome }) {
  const [stage, setStage] = useState(STAGE.INPUT);

  // ---- 1. 录音状态 ----
  const [listening, setListening] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [asrError, setAsrError] = useState('');

  // 录音资源（AudioContext / 采集节点 / 麦克风流 / 采样缓冲）
  const audioRef = useRef(null);     // { ctx, source, processor, stream, samples, rate }
  const timerRef = useRef(null);
  const cleanupAudio = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    try { a.processor && a.processor.disconnect(); } catch (e) { /* noop */ }
    try { a.source && a.source.disconnect(); } catch (e) { /* noop */ }
    try { a.ctx && a.ctx.close(); } catch (e) { /* noop */ }
    try { a.stream && a.stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* noop */ }
    audioRef.current = null;
  }, []);

  // ---- 文本兜底 ----
  const [manualText, setManualText] = useState('');

  // ---- 2-3. 抽取结果与回显表单 ----
  const [parsed, setParsed] = useState(null);
  const [form, setForm] = useState(null);
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [parseError, setParseError] = useState('');

  // ---- 4-5. 评估结果 ----
  const [assessment, setAssessment] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessError, setAssessError] = useState('');

  // ---- 6. 保存 ----
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  // 组件卸载时释放麦克风与音频资源
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      cleanupAudio();
    };
  }, [cleanupAudio]);

  // 关闭时重置全部状态
  const resetAll = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    cleanupAudio();
    setListening(false);
    setRecordingSeconds(0);
    setTranscribing(false);
    setManualText('');
    setParsed(null);
    setForm(null);
    setSelectedAmount(null);
    setAssessment(null);
    setStage(STAGE.INPUT);
    setParseError('');
    setAssessError('');
    setSaveError('');
    setAsrError('');
    setSaving(false);
    setAssessing(false);
    setSaved(false);
  }, [cleanupAudio]);

  // ---- 音频工具函数：Float32 合并 → 降采样到 16k → Int16 PCM → base64 ----

  // 把采集到的 Float32 块合并成 16k 采样率的 Int16 PCM（线性抽样）
  const buildPcmBase64 = (chunks, origRate) => {
    const totalLen = chunks.reduce((n, c) => n + c.length, 0);
    const all = new Float32Array(totalLen);
    let offset = 0;
    chunks.forEach((c) => { all.set(c, offset); offset += c.length; });

    const ratio = origRate / 16000;
    const outLen = Math.floor(all.length / ratio);
    const pcm = new Int16Array(outLen);
    for (let i = 0; i < outLen; i += 1) {
      const v = all[Math.floor(i * ratio)];
      pcm[i] = v < 0 ? Math.max(-32768, Math.round(v * 32768))
                     : Math.min(32767, Math.round(v * 32767));
    }

    // Int16Array → base64（btoa 只接受 Latin1 字符串，按 8KB 分块避免栈溢出）
    const bytes = new Uint8Array(pcm.buffer);
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  };

  // 开始录音（ASR 第 1 步：本地采集 PCM，录完再上传讯飞）
  const startListening = async () => {
    setAsrError('');
    setManualText('');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setAsrError('无法使用麦克风（权限被拒绝或没有麦克风），可改用文本输入');
      return;
    }

    // ScriptProcessorNode 采集（已标记废弃但 Chrome/Edge 仍稳定支持；
    // AudioWorklet 需要额外 worker 文件，个人项目选简单可靠的方案）
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
    setListening(true);
    setRecordingSeconds(0);

    // 讯飞单次上限 60 秒，到时自动停止
    timerRef.current = setInterval(() => {
      setRecordingSeconds((sec) => {
        const next = sec + 1;
        if (next >= MAX_RECORD_SECONDS) {
          clearInterval(timerRef.current);
          stopListening();
        }
        return next;
      });
    }, 1000);
  };

  // 停止录音 → 转 PCM → 上传讯飞 → 拿文本自动进入抽取回显
  const stopListening = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const a = audioRef.current;
    if (!a) return;
    setListening(false);

    // 释放麦克风资源，避免权限红点常驻
    cleanupAudio();

    // 没有采集到任何样本
    if (a.samples.length === 0) {
      setAsrError('没有录到声音，请再试一次');
      return;
    }

    setTranscribing(true);
    let audioB64;
    try {
      audioB64 = buildPcmBase64(a.samples, a.rate);
    } catch (e) {
      setTranscribing(false);
      setAsrError('音频处理失败，请改用文本输入');
      return;
    }

    transcribeAudio(audioB64)
      .then((text) => {
        setTranscribing(false);
        if (text && text.trim()) {
          setManualText(text); // 识别文本回填输入框，保证"识别文本"展示一致
          applyParsed(text);   // 第 2、3 步：抽取 + 回显
        } else {
          setAsrError('没有识别到语音内容，请靠近麦克风、放慢语速再试');
        }
      })
      .catch((err) => {
        setTranscribing(false);
        setAsrError(err?.response?.data?.message || err?.message || '语音识别失败，请确认后端服务已启动');
      });
  };

  // 第 2 步：把识别/输入的文本交给规则引擎抽取
  const applyParsed = (text) => {
    const result = parseBillText(text);
    setParsed(result);
    // 回显表单（第 3 步），多金额时默认选第一个，由用户确认
    setForm(parsedToForm(result, new Date().toISOString().slice(0, 10)));
    setSelectedAmount(result.amount != null ? result.amount : null);
    setStage(STAGE.PARSED);
    setParseError('');
  };

  // 文本兜底：手动输入 → 解析
  const handleParseManual = (event) => {
    event.preventDefault();
    if (!manualText.trim()) {
      setParseError('请输入消费内容');
      return;
    }
    applyParsed(manualText);
  };

  // 多个金额时切换所选金额
  const pickAmount = (value) => {
    setSelectedAmount(value);
    setForm((f) => ({ ...f, amount: String(value) }));
  };

  // 第 4-5 步：AI 消费评估
  const handleAssess = async () => {
    const errorMsg = validateBillForm(form);
    if (errorMsg) {
      setAssessError(errorMsg);
      return;
    }
    setAssessing(true);
    setAssessError('');
    try {
      const result = await assessPurchase({
        amount: parseFloat(form.amount),
        category: form.category,
        merchant: form.merchant,
        note: form.note,
        monthly_income: monthlyIncome,
      });
      setAssessment(result);
      setStage(STAGE.ASSESSED);
    } catch (err) {
      setAssessError(err?.response?.data?.message || err?.message || '评估失败，请确认后端服务已启动');
    } finally {
      setAssessing(false);
    }
  };

  // 第 6 步：确认保存
  const handleSave = async () => {
    const errorMsg = validateBillForm(form);
    if (errorMsg) {
      setSaveError(errorMsg);
      return;
    }
    setSaving(true);
    setSaveError('');
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
      setSaved(true);
      // 通知看板刷新
      if (onSaved) onSaved();
      setTimeout(() => {
        resetAll();
        onClose();
      }, 800);
    } catch (err) {
      setSaveError(err?.response?.data?.message || err?.message || '保存失败，请确认后端服务已启动');
    } finally {
      setSaving(false);
    }
  };

  // ---- 渲染 ----
  return (
    <Modal show={show} onHide={() => { if (!saving) { resetAll(); onClose(); } }} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>
          <FaMicrophone className="me-2 text-success" />
          语音记一笔
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* ======== 第 1 步：输入（语音 / 文本） ======== */}
        {stage === STAGE.INPUT && (
          <>
            <div className="text-center mb-3">
              {!listening ? (
                <Button
                  variant="success"
                  className="rounded-pill px-4"
                  onClick={startListening}
                  disabled={transcribing}
                >
                  <FaMicrophone className="me-2" />开始说话
                </Button>
              ) : (
                <Button variant="danger" className="rounded-pill px-4" onClick={stopListening}>
                  <FaStop className="me-2" />停止录音 ({recordingSeconds}s)
                </Button>
              )}
              {transcribing && (
                <div className="text-primary small mt-2">
                  <Spinner animation="border" size="sm" className="me-1" />语音识别中…
                </div>
              )}
              <div className="text-muted small mt-2">
                说一句就行，例如：&quot;昨天下午在蜜雪冰城买了一杯柠檬水，一共27块，手机付的&quot;
              </div>
            </div>

            {asrError && <Alert variant="danger" className="small">{asrError}</Alert>}

            {/* 文本兜底 */}
            <Form onSubmit={handleParseManual}>
              <Form.Group className="mb-2">
                <Form.Label className="small text-muted">或手动输入消费内容</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  placeholder="例如：在食堂吃了顿午饭花了18"
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                />
              </Form.Group>
              <div className="d-flex justify-content-end">
                <Button type="submit" variant="outline-success" className="rounded-pill px-3">
                  解析成账单
                </Button>
              </div>
            </Form>
            {parseError && <Alert variant="danger" className="small mt-2 mb-0">{parseError}</Alert>}
          </>
        )}

        {/* ======== 第 2-3 步：抽取结果回显表单 ======== */}
        {(stage === STAGE.PARSED || stage === STAGE.ASSESSED) && parsed && form && (
          <>
            {/* 识别原文 */}
            <div className="p-3 rounded-4 mb-3" style={{ background: '#f0faf5' }}>
              <div className="text-muted small mb-1">识别文本</div>
              <div>{(manualText || '').trim()}</div>
            </div>

            {/* 缺金额 / 多金额处理 */}
            {parsed.missingAmount && (
              <Alert variant="warning" className="small">
                {parsed.warnings[0]} 已帮你清空金额，请手动填写。
              </Alert>
            )}
            {parsed.multipleAmounts && (
              <div className="mb-3">
                <div className="small text-muted mb-1">识别到多个金额，请选择这一笔实际花了多少：</div>
                <div className="d-flex flex-wrap gap-2">
                  {parsed.amounts.map((a) => (
                    <Button
                      key={a}
                      size="sm"
                      variant={selectedAmount === a ? 'success' : 'outline-success'}
                      className="rounded-pill px-3"
                      onClick={() => pickAmount(a)}
                    >
                      ¥{a}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* 回显表单 */}
            <Form>
              <Row className="g-3">
                <Col md={3}>
                  <Form.Group>
                    <Form.Label className="small text-muted">金额（元）*</Form.Label>
                    <Form.Control
                      type="number" min="0" step="0.01"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      isInvalid={parsed.missingAmount}
                    />
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group>
                    <Form.Label className="small text-muted">类别 *</Form.Label>
                    <Form.Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      {CATEGORY_OPTIONS.map((c) => <option key={c}>{c}</option>)}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group>
                    <Form.Label className="small text-muted">商户</Form.Label>
                    <Form.Control
                      type="text"
                      value={form.merchant}
                      placeholder="自动识别，可修改"
                      onChange={(e) => setForm({ ...form, merchant: e.target.value })}
                    />
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group>
                    <Form.Label className="small text-muted">消费日期 *</Form.Label>
                    <Form.Control
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label className="small text-muted">商品 / 买了什么</Form.Label>
                    <Form.Control
                      type="text"
                      value={form.items}
                      placeholder="自动识别，可修改（多个用顿号分隔）"
                      onChange={(e) => setForm({ ...form, items: e.target.value })}
                    />
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group>
                    <Form.Label className="small text-muted">时段（可选）</Form.Label>
                    <Form.Select value={form.hour} onChange={(e) => setForm({ ...form, hour: e.target.value })}>
                      <option value="">不填写</option>
                      {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{i} 时</option>)}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group>
                    <Form.Label className="small text-muted">备注</Form.Label>
                    <Form.Control
                      type="text"
                      value={form.note}
                      placeholder="口语描述已自动保留"
                      onChange={(e) => setForm({ ...form, note: e.target.value })}
                    />
                  </Form.Group>
                </Col>
              </Row>
            </Form>

            {assessError && <Alert variant="danger" className="small mt-3 mb-0">{assessError}</Alert>}
            {saveError && <Alert variant="danger" className="small mt-3 mb-0">{saveError}</Alert>}

            {/* ======== 第 4-5 步：AI 评估结果 ======== */}
            {assessment && stage === STAGE.ASSESSED && (
              <div className="mt-4 p-3 rounded-4" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div className="d-flex align-items-center mb-3">
                  <FaRobot className="text-primary me-2" />
                  <span className="fw-bold">AI 消费评估</span>
                </div>

                {/* 消费合理性 */}
                <div className="d-flex align-items-start gap-2 mb-2">
                  <Badge pill bg={assessment.necessity.level === 'necessary' ? 'success'
                    : assessment.necessity.level === 'optional' ? 'warning'
                    : 'danger'}
                    text={assessment.necessity.level === 'optional' ? 'dark' : 'white'}
                    className="px-3 py-2"
                  >
                    {assessment.necessity.label}
                  </Badge>
                  <span className="small">{assessment.necessity.reason}</span>
                </div>

                {/* 预算进度 */}
                <div className="mb-2">
                  <div className="d-flex justify-content-between small text-muted mb-1">
                    <span>本月已消费 ¥{assessment.budget.spent_this_month.toLocaleString()}</span>
                    <span>剩余 ¥{assessment.budget.remaining.toLocaleString()}</span>
                  </div>
                  <ProgressBar
                    now={assessment.budget.remaining <= 0 ? 100
                      : Math.min(100, Math.round(assessment.budget.spent_this_month
                        / (assessment.budget.spent_this_month + assessment.budget.remaining) * 100))}
                    variant={assessment.budget.remaining <= 0 ? 'danger'
                      : assessment.budget.remaining < assessment.amount ? 'warning' : 'success'}
                  />
                </div>

                {/* 储蓄影响 */}
                <div className="small text-muted mb-1">
                  月度结余：¥{assessment.surplus.before.toLocaleString()}
                  <span className="text-danger"> → ¥{assessment.surplus.after.toLocaleString()}</span>
                  （这笔 -¥{assessment.amount}）
                  {assessment.goal.has_goal && assessment.goal.status_before !== assessment.goal.status_after && (
                    <span className="text-warning fw-medium">
                      ，储蓄目标「{assessment.goal.name}」将从「{assessment.goal.status_before}」变为「{assessment.goal.status_after}」
                    </span>
                  )}
                </div>

                {/* 干预话术 */}
                <div className="p-3 rounded-3 mt-2" style={{ background: '#f0faf5' }}>
                  <div className="fw-medium small text-success mb-1">建议</div>
                  <div className="small">{assessment.suggestion}</div>
                </div>

                {/* 平价建议 / 提示 */}
                {assessment.tip && (
                  <div className="small text-muted mt-2">
                    <FaPiggyBank className="me-1" />{assessment.tip}
                  </div>
                )}
              </div>
            )}

            {/* 操作按钮 */}
            <div className="d-flex justify-content-end gap-2 mt-3">
              <Button variant="outline-secondary" className="rounded-pill px-3" onClick={() => setStage(STAGE.PARSED)}>
                修改
              </Button>
              {stage !== STAGE.ASSESSED && (
                <Button variant="primary" className="rounded-pill px-3" onClick={handleAssess} disabled={assessing}>
                  {assessing ? (<><Spinner size="sm" className="me-1" />评估中</>) : (<><FaRobot className="me-1" />AI 智能评估</>)}
                </Button>
              )}
              <Button variant="success" className="rounded-pill px-3" onClick={handleSave} disabled={saving || saved}>
                {saving ? (<><Spinner size="sm" className="me-1" />保存中</>)
                  : saved ? (<><FaCheckCircle className="me-1" />已保存</>)
                  : (<><FaCheckCircle className="me-1" />确认保存</>)}
              </Button>
            </div>
          </>
        )}
      </Modal.Body>
    </Modal>
  );
}
