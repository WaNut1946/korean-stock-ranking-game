const SEOUL_TIMEZONE = 'Asia/Seoul';
const MARKET_OPEN_MINUTES = 9 * 60;
const MARKET_CLOSE_MINUTES = 15 * 60 + 30;
const PRICE_REFRESH_CLOSE_MINUTES = 15 * 60 + 45;

function getSeoulTimeParts(now = new Date()) {
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

  return {
    weekday,
    hour,
    minute,
    totalMinutes: hour * 60 + minute,
    isWeekday: !['Sat', 'Sun'].includes(weekday),
  };
}

export function getKoreanMarketStatus(now = new Date()) {
  const { isWeekday, totalMinutes } = getSeoulTimeParts(now);
  const isTradingTime = totalMinutes >= MARKET_OPEN_MINUTES && totalMinutes <= MARKET_CLOSE_MINUTES;

  return {
    isOpen: isWeekday && isTradingTime,
    label: isWeekday && isTradingTime ? '거래 가능' : '조회 전용',
  };
}

export function getKoreanPriceRefreshStatus(now = new Date()) {
  const { isWeekday, totalMinutes } = getSeoulTimeParts(now);
  const canRefresh =
    isWeekday && totalMinutes >= MARKET_OPEN_MINUTES && totalMinutes <= PRICE_REFRESH_CLOSE_MINUTES;

  return {
    canRefresh,
    label: canRefresh ? '가격 갱신 가능' : '장외 가격 갱신 생략',
    windowLabel: '평일 09:00 ~ 15:45',
  };
}
