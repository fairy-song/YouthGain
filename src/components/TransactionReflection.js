import React, { useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import { saveTransactionReflection, learningError } from '../services/learning';

export default function TransactionReflection({ transactionId, saved }) {
  const [editing, setEditing] = useState(false);
  const [record, setRecord] = useState(null);
  const [outcome, setOutcome] = useState('mixed');
  const [reflection, setReflection] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const result = record || saved;
  const labels = { met: '符合预期', mixed: '部分符合', unmet: '不符合预期' };
  if (!editing) return <Button size="sm" variant="outline-secondary" onClick={() => {
    setOutcome(result?.outcome || 'mixed'); setReflection(result?.reflection || ''); setEditing(true);
  }}>{result ? labels[result.outcome] : '回看体验'}</Button>;
  return <Form style={{ minWidth: 180 }} onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      setRecord(await saveTransactionReflection(transactionId, { outcome, reflection }));
      setEditing(false); window.dispatchEvent(new Event('learning-saved'));
    } catch (err) { setError(learningError(err)); }
    finally { setBusy(false); }
  }}>
    <Form.Select size="sm" aria-label="消费是否符合预期" value={outcome} onChange={e => setOutcome(e.target.value)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Form.Select>
    <Form.Control as="textarea" size="sm" className="my-2" maxLength={1000} aria-label="回访想法（可选）" placeholder="实际体验怎样？（可选）" value={reflection} onChange={e => setReflection(e.target.value)} />
    {error && <Alert variant="warning" className="small">{error}</Alert>}
    <Button size="sm" type="submit" disabled={busy}>保存回访</Button> <Button size="sm" variant="link" disabled={busy} onClick={() => setEditing(false)}>取消</Button>
  </Form>;
}
