import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal, Overlay } from 'react-bootstrap';

/** 使用浮层而非原生 option，允许每项放独立的删除按钮，并避免被表格滚动区裁切。 */
export default function BillCategoryDropdown({ label, value, systemOptions, customOptions, allowReset, disabled, onChange, onDelete }) {
  const trigger = useRef(null);
  const menu = useRef(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const menuId = React.useId();
  const confirmId = React.useId();
  const allOptions = [...systemOptions, ...customOptions];
  const selected = allOptions.find(option => option.value === value);

  useEffect(() => {
    if (disabled && !pending) setOpen(false);
  }, [disabled, pending]);
  useEffect(() => {
    if (!open || pending) return undefined;
    const frame = requestAnimationFrame(() => {
      const options = menu.current?.querySelectorAll('[role="option"]:not(:disabled)');
      const option = Array.from(options || []).find(item => item.getAttribute('aria-selected') === 'true') || options?.[0];
      option?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, pending]);

  const choose = option => {
    onChange(option.selection);
    setOpen(false);
    trigger.current?.focus();
  };
  const confirmDelete = async () => {
    if (saving) return;
    setSaving(true); setError('');
    try {
      await onDelete(pending.id);
      setOpen(false); setPending(null);
      trigger.current?.focus();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || '分类删除失败，请重试');
    } finally { setSaving(false); }
  };
  const navigate = event => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const options = Array.from(event.currentTarget.querySelectorAll('[role="option"]:not(:disabled)'));
    if (!options.length) return;
    const index = options.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
      : (index + (event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length;
    options[next].focus();
  };
  const optionButton = option => <button type="button" role="option" data-value={option.value} aria-selected={value === option.value}
    className="bill-category-option" disabled={option.disabled} onClick={() => choose(option)}>{option.label}</button>;

  return <>
    <button type="button" ref={trigger} role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? menuId : undefined}
      value={value} disabled={disabled} className="form-select form-select-sm bill-category-trigger" onClick={() => setOpen(current => !current)}
      onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); } }}>
      <span>{selected?.label || '选择分类'}</span>
    </button>
    <Overlay show={open} target={trigger.current} placement="bottom-start" flip transition={false} rootClose={!pending} onHide={() => { if (!pending) setOpen(false); }}>
      {({ ref, placement, arrowProps, show, popper, hasDoneInitialMeasure, ...props }) => <div {...props} ref={node => { menu.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node; }}
        id={menuId} role="listbox" aria-label={`${label}选项`} className="bill-category-menu" onKeyDown={navigate}
        onBlur={event => { if (!pending && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) setOpen(false); }}
        style={{ ...props.style, width: trigger.current?.getBoundingClientRect().width || 284 }}>
        {allowReset && <div className="bill-category-menu-row">{optionButton({ value: '', label: '选择分类', selection: { type: 'reset' } })}</div>}
        <div role="group" aria-label="系统分类"><div className="bill-category-group-title">系统分类</div>
          {systemOptions.map(option => <div className="bill-category-menu-row" key={option.value}>{optionButton(option)}</div>)}
        </div>
        <div role="group" aria-label="用户自定义分类"><div className="bill-category-group-title">用户自定义分类</div>
          {customOptions.length ? customOptions.map(option => <div className="bill-category-menu-row" key={option.value}>
            {optionButton(option)}
            {option.id && onDelete && <button type="button" className="bill-category-delete" aria-label={`删除分类 ${option.name}`} title={`删除“${option.name}”`}
              onPointerDown={event => event.stopPropagation()} onClick={event => {
                // 删除按钮与选中文字是独立区域，不能冒泡成选择操作。
                event.preventDefault(); event.stopPropagation(); setError(''); setPending(option);
              }}>×</button>}
          </div>) : <div className="bill-category-empty">暂无自定义分类</div>}
        </div>
      </div>}
    </Overlay>
    {pending && <Modal show size="sm" centered className="bill-category-delete-modal" backdropClassName="bill-category-delete-backdrop"
      aria-labelledby={confirmId} keyboard={!saving} backdrop={saving ? 'static' : true} onHide={() => { if (!saving) setPending(null); }}>
      <Modal.Header closeButton={!saving}><Modal.Title id={confirmId}>删除自定义分类</Modal.Title></Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" role="alert">{error}</Alert>}
        <p>确认删除该自定义分类？</p><strong>{pending.name}</strong>
        <p className="small text-muted mt-2 mb-0">已入账记录的名称和金额保持不变。</p>
      </Modal.Body>
      <Modal.Footer><Button size="sm" variant="outline-secondary" disabled={saving} onClick={() => setPending(null)}>取消</Button>
        <Button size="sm" variant="danger" disabled={saving} onClick={confirmDelete}>{saving ? '删除中…' : '确认删除'}</Button></Modal.Footer>
    </Modal>}
  </>;
}
