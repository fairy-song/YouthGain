"""按成功保存的记账时间统计打卡；消费日期不参与签到计算。"""
from datetime import datetime, timedelta, timezone

BEIJING = timezone(timedelta(hours=8))


def build_checkin_summary(timestamps, now=None):
    today = (now or datetime.now(BEIJING)).astimezone(BEIJING).date()
    days = set()
    for value in timestamps:
        try:
            stamp = datetime.fromisoformat(value.replace('Z', '+00:00')) if isinstance(value, str) else value
            if not isinstance(stamp, datetime):
                continue
            # 旧版记录使用无时区的本地时间，按项目使用的北京时间兼容。
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=BEIJING)
            day = stamp.astimezone(BEIJING).date()
            if day <= today:
                days.add(day)
        except (ValueError, TypeError):
            continue

    checked_today = today in days
    cursor = today if checked_today else today - timedelta(days=1)
    streak = 0
    while cursor in days:
        streak += 1
        cursor -= timedelta(days=1)
    return {
        'today': today.isoformat(),
        'checked_today': checked_today,
        'streak': streak,
        'total_days': len(days),
        'recent_days': [
            {'date': day.isoformat(), 'checked': day in days}
            for day in (today - timedelta(days=offset) for offset in range(6, -1, -1))
        ],
    }
