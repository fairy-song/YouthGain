import React from 'react';
import { Form } from 'react-bootstrap';

export default function TransactionIntent({ value, onChange }) {
  const id = React.useId();
  return <details className="mt-3 mb-2">
    <summary className="small text-muted">想多了解自己一点？记录消费想法（可跳过）</summary>
    <Form.Group controlId={`${id}-planned`} className="my-2">
      <Form.Label>这次消费是怎样决定的？</Form.Label>
      <Form.Select value={value.planned || ''} onChange={e => onChange({ ...value, planned: e.target.value })}>
        <option value="">暂不填写</option><option value="planned">提前计划</option><option value="spontaneous">临时决定</option><option value="necessary">临时必要开支</option>
      </Form.Select>
    </Form.Group>
    <Form.Group controlId={`${id}-purpose`}><Form.Label>它满足了什么需要，或当时是什么感受？</Form.Label><Form.Control maxLength={300} value={value.purpose || ''} onChange={e => onChange({ ...value, purpose: e.target.value })} placeholder="例如：和朋友相处、日常生活、庆祝一件事" /></Form.Group>
  </details>;
}
