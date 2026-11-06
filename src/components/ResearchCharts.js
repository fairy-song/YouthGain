import React from 'react';

export default function ResearchCharts({ charts }) {
  return <div className="research-charts">
    {charts.map(chart => <section key={chart.title} className="research-chart">
      <h3>{chart.title}</h3>
      <ul aria-label={chart.title}>{chart.bins.map(bin => <li key={bin.label}>
        <div><span>{bin.label}</span><strong>{bin.percent.toFixed(1)}%</strong></div>
        <span className="research-bar" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, bin.percent))}%` }} /></span>
      </li>)}</ul>
    </section>)}
  </div>;
}
