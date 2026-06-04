const SEOUL_TIMEZONE = 'Asia/Seoul';

export function getKoreanMarketStatus(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SEOUL_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const value = (type) => parts.find((part) => part.type === type)?.value;
  const weekday = value('weekday');
  const hour = Number(value('hour'));
  const minute = Number(value('minute'));
  const totalMinutes = hour * 60 + minute;
  const isWeekday = !['Sat', 'Sun'].includes(weekday);
  const isTradingTime = totalMinutes >= 9 * 60 && totalMinutes <= 15 * 60 + 30;

  return {
    isOpen: isWeekday && isTradingTime,
    label: isWeekday && isTradingTime ? '거래 가능' : '조회 전용',
  };
}
