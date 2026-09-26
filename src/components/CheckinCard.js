import React, { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Spinner } from 'react-bootstrap';
import { FaCheck, FaCalendarCheck } from 'react-icons/fa';
import { getCheckin } from '../services/api';

export default function CheckinCard({ transactions }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let requestId = 0;
    const refresh = async () => {
      const id = ++requestId;
      try {
        const result = await getCheckin();
        if (!cancelled && id === requestId) {
          setSummary(result);
          setError(false);
        }
      } catch {
        if (!cancelled && id === requestId) setError(true);
      }
    };
    refresh();
    // 跨日、从其他页面记账后返回时，及时更新今日状态。
    const interval = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('transaction-saved', refresh);
    window.addEventListener('learning-saved', refresh);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('transaction-saved', refresh);
      window.removeEventListener('learning-saved', refresh);
    };
  }, [transactions, retry]);

  return (
    <Card className="border-0 rounded-4 shadow-sm mb-4">
      <Card.Body className="p-4">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <h5 className="mb-0"><FaCalendarCheck className="text-success me-2" />成长参与</h5>
          {summary && !error && (
            <Badge bg={summary.checked_today ? 'success' : 'secondary'} className="rounded-pill px-3 py-2">
              {summary.checked_today ? '今日已打卡' : '今日待打卡'}
            </Badge>
          )}
        </div>
        {error ? (
          <Alert variant="warning" className="mb-0">
            打卡状态暂时加载失败，已保存的账目不受影响。
            <Button variant="link" size="sm" onClick={() => setRetry(value => value + 1)}>重试</Button>
          </Alert>
        ) : !summary ? (
          <div className="text-muted" role="status"><Spinner size="sm" className="me-2" />正在加载打卡记录…</div>
        ) : (
          <>
            <p className="text-muted mb-3" role="status">
              {summary.checked_today ? '今天已留下一次记录或思考，按自己的节奏继续。' : '记账、练习或复盘都算参与；没有消费也可以学习。'}
            </p>
            <div className="d-flex flex-wrap gap-4 mb-4">
              <div><strong className="fs-3 text-success">{summary.streak}</strong> 天<span className="text-muted ms-2">近期连续参与</span></div>
              <div><strong className="fs-3">{summary.total_days}</strong> 天<span className="text-muted ms-2">累计参与</span></div>
            </div>
            <div className="d-flex justify-content-between gap-1 mb-3" aria-label="近七天打卡记录">
              {summary.recent_days.map(day => (
                <div key={day.date} className="text-center flex-fill" aria-label={`${day.date} ${day.checked ? '已打卡' : '未打卡'}`}>
                  <div className={`rounded-circle mx-auto mb-2 d-flex align-items-center justify-content-center ${day.checked ? 'bg-success text-white' : 'bg-light text-muted'}`} style={{ width: 32, height: 32 }}>
                    {day.checked ? <FaCheck aria-hidden="true" /> : '·'}
                  </div>
                  <span className="small text-muted">{day.date === summary.today ? '今天' : day.date.slice(5).replace('-', '/')}</span>
                </div>
              ))}
            </div>
            <p className="small text-muted mb-0">按北京时间统计记账和学习参与日期，每天计一次。参与次数不代表能力评分，间断后随时可以继续。</p>
          </>
        )}
      </Card.Body>
    </Card>
  );
}
