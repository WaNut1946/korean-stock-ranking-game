import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowDownUp,
  ChartNoAxesCombined,
  Clock3,
  Database,
  Home,
  Info,
  KeyRound,
  Lock,
  LogOut,
  Megaphone,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Trophy,
  Trash2,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { api } from './api.js';
import { formatDateTime, formatPercent, formatWon } from './format.js';

const BRAND_NAME = '한국 주식 모의투자 시뮬레이터';
const BRAND_SHORT = '모의투자 시뮬레이터';
const SUPPORT_EMAIL = 'anttradersim@gmail.com';
const ANNOUNCEMENT_SKIP_DATE_KEY = 'announcementSkipDate';
const BUY_FEE_RATE = 0.00015;
const SELL_FEE_RATE = 0.00015;
const SELL_TAX_RATE = 0.0018;
const BETA_CHECKLIST_STORAGE_KEY = 'betaLaunchChecklist';
const BETA_CHECKLIST = [
  {
    group: '계정',
    items: [
      { id: 'register-login', label: '새 계정 회원가입, 로그인, 로그아웃 확인' },
      { id: 'password-change', label: '비밀번호 변경 후 재로그인 확인' },
      { id: 'delete-account', label: '테스트 계정 회원탈퇴 확인' },
    ],
  },
  {
    group: '거래',
    items: [
      { id: 'trade-window', label: '장중 매수/매도 가능, 장외 거래 차단 확인' },
      { id: 'portfolio-balance', label: '매수/매도 후 현금, 보유 종목, 총자산 반영 확인' },
      { id: 'trade-history', label: '거래내역 필터와 검색 확인' },
    ],
  },
  {
    group: '가격/차트',
    items: [
      { id: 'kis-refresh', label: 'KIS 가격 갱신 성공/실패 로그 확인' },
      { id: 'chart-history', label: '가격 기록 누적 후 차트와 터치 툴팁 확인' },
      { id: 'ranking', label: 'TOP10 랭킹과 내 순위 반영 확인' },
    ],
  },
  {
    group: '운영',
    items: [
      { id: 'notice', label: '공지 작성, 수정, 숨김, 삭제 확인' },
      { id: 'backup', label: 'DB 백업 파일 생성 및 복원 테스트 확인' },
      { id: 'ssl-pm2', label: 'HTTPS, PM2 자동시작, Nginx 상태 확인' },
    ],
  },
  {
    group: '모바일',
    items: [
      { id: 'mobile-login', label: '모바일 로그인/회원가입 화면 확인' },
      { id: 'mobile-dashboard', label: '모바일 대시보드, 종목 선택, 주문 UI 확인' },
      { id: 'mobile-tables', label: '모바일 포트폴리오, 거래내역, 프로필 메뉴 확인' },
    ],
  },
];

function getTodayKey() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

function wasAnnouncementEdited(announcement) {
  if (!announcement?.createdAt || !announcement?.updatedAt) return false;
  return Math.abs(new Date(announcement.updatedAt).getTime() - new Date(announcement.createdAt).getTime()) > 1000;
}

function calculateTradeCost({ price, quantity, type }) {
  const grossAmount = Number(price) * Number(quantity);
  const feeRate = type === 'sell' ? SELL_FEE_RATE : BUY_FEE_RATE;
  const fee = Math.round(grossAmount * feeRate);
  const tax = type === 'sell' ? Math.round(grossAmount * SELL_TAX_RATE) : 0;
  const settlementAmount = type === 'sell' ? grossAmount - fee - tax : grossAmount + fee;

  return {
    grossAmount,
    fee,
    tax,
    settlementAmount,
  };
}

function getMaxBuyQuantity(cashBalance, price) {
  if (Number(price) <= 0) return 0;

  let quantity = Math.floor(Number(cashBalance) / (Number(price) * (1 + BUY_FEE_RATE)));
  while (quantity > 0 && calculateTradeCost({ price, quantity, type: 'buy' }).settlementAmount > Number(cashBalance)) {
    quantity -= 1;
  }
  return Math.max(quantity, 0);
}

const PERIODS = [
  { key: '15M', label: '15분', points: 24, stepMs: 15 * 60 * 1000, drift: 0.006 },
  { key: '1H', label: '1시간', points: 24, stepMs: 60 * 60 * 1000, drift: 0.018 },
  { key: '1D', label: '1일', points: 24, stepMs: 24 * 60 * 60 * 1000, drift: 0.055 },
  { key: '1W', label: '1주', points: 24, stepMs: 7 * 24 * 60 * 60 * 1000, drift: 0.12 },
  { key: '1M', label: '1달', points: 24, stepMs: 30 * 24 * 60 * 60 * 1000, drift: 0.2 },
];

function useAuth() {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  });

  const saveSession = (payload) => {
    localStorage.setItem('token', payload.token);
    localStorage.setItem('user', JSON.stringify(payload.user));
    setUser(payload.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return { user, saveSession, logout };
}

function AuthPage({ mode, saveSession }) {
  const navigate = useNavigate();
  const isRegister = mode === 'register';
  const [form, setForm] = useState({ email: '', nickname: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingSignup, setPendingSignup] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const payload = isRegister ? form : { email: form.email, password: form.password };
      const { data } = await api.post(endpoint, payload);

      if (isRegister) {
        setPendingSignup(data);
        return;
      }

      saveSession(data);
      navigate('/', { state: { openAnnouncements: true } });
    } catch (requestError) {
      setError(requestError.response?.data?.message || '요청을 처리하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const confirmSignupNotice = () => {
    if (!pendingSignup) return;

    localStorage.setItem('welcomeGuideDismissed', 'true');
    saveSession(pendingSignup);
    navigate('/');
  };

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div>
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              <ChartNoAxesCombined size={25} />
            </span>
            <span>
              <p className="eyebrow">Korean Stock Simulator</p>
              <strong>{BRAND_NAME}</strong>
            </span>
          </div>
          <h1>{isRegister ? '회원가입' : '로그인'}</h1>
          <p className="muted">가상 1억 원으로 한국 주식 포트폴리오를 키워보세요.</p>
        </div>

        <div className="auth-disclaimer" role="note">
          <strong>서비스 안내와 주의사항</strong>
          <ul>
            <li>실제 돈이 아닌 가상 자산으로 진행되는 모의투자 게임입니다.</li>
            <li>매수/매도는 평일 09:00~15:30에만 가능하며, 그 외 시간에는 조회만 가능합니다.</li>
            <li>주가는 한국투자증권 API 기준으로 장중 약 15분마다 갱신되며, 종가 반영을 위해 15:45까지 갱신될 수 있습니다.</li>
            <li>차트는 실제 갱신 기록이 쌓인 뒤 표시됩니다. 초기에는 차트가 비어 보일 수 있습니다.</li>
            <li>본 서비스는 비영리 학습 및 포트폴리오 목적으로만 운영되며, 투자 권유나 수익 보장을 의미하지 않습니다.</li>
            <li>이용해 주셔서 감사합니다. 안전하고 즐거운 모의투자 경험을 만들기 위해 계속 개선하겠습니다.</li>
          </ul>
        </div>

        <form onSubmit={submit} className="stack">
          <label>
            이메일
            <input
              type="email"
              maxLength={255}
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
            />
          </label>

          {isRegister && (
            <label>
              닉네임
              <input
                value={form.nickname}
                onChange={(event) => setForm({ ...form, nickname: event.target.value })}
                minLength={2}
                maxLength={12}
                pattern="[\p{L}\p{N} ]{2,12}"
                title="닉네임은 한글, 영문, 숫자, 띄어쓰기만 사용해 2~12자로 입력해 주세요."
                required
              />
              <small>2~12자, 특수문자 제외, 띄어쓰기 가능</small>
            </label>
          )}

          <label>
            비밀번호
            <input
              type="password"
              minLength={8}
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required
            />
            {isRegister && <small>8자 이상 입력해 주세요.</small>}
          </label>

          {error && <p className="error">{error}</p>}

          <button className="primary-button" disabled={loading}>
            <Lock size={18} />
            {loading ? '처리 중' : isRegister ? '1억 원 받고 시작' : '로그인'}
          </button>
        </form>

        <p className="muted">
          {isRegister ? '이미 계정이 있나요?' : '처음 오셨나요?'}{' '}
          <Link to={isRegister ? '/login' : '/register'}>{isRegister ? '로그인' : '회원가입'}</Link>
        </p>
        <div className="auth-links" aria-label="서비스 안내 링크">
          <Link to="/terms">이용안내</Link>
          <span aria-hidden="true">·</span>
          <Link to="/privacy">개인정보 안내</Link>
        </div>
      </section>

      <SignupNoticeModal notice={pendingSignup} onConfirm={confirmSignupNotice} />
    </main>
  );
}

function SignupNoticeModal({ notice, onConfirm }) {
  if (!notice) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal signup-notice-modal" role="dialog" aria-modal="true" aria-labelledby="signup-notice-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Welcome</p>
            <h2 id="signup-notice-title">회원가입이 완료되었습니다.</h2>
          </div>
        </div>

        <div className="signup-notice-body">
          <strong>{notice.user?.nickname || '회원'}님, 이용해 주셔서 감사합니다.</strong>
          <p>
            시작 자금 100,000,000원이 지급되었습니다. 아래 내용을 확인하신 뒤 모의투자를 시작해 주세요.
          </p>
          <ul>
            <li>매수와 매도는 평일 09:00~15:30에만 가능합니다.</li>
            <li>장외 시간에는 종목 조회, 포트폴리오 확인, 랭킹 확인만 가능합니다.</li>
            <li>주가는 장중 약 15분마다 갱신되며, 종가 반영을 위해 15:45까지 갱신될 수 있습니다.</li>
            <li>차트는 실제 가격 기록이 2회 이상 쌓인 뒤 표시됩니다.</li>
            <li>본 서비스는 학습용 모의투자이며, 투자 권유나 수익 보장을 의미하지 않습니다.</li>
          </ul>
        </div>

        <div className="modal-actions">
          <button className="primary-button" onClick={onConfirm}>
            확인했습니다
          </button>
        </div>
      </section>
    </div>
  );
}

function AnnouncementModal({ open, onClose, announcements, loading, showSkipToday, skipToday, onSkipTodayChange }) {
  if (!open) return null;

  const fallbackAnnouncements = [
    {
      id: 'service',
      title: '서비스 운영 안내',
      content:
        '본 서비스는 실제 돈을 사용하지 않는 한국 주식 모의투자 시뮬레이터입니다. 투자 권유나 수익 보장을 의미하지 않습니다.',
      isImportant: false,
    },
    {
      id: 'market-time',
      title: '거래 가능 시간',
      content: '매수와 매도는 평일 09:00~15:30에만 가능하며, 그 외 시간에는 조회만 가능합니다.',
      isImportant: false,
    },
    {
      id: 'chart',
      title: '가격과 차트 데이터',
      content: '가격은 장중 약 15분 간격으로 갱신됩니다. 차트는 실제 가격 기록이 2회 이상 쌓인 뒤 표시됩니다.',
      isImportant: false,
    },
  ];
  const visibleAnnouncements = [...announcements, ...fallbackAnnouncements];

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal announcement-modal" role="dialog" aria-modal="true" aria-labelledby="announcement-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Notice</p>
            <h2 id="announcement-title">안내 사항</h2>
          </div>
          <button className="icon-button subtle" onClick={onClose} title="닫기">
            <X size={19} />
          </button>
        </div>

        <div className="announcement-list">
          {loading && <p className="empty">공지사항을 불러오는 중입니다.</p>}
          {!loading &&
            visibleAnnouncements.map((announcement) => (
              <article className={announcement.isImportant ? 'important' : ''} key={announcement.id}>
                <strong>
                  {announcement.isImportant && <span className="important-badge">중요</span>}
                  {announcement.title}
                </strong>
                <p>{announcement.content}</p>
                {announcement.createdAt && (
                  <small className="announcement-time">
                    작성 {formatDateTime(announcement.createdAt)}
                    {wasAnnouncementEdited(announcement) && (
                      <span>수정됨 {formatDateTime(announcement.updatedAt)}</span>
                    )}
                  </small>
                )}
              </article>
            ))}
        </div>

        {showSkipToday && (
          <label className="checkbox-line announcement-skip">
            <input
              type="checkbox"
              checked={skipToday}
              onChange={(event) => onSkipTodayChange(event.target.checked)}
            />
            오늘 하루 자동으로 띄우지 않기
          </label>
        )}
      </section>
    </div>
  );
}

function SummaryTile({ icon, label, value, tone }) {
  return (
    <div className="summary-tile">
      <span className={`tile-icon ${tone}`}>{icon}</span>
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StockChart({ stock, period, setPeriod, history }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const chartSvgRef = useRef(null);
  const isPointerInteractingRef = useRef(false);
  const chartPoints = useMemo(() => {
    const historyPoints = history
      .map((item) => ({
        price: Number(item.price),
        recordedAt: item.recordedAt,
        estimated: false,
      }))
      .filter((item) => item.price > 0);
    return historyPoints;
  }, [history]);

  const hasEnoughHistory = chartPoints.length >= 2;
  const historyCount = chartPoints.length;
  const latestHistory = chartPoints[chartPoints.length - 1];
  const values = hasEnoughHistory ? chartPoints.map((item) => item.price) : [Number(stock?.price || 0)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const plottedPoints = hasEnoughHistory ? chartPoints.map((item, index) => {
    const x = 24 + index * (552 / Math.max(chartPoints.length - 1, 1));
    const y = 172 - ((item.price - min) / range) * 118;
    return { ...item, x, y };
  }) : [];
  const points = plottedPoints.map((item) => `${item.x},${item.y}`).join(' ');
  const fillPoints = `24,184 ${points} 576,184`;
  const tooltipLeftPercent = hoveredPoint ? (hoveredPoint.x / 600) * 100 : 50;
  const tooltipTopPercent = hoveredPoint ? (hoveredPoint.y / 210) * 100 : 50;
  const updateHoveredPoint = (event) => {
    if (!hasEnoughHistory || plottedPoints.length === 0 || !chartSvgRef.current) return;

    const rect = chartSvgRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 600;
    const nearestPoint = plottedPoints.reduce((nearest, point) =>
      Math.abs(point.x - x) < Math.abs(nearest.x - x) ? point : nearest,
    );
    setHoveredPoint(nearestPoint);
  };
  const startChartPointer = (event) => {
    if (!hasEnoughHistory) return;

    isPointerInteractingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateHoveredPoint(event);
  };
  const moveChartPointer = (event) => {
    if (event.pointerType !== 'mouse' && !isPointerInteractingRef.current) return;

    updateHoveredPoint(event);
  };
  const endChartPointer = (event) => {
    isPointerInteractingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (event.pointerType !== 'mouse') {
      setHoveredPoint(null);
    }
  };

  if (!stock) {
    return <section className="panel chart-main">종목을 선택해 주세요.</section>;
  }

  return (
    <section className="panel chart-main">
      <div className="chart-heading">
        <div>
          <p className="eyebrow">{stock.sector}</p>
          <h2>
            {stock.name} ({stock.code})
          </h2>
          <p className="muted">
            실제 갱신 가격 기록 · {historyCount >= 1 ? `${historyCount}개 기록` : '기록 대기 중'}
          </p>
        </div>
        <strong>{formatWon(stock.price)}</strong>
      </div>

      <div className="chart-canvas">
        <svg
          className="stock-chart"
          viewBox="0 0 600 210"
          role="img"
          aria-label={`${stock.name} 가격 차트`}
          ref={chartSvgRef}
          onPointerDown={startChartPointer}
          onPointerMove={moveChartPointer}
          onPointerUp={endChartPointer}
          onPointerCancel={endChartPointer}
          onPointerLeave={(event) => {
            if (!isPointerInteractingRef.current) {
              setHoveredPoint(null);
            }
            if (event.pointerType === 'mouse') {
              isPointerInteractingRef.current = false;
            }
          }}
        >
          <defs>
            <linearGradient id="stockFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#1f6f8b" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#1f6f8b" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path className="chart-grid" d="M24 54H576M24 93H576M24 132H576M24 172H576" />
          {!hasEnoughHistory && (
            <>
              <line className="chart-baseline" x1="64" x2="536" y1="112" y2="112" />
              <circle className="chart-dot ghost" cx="300" cy="112" r="5" />
            </>
          )}
          {hasEnoughHistory && <polygon points={fillPoints} fill="url(#stockFill)" />}
          {hasEnoughHistory && <polyline className="chart-line" points={points} />}
          {hoveredPoint && (
            <line className="chart-crosshair" x1={hoveredPoint.x} x2={hoveredPoint.x} y1="42" y2="184" />
          )}
          {plottedPoints.map((point) => (
            <circle
              className="chart-dot"
              key={`${point.recordedAt}-${point.price}`}
              cx={point.x}
              cy={point.y}
              r="5"
            />
          ))}
          {plottedPoints.map((point) => (
            <circle
              className="chart-hit-area"
              key={`${point.recordedAt}-${point.price}-hit`}
              cx={point.x}
              cy={point.y}
              r="18"
              tabIndex="0"
              onBlur={() => setHoveredPoint(null)}
              onFocus={() => setHoveredPoint(point)}
              onMouseEnter={() => setHoveredPoint(point)}
            />
          ))}
        </svg>
        {!hasEnoughHistory && (
          <div className="chart-empty">
            <strong>{historyCount === 0 ? '아직 저장된 가격 기록이 없습니다.' : '차트를 그리려면 가격 기록이 1개 더 필요합니다.'}</strong>
            <span>
              가격 기록은 평일 09:00~15:45에 약 15분 간격으로 저장됩니다. 같은 종목의 기록이 2개 이상 쌓이면 실제 변동 차트가 표시됩니다.
            </span>
            <div className="chart-empty-facts">
              <span>
                현재 기록
                <strong>{historyCount}개</strong>
              </span>
              <span>
                마지막 기록
                <strong>{latestHistory ? formatDateTime(latestHistory.recordedAt) : '대기 중'}</strong>
              </span>
            </div>
          </div>
        )}
        {hoveredPoint && (
          <div
            className="chart-tooltip"
            style={{
              left: `clamp(76px, ${tooltipLeftPercent}%, calc(100% - 76px))`,
              top: `${tooltipTopPercent}%`,
            }}
          >
            <strong>{formatWon(hoveredPoint.price)}</strong>
            <span>{formatDateTime(hoveredPoint.recordedAt)}</span>
          </div>
        )}
      </div>

      <div className="period-tabs">
        {PERIODS.map((item) => (
          <button
            className={period === item.key ? 'active' : ''}
            key={item.key}
            onClick={() => setPeriod(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function AssetHistoryChart({ history, totalAsset }) {
  const values = useMemo(() => {
    const historyValues = history.map((item) => Number(item.totalAsset)).filter((value) => value > 0);
    return historyValues.length >= 2 ? historyValues : [100000000, Number(totalAsset || 100000000)];
  }, [history, totalAsset]);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const points = values
    .map((value, index) => {
      const x = 16 + index * (568 / Math.max(values.length - 1, 1));
      const y = 92 - ((value - min) / range) * 56;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <section className="panel asset-history-panel">
      <div>
        <p className="eyebrow">Asset History</p>
        <h2>내 자산 기록</h2>
      </div>
      <strong>{formatWon(totalAsset)}</strong>
      <svg className="mini-asset-chart" viewBox="0 0 600 120" role="img" aria-label="내 자산 기록 차트">
        <path className="chart-grid" d="M16 36H584M16 64H584M16 92H584" />
        <polyline className="chart-line" points={points} />
      </svg>
    </section>
  );
}

function getProviderLabel(provider) {
  if (provider === 'kis') return '한국투자증권 기준';
  if (provider === 'mock') return 'Mock 데이터 기준';
  return '가격 공급자 확인 중';
}

function getChangeTone(value) {
  const numeric = Number(value || 0);
  if (numeric > 0) return 'kr-up';
  if (numeric < 0) return 'kr-down';
  return 'neutral';
}

function formatSignedPercent(value) {
  const numeric = Number(value || 0);
  const sign = numeric > 0 ? '+' : '';
  return `${sign}${numeric.toFixed(2)}%`;
}

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}

function OrderConfirmModal({ order, cashBalance, onCancel, onConfirm, loading }) {
  if (!order) return null;

  const isBuy = order.type === 'buy';
  const tradeCost = calculateTradeCost({ price: order.price, quantity: order.quantity, type: order.type });
  const nextCash = isBuy ? cashBalance - tradeCost.settlementAmount : cashBalance + tradeCost.settlementAmount;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="order-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">주문 확인</p>
            <h2 id="order-title">{isBuy ? '매수 주문' : '매도 주문'}</h2>
          </div>
          <button className="icon-button subtle" onClick={onCancel} title="닫기">
            <X size={19} />
          </button>
        </div>

        <div className="order-summary">
          <div>
            <span className="muted">종목</span>
            <strong>{order.stockName}</strong>
            <small>
              {order.stockCode} · {order.sector || '기타'}
            </small>
          </div>
          <div>
            <span className="muted">수량</span>
            <strong>{order.quantity.toLocaleString('ko-KR')}주</strong>
          </div>
          <div>
            <span className="muted">주문 가격</span>
            <strong>{formatWon(order.price)}</strong>
          </div>
          <div>
            <span className="muted">총 주문금액</span>
            <strong>{formatWon(tradeCost.grossAmount)}</strong>
          </div>
          <div>
            <span className="muted">수수료</span>
            <strong>{formatWon(tradeCost.fee)}</strong>
          </div>
          <div>
            <span className="muted">거래세</span>
            <strong>{isBuy ? '-' : formatWon(tradeCost.tax)}</strong>
          </div>
          <div>
            <span className="muted">{isBuy ? '총 차감액' : '예상 수령액'}</span>
            <strong>{formatWon(tradeCost.settlementAmount)}</strong>
          </div>
          <div>
            <span className="muted">현재 현금</span>
            <strong>{formatWon(cashBalance)}</strong>
          </div>
          <div>
            <span className="muted">거래 후 예상 현금</span>
            <strong className={nextCash < 0 ? 'negative' : ''}>{formatWon(nextCash)}</strong>
          </div>
        </div>

        {isBuy && nextCash < 0 && <p className="error">현금이 부족합니다. 수량을 줄여 주세요.</p>}

        <div className="modal-actions">
          <button className="secondary-button" onClick={onCancel} disabled={loading}>
            취소
          </button>
          <button className="primary-button" onClick={onConfirm} disabled={loading || (isBuy && nextCash < 0)}>
            {loading ? '처리 중' : isBuy ? '매수 확정' : '매도 확정'}
          </button>
        </div>
      </section>
    </div>
  );
}

function PasswordChangeModal({ open, onCancel, onConfirm, loading, error, message }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  useEffect(() => {
    if (open) {
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    }
  }, [open]);

  if (!open) return null;

  const passwordsMatch = form.newPassword && form.newPassword === form.confirmPassword;
  const canSubmit = form.currentPassword && form.newPassword.length >= 8 && passwordsMatch;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal account-modal" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Account</p>
            <h2 id="change-password-title">비밀번호 변경</h2>
          </div>
          <button className="icon-button subtle" onClick={onCancel} title="닫기" disabled={loading}>
            <X size={19} />
          </button>
        </div>

        <div className="account-help">
          현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다. 새 비밀번호는 8자 이상이어야 합니다.
        </div>

        <div className="account-form-grid">
          <label>
            현재 비밀번호
            <input
              type="password"
              value={form.currentPassword}
              onChange={(event) => setForm({ ...form, currentPassword: event.target.value })}
              autoFocus
              disabled={loading}
            />
          </label>
          <label>
            새 비밀번호
            <input
              type="password"
              minLength={8}
              value={form.newPassword}
              onChange={(event) => setForm({ ...form, newPassword: event.target.value })}
              disabled={loading}
            />
          </label>
          <label>
            새 비밀번호 확인
            <input
              type="password"
              minLength={8}
              value={form.confirmPassword}
              onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
              disabled={loading}
            />
          </label>
        </div>

        {form.confirmPassword && !passwordsMatch && <p className="error">새 비밀번호가 서로 일치하지 않습니다.</p>}
        {error && <p className="error">{error}</p>}
        {message && <p className="notice">{message}</p>}

        <div className="modal-actions">
          <button className="secondary-button" onClick={onCancel} disabled={loading}>
            닫기
          </button>
          <button className="primary-button" onClick={() => onConfirm(form)} disabled={loading || !canSubmit}>
            {loading ? '변경 중' : '비밀번호 변경'}
          </button>
        </div>
      </section>
    </div>
  );
}

function AccountDeleteModal({ open, onCancel, onConfirm, loading, error }) {
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (open) {
      setPassword('');
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal account-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Account</p>
            <h2 id="delete-account-title">회원탈퇴 확인</h2>
          </div>
          <button className="icon-button subtle" onClick={onCancel} title="닫기" disabled={loading}>
            <X size={19} />
          </button>
        </div>

        <div className="account-delete-warning">
          <strong>탈퇴하면 계정과 모든 모의투자 기록이 삭제됩니다.</strong>
          <p>
            현금, 보유 종목, 거래 내역, 자산 기록, 랭킹 기록이 함께 삭제되며 복구할 수 없습니다.
            계속하려면 비밀번호를 입력해 주세요.
          </p>
        </div>

        <label>
          비밀번호 확인
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
            disabled={loading}
          />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button className="secondary-button" onClick={onCancel} disabled={loading}>
            취소
          </button>
          <button className="danger-button" onClick={() => onConfirm(password)} disabled={loading || !password}>
            {loading ? '탈퇴 처리 중' : '회원탈퇴'}
          </button>
        </div>
      </section>
    </div>
  );
}

function Toast({ toast, onClose }) {
  if (!toast) return null;

  return (
    <div className={`toast ${toast.type || 'info'}`} role="status" aria-live="polite">
      <div>
        <strong>{toast.title}</strong>
        <span>{toast.message}</span>
      </div>
      <button className="notice-close" onClick={onClose} title="알림 닫기">
        <X size={17} />
      </button>
    </div>
  );
}

function Dashboard({ logout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const accountMenuRef = useRef(null);
  const tradeGuideRef = useRef(null);
  const [portfolio, setPortfolio] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [myRanking, setMyRanking] = useState(null);
  const [rankingSort, setRankingSort] = useState('asset');
  const [trades, setTrades] = useState([]);
  const [openOrders, setOpenOrders] = useState([]);
  const [tradeFilter, setTradeFilter] = useState('ALL');
  const [tradeQuery, setTradeQuery] = useState('');
  const [holdingSort, setHoldingSort] = useState('default');
  const [assetHistory, setAssetHistory] = useState([]);
  const [query, setQuery] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [orderType, setOrderType] = useState('MARKET');
  const [limitPrice, setLimitPrice] = useState('');
  const [tradeGuideOpen, setTradeGuideOpen] = useState(false);
  const [selectedCode, setSelectedCode] = useState('');
  const [period, setPeriod] = useState('15M');
  const [priceHistory, setPriceHistory] = useState([]);
  const [toast, setToast] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [pendingOrder, setPendingOrder] = useState(null);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [announcementAutoOpened, setAnnouncementAutoOpened] = useState(false);
  const [skipAnnouncementToday, setSkipAnnouncementToday] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [showWelcomeGuide, setShowWelcomeGuide] = useState(
    () => localStorage.getItem('welcomeGuideDismissed') !== 'true',
  );

  const selectedStock = useMemo(
    () => stocks.find((stock) => stock.code === selectedCode) || stocks[0],
    [stocks, selectedCode],
  );
  const selectedHolding = useMemo(
    () => portfolio?.holdings.find((holding) => holding.stockCode === selectedStock?.code),
    [portfolio, selectedStock],
  );

  const filteredStocks = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return stocks;
    return stocks.filter(
      (stock) =>
        stock.code.includes(keyword) ||
        stock.name.toLowerCase().includes(keyword) ||
        stock.sector.toLowerCase().includes(keyword),
    );
  }, [query, stocks]);

  const filteredTrades = useMemo(() => {
    const keyword = tradeQuery.trim().toLowerCase();
    return trades.filter((trade) => {
      const matchesType = tradeFilter === 'ALL' || trade.type === tradeFilter;
      const matchesKeyword =
        !keyword ||
        trade.stockName.toLowerCase().includes(keyword) ||
        trade.stockCode.toLowerCase().includes(keyword);
      return matchesType && matchesKeyword;
    });
  }, [trades, tradeFilter, tradeQuery]);

  const sortedHoldings = useMemo(() => {
    const holdings = portfolio?.holdings || [];
    return [...holdings].sort((a, b) => {
      if (holdingSort === 'profit') return Number(b.profitLoss) - Number(a.profitLoss);
      if (holdingSort === 'value') {
        return Number(b.currentPrice) * Number(b.quantity) - Number(a.currentPrice) * Number(a.quantity);
      }
      if (holdingSort === 'name') return a.stockName.localeCompare(b.stockName, 'ko-KR');
      return 0;
    });
  }, [portfolio?.holdings, holdingSort]);

  const load = async () => {
    const [portfolioResponse, stocksResponse, rankingResponse] = await Promise.all([
      api.get('/portfolio'),
      api.get('/stocks'),
      api.get('/ranking', { params: { sort: rankingSort } }),
    ]);
    const tradesResponse = await api.get('/trades').catch(() => ({ data: { trades: [] } }));
    const ordersResponse = await api.get('/orders').catch(() => ({ data: { orders: [] } }));
    const assetHistoryResponse = await api.get('/asset-history').catch(() => ({ data: { history: [] } }));

    setPortfolio(portfolioResponse.data);
    setStocks(stocksResponse.data.stocks);
    setSelectedCode((current) => current || stocksResponse.data.stocks[0]?.code || '');
    setRanking(rankingResponse.data.ranking);
    setMyRanking(rankingResponse.data.me);
    setTrades(normalizeList(tradesResponse.data?.trades));
    setOpenOrders(normalizeList(ordersResponse.data?.orders));
    setAssetHistory(normalizeList(assetHistoryResponse.data?.history));
  };

  useEffect(() => {
    load().catch((error) => {
      if (error.response?.status === 401) {
        logout();
        return;
      }
      setLoadError('데이터를 불러오지 못했습니다. 서버를 확인한 뒤 새로고침해 주세요.');
    });
  }, []);

  useEffect(() => {
    api
      .get('/ranking', { params: { sort: rankingSort } })
      .then((response) => {
        setRanking(response.data.ranking);
        setMyRanking(response.data.me);
      })
      .catch(() => {});
  }, [rankingSort]);

  useEffect(() => {
    if (!selectedStock?.code) return;

    api
      .get(`/stocks/${selectedStock.code}/history`, { params: { period } })
      .then((response) => setPriceHistory(response.data.history || []))
      .catch(() => setPriceHistory([]));
  }, [selectedStock?.code, period]);

  useEffect(() => {
    if (selectedStock?.price) {
      setLimitPrice(String(Math.round(Number(selectedStock.price))));
    }
  }, [selectedStock?.code, selectedStock?.price]);

  const openAnnouncements = async ({ automatic = false } = {}) => {
    setAnnouncementOpen(true);
    setAnnouncementAutoOpened(automatic);
    setSkipAnnouncementToday(false);
    setAnnouncementsLoading(true);

    try {
      const { data } = await api.get('/announcements');
      setAnnouncements(data.announcements || []);
    } catch {
      setAnnouncements([]);
    } finally {
      setAnnouncementsLoading(false);
    }
  };

  useEffect(() => {
    if (!location.state?.openAnnouncements) return;

    if (localStorage.getItem(ANNOUNCEMENT_SKIP_DATE_KEY) !== getTodayKey()) {
      openAnnouncements({ automatic: true });
    }
    navigate('/', { replace: true, state: {} });
  }, [location.state?.openAnnouncements]);

  const closeAnnouncements = () => {
    if (announcementAutoOpened && skipAnnouncementToday) {
      localStorage.setItem(ANNOUNCEMENT_SKIP_DATE_KEY, getTodayKey());
    }

    setAnnouncementOpen(false);
    setAnnouncementAutoOpened(false);
    setSkipAnnouncementToday(false);
  };

  const showToast = ({ type = 'info', title, message: toastMessage }) => {
    setToast({
      id: Date.now(),
      type,
      title,
      message: toastMessage,
    });
  };

  useEffect(() => {
    if (!toast) return undefined;

    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!accountMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (accountMenuRef.current?.contains(event.target)) return;
      setAccountMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!tradeGuideOpen) return undefined;

    const handlePointerDown = (event) => {
      if (tradeGuideRef.current?.contains(event.target)) return;
      setTradeGuideOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [tradeGuideOpen]);

  const openOrder = (type) => {
    if (!selectedStock) return;
    const orderQuantity = Number(quantity || 1);
    const effectiveLimitPrice = Number(limitPrice);
    const effectivePrice = orderType === 'LIMIT' ? effectiveLimitPrice : selectedStock.price;

    if (!Number.isInteger(orderQuantity) || orderQuantity <= 0) {
      showToast({ type: 'error', title: '수량 확인', message: '수량은 1 이상의 정수여야 합니다.' });
      return;
    }

    if (orderType === 'LIMIT' && (!Number.isFinite(effectiveLimitPrice) || effectiveLimitPrice <= 0)) {
      showToast({ type: 'error', title: '지정가 확인', message: '지정가 주문 가격을 1원 이상으로 입력해 주세요.' });
      return;
    }

    if (type === 'sell' && (!selectedHolding || orderQuantity > selectedHolding.quantity)) {
      showToast({ type: 'error', title: '매도 불가', message: '선택한 종목의 보유 수량이 부족합니다.' });
      return;
    }

    setPendingOrder({
      type,
      stockCode: selectedStock.code,
      stockName: selectedStock.name,
      sector: selectedStock.sector,
      quantity: orderQuantity,
      price: effectivePrice,
      currentPrice: selectedStock.price,
      orderType,
    });
  };

  const confirmTrade = async () => {
    if (!pendingOrder) return;

    setTradeLoading(true);

    try {
      const { data } = await api.post(`/trade/${pendingOrder.type}`, {
        stockCode: pendingOrder.stockCode,
        quantity: pendingOrder.quantity,
        orderType: pendingOrder.orderType,
        limitPrice: pendingOrder.orderType === 'LIMIT' ? pendingOrder.price : undefined,
      });
      setPortfolio(data.portfolio || data);
      const [rankingResponse, tradesResponse, ordersResponse, assetHistoryResponse] = await Promise.all([
        api.get('/ranking', { params: { sort: rankingSort } }),
        api.get('/trades'),
        api.get('/orders'),
        api.get('/asset-history'),
      ]);
      setRanking(rankingResponse.data.ranking);
      setMyRanking(rankingResponse.data.me);
      setTrades(normalizeList(tradesResponse.data?.trades));
      setOpenOrders(normalizeList(ordersResponse.data?.orders));
      setAssetHistory(normalizeList(assetHistoryResponse.data?.history));
      setPendingOrder(null);
      const isOpenOrder = data.orderStatus === 'OPEN';
      if (isOpenOrder) {
        showToast({
          type: pendingOrder.type === 'buy' ? 'buy' : 'sell',
          title: '미체결 주문 등록',
          message: `${pendingOrder.stockName} 지정가 주문이 미체결 목록에 등록되었습니다.`,
        });
        return;
      }
      showToast({
        type: pendingOrder.type === 'buy' ? 'buy' : 'sell',
        title: pendingOrder.type === 'buy' ? '매수 완료' : '매도 완료',
        message: `${pendingOrder.stockName} ${pendingOrder.quantity.toLocaleString('ko-KR')}주 거래가 완료되었습니다.`,
      });
    } catch (error) {
      showToast({
        type: 'error',
        title: '거래 실패',
        message: error.response?.data?.message || '거래를 처리하지 못했습니다.',
      });
    } finally {
      setTradeLoading(false);
    }
  };

  const cancelOpenOrder = async (orderId) => {
    try {
      const { data } = await api.delete(`/orders/${orderId}`);
      setPortfolio(data.portfolio);
      const [ordersResponse, rankingResponse, assetHistoryResponse] = await Promise.all([
        api.get('/orders'),
        api.get('/ranking', { params: { sort: rankingSort } }),
        api.get('/asset-history'),
      ]);
      setOpenOrders(normalizeList(ordersResponse.data?.orders));
      setRanking(rankingResponse.data.ranking);
      setMyRanking(rankingResponse.data.me);
      setAssetHistory(normalizeList(assetHistoryResponse.data?.history));
      showToast({ type: 'info', title: '주문 취소', message: '미체결 주문이 취소되었습니다.' });
    } catch (error) {
      showToast({
        type: 'error',
        title: '취소 실패',
        message: error.response?.data?.message || '주문을 취소하지 못했습니다.',
      });
    }
  };

  const closeDeleteModal = () => {
    if (deleteLoading) return;
    setDeleteModalOpen(false);
    setDeleteError('');
  };

  const closePasswordModal = () => {
    if (passwordLoading) return;
    setPasswordModalOpen(false);
    setPasswordError('');
    setPasswordMessage('');
  };

  const confirmPasswordChange = async (form) => {
    setPasswordLoading(true);
    setPasswordError('');
    setPasswordMessage('');

    try {
      const { data } = await api.patch('/auth/password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setPasswordMessage(data.message || '비밀번호가 변경되었습니다.');
    } catch (error) {
      if (error.response?.status === 401 && !error.response?.data?.message) {
        logout();
        return;
      }

      setPasswordError(error.response?.data?.message || '비밀번호를 변경하지 못했습니다.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const confirmDeleteAccount = async (password) => {
    setDeleteLoading(true);
    setDeleteError('');

    try {
      await api.delete('/auth/me', { data: { password } });
      alert('회원탈퇴가 완료되었습니다.');
      logout();
    } catch (error) {
      if (error.response?.status === 401 && !error.response?.data?.message) {
        logout();
        return;
      }

      setDeleteError(error.response?.data?.message || '회원탈퇴를 처리하지 못했습니다.');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!portfolio) {
    return <main className="loading">{loadError || '불러오는 중'}</main>;
  }

  const marketOpen = portfolio.marketStatus?.canTrade ?? portfolio.marketStatus?.isOpen;
  const currentQuantity = Math.max(Number(quantity || 0), 0);
  const selectedPrice = Number(selectedStock?.price || 0);
  const orderPrice = orderType === 'LIMIT' ? Number(limitPrice || 0) : selectedPrice;
  const estimatedCost = calculateTradeCost({ price: orderPrice, quantity: currentQuantity, type: 'buy' }).settlementAmount;
  const maxBuyQuantity = getMaxBuyQuantity(portfolio.summary.cashBalance, orderPrice || selectedPrice);
  const maxSellQuantity = selectedHolding?.quantity || 0;
  const rawQuantity = Number(quantity);
  const invalidQuantity = !Number.isInteger(rawQuantity) || rawQuantity <= 0;
  const invalidLimitPrice = orderType === 'LIMIT' && (!Number.isFinite(orderPrice) || orderPrice <= 0);
  const buyDisabled = !marketOpen || invalidQuantity || invalidLimitPrice || currentQuantity > maxBuyQuantity;
  const sellDisabled = !marketOpen || invalidQuantity || invalidLimitPrice || !selectedHolding || currentQuantity > maxSellQuantity;
  const tradeNotice = !marketOpen
    ? '현재는 조회 전용 시간입니다. 매수/매도는 평일 09:00~15:30에 가능합니다.'
    : invalidQuantity
      ? '수량은 1주 이상 정수로 입력해 주세요.'
      : currentQuantity > maxBuyQuantity
        ? `현재 현금으로는 ${maxBuyQuantity.toLocaleString('ko-KR')}주까지 매수할 수 있습니다.`
        : selectedHolding && currentQuantity > maxSellQuantity
          ? `보유 수량은 ${maxSellQuantity.toLocaleString('ko-KR')}주입니다.`
          : '';
  const setPresetQuantity = (value) => setQuantity(Math.max(1, Number(value || 1)));
  const addQuantity = (amount) => setPresetQuantity(Number(quantity || 0) + amount);
  const closeWelcomeGuide = () => {
    localStorage.setItem('welcomeGuideDismissed', 'true');
    setShowWelcomeGuide(false);
  };
  const priceRefresh = portfolio.priceRefresh || {};
  const priceRefreshLabel = `${getProviderLabel(priceRefresh.provider)} · ${priceRefresh.intervalMinutes || 15}분 갱신`;
  const lastPriceRefreshAt = priceRefresh.lastSuccessAt || priceRefresh.priceUpdatedAt || portfolio.priceUpdatedAt;

  return (
    <main className="app-shell">
      <nav className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <ChartNoAxesCombined size={28} />
          </span>
          <span>
            <p className="eyebrow">Korean Stock Simulator</p>
            <h1>{BRAND_SHORT}</h1>
          </span>
        </div>
        <div className="topbar-actions">
          <span className="updated-at">
            <Clock3 size={16} />
            마지막 갱신 {formatDateTime(lastPriceRefreshAt)}
          </span>
          <span className="data-source">
            {priceRefreshLabel}
          </span>
          <span className={`status ${marketOpen ? 'open' : 'closed'}`}>
            {portfolio.marketStatus?.label || '조회 전용'}
          </span>
          <button className="icon-button" onClick={openAnnouncements} title="공지사항">
            <Megaphone size={18} />
          </button>
          {portfolio.isAdmin && (
            <Link className="icon-button" to="/admin" title="관리자">
              <ShieldCheck size={19} />
            </Link>
          )}
          <div className="account-menu" ref={accountMenuRef}>
            <button
              className="account-menu-trigger"
              onClick={() => setAccountMenuOpen((current) => !current)}
              type="button"
            >
              <span>{portfolio.user?.nickname?.slice(0, 1) || '내'}</span>
              <strong>{portfolio.user?.nickname || '내 계정'}</strong>
              <em>
                <Settings size={15} />
                프로필
              </em>
            </button>
            {accountMenuOpen && (
              <div className="account-menu-popover">
                <button
                  onClick={() => {
                    setPasswordModalOpen(true);
                    setAccountMenuOpen(false);
                  }}
                  type="button"
                >
                  <KeyRound size={17} />
                  비밀번호 변경
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    setDeleteModalOpen(true);
                    setAccountMenuOpen(false);
                  }}
                  type="button"
                >
                  <Trash2 size={17} />
                  회원탈퇴
                </button>
                <button
                  onClick={() => {
                    setAccountMenuOpen(false);
                    logout();
                  }}
                  type="button"
                >
                  <LogOut size={17} />
                  로그아웃
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <section className="summary-grid">
        <SummaryTile icon={<Wallet size={20} />} label="현금" value={formatWon(portfolio.summary.cashBalance)} tone="green" />
        <SummaryTile
          icon={<ChartNoAxesCombined size={20} />}
          label="주식 평가금액"
          value={formatWon(portfolio.summary.stockValue)}
          tone="blue"
        />
        <SummaryTile
          icon={<ArrowDownUp size={20} />}
          label="총자산"
          value={formatWon(portfolio.summary.totalAsset)}
          tone="yellow"
        />
        <SummaryTile
          icon={<Trophy size={20} />}
          label="수익률"
          value={formatPercent(portfolio.summary.returnRate)}
          tone={portfolio.summary.returnRate >= 0 ? 'green' : 'red'}
        />
      </section>

      <AssetHistoryChart history={assetHistory} totalAsset={portfolio.summary.totalAsset} />

      {showWelcomeGuide && (
        <div className="notice welcome-guide">
          <div>
            <strong>모의투자를 시작하기 전에 확인해 주세요.</strong>
            <p>
              매수와 매도는 평일 09:00~15:30에만 가능하며, 장외 시간에는 조회만 가능합니다.
              차트는 실제 가격 기록이 쌓인 뒤 표시됩니다. 본 서비스는 학습용 모의투자이며 투자 권유가 아닙니다.
              이용해 주셔서 감사합니다.
            </p>
          </div>
          <button className="notice-close" onClick={closeWelcomeGuide} title="안내 닫기">
            <X size={17} />
          </button>
        </div>
      )}

      {priceRefresh.lastError && (
        <div className="notice warning-notice">
          최근 가격 갱신에서 {priceRefresh.failedCount || '일부'}개 종목은 이전 가격을 표시하고 있습니다.
        </div>
      )}

      <section className="trade-layout">
        <aside className="panel stock-list-panel">
          <div className="search-box full">
            <Search size={18} />
            <input
              placeholder="종목명, 코드, 업종"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="stock-list">
            {filteredStocks.map((stock) => (
              <button
                className={`stock-list-item ${selectedStock?.code === stock.code ? 'selected' : ''}`}
                key={stock.code}
                onClick={() => setSelectedCode(stock.code)}
              >
                <span>
                  <strong>{stock.name}</strong>
                  <small>{stock.code} · {stock.sector}</small>
                </span>
                <span>
                  <strong>{formatWon(stock.price)}</strong>
                  <small className={getChangeTone(stock.changeRate)}>
                    {formatSignedPercent(stock.changeRate)}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <StockChart stock={selectedStock} period={period} setPeriod={setPeriod} history={priceHistory} />

        <aside className="panel order-panel">
          <div className="panel-heading compact order-heading">
            <h2>지금 거래</h2>
            <div className="trade-guide-menu" ref={tradeGuideRef}>
              <button
                className="info-button"
                onClick={() => setTradeGuideOpen((current) => !current)}
                title="주문 안내"
                type="button"
              >
                <Info size={17} />
              </button>
              {tradeGuideOpen && (
                <div className="trade-guide-box">
                  <strong>주문 안내</strong>
                  <p>시장가는 현재 표시 가격으로 바로 주문합니다.</p>
                  <p>지정가는 원하는 가격에 도달하면 자동 체결되며, 체결 전에는 미체결 주문으로 남습니다.</p>
                  <p>수수료는 매수/매도 0.015%, 매도 거래세는 0.18%가 적용됩니다.</p>
                </div>
              )}
            </div>
          </div>
          <div className={`trade-status-card ${marketOpen ? 'open' : 'closed'}`}>
            <strong>{marketOpen ? '거래 가능' : '조회 전용'}</strong>
            <span>{marketOpen ? '현재 매수와 매도가 가능합니다.' : '매수/매도는 평일 09:00~15:30에 가능합니다.'}</span>
            <small>시세는 평일 09:00~15:45 중 약 15분 간격으로 갱신됩니다.</small>
          </div>
          <label>
            종목
            <input value={selectedStock ? `${selectedStock.name} (${selectedStock.code})` : ''} readOnly />
          </label>
          <div className="order-type-tabs" aria-label="주문 방식">
            <button
              className={orderType === 'MARKET' ? 'active' : ''}
              onClick={() => setOrderType('MARKET')}
              type="button"
            >
              시장가
            </button>
            <button
              className={orderType === 'LIMIT' ? 'active' : ''}
              onClick={() => setOrderType('LIMIT')}
              type="button"
            >
              지정가
            </button>
          </div>
          {orderType === 'LIMIT' && (
            <label>
              지정가
              <input
                type="number"
                min="1"
                value={limitPrice}
                onChange={(event) => setLimitPrice(event.target.value)}
              />
            </label>
          )}
          <label>
            수량
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>

          <div className="quantity-tools">
            <button onClick={() => addQuantity(1)}>+1</button>
            <button onClick={() => addQuantity(10)}>+10</button>
            <button onClick={() => setPresetQuantity(maxBuyQuantity)} disabled={maxBuyQuantity <= 0}>
              최대매수
            </button>
            <button onClick={() => setPresetQuantity(maxSellQuantity)} disabled={maxSellQuantity <= 0}>
              최대매도
            </button>
            <button onClick={() => setPresetQuantity(1)}>초기화</button>
          </div>

          <div className="order-metrics">
            <span>현재 가격</span>
            <strong>{formatWon(selectedStock?.price)}</strong>
            <span>매수 예상 차감액</span>
            <strong>{formatWon(estimatedCost)}</strong>
            <span>보유 수량</span>
            <strong>{selectedHolding?.quantity?.toLocaleString('ko-KR') || 0}주</strong>
            <span>매수 가능</span>
            <strong>{maxBuyQuantity.toLocaleString('ko-KR')}주</strong>
            <span>매도 가능</span>
            <strong>{maxSellQuantity.toLocaleString('ko-KR')}주</strong>
          </div>

          <div className="order-buttons">
            <button className="buy-button" disabled={buyDisabled} onClick={() => openOrder('buy')}>
              {quantity || 1}주 매수
            </button>
            <button className="sell-button" disabled={sellDisabled} onClick={() => openOrder('sell')}>
              {quantity || 1}주 매도
            </button>
          </div>
          {tradeNotice && <p className="trade-notice">{tradeNotice}</p>}
        </aside>
      </section>

      <section className="panel open-orders-panel">
        <div className="panel-heading">
          <h2>미체결 주문</h2>
          <span className="muted">{openOrders.length.toLocaleString('ko-KR')}건</span>
        </div>
        <div className="open-order-list">
          {openOrders.map((order) => (
            <div className="open-order-item" key={order.id}>
              <span>
                <strong>{order.stockName}</strong>
                <small>{order.stockCode}</small>
              </span>
              <span className={order.type === 'BUY' ? 'trade-buy' : 'trade-sell'}>
                {order.type === 'BUY' ? '매수' : '매도'}
              </span>
              <span>{order.quantity.toLocaleString('ko-KR')}주</span>
              <span>{formatWon(order.limitPrice)}</span>
              <button className="secondary-button" onClick={() => cancelOpenOrder(order.id)}>
                취소
              </button>
            </div>
          ))}
          {openOrders.length === 0 && <p className="empty">미체결 주문이 없습니다.</p>}
        </div>
      </section>

      <section className="bottom-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>내 포트폴리오</h2>
            <div className="holding-sort-tabs" aria-label="보유 종목 정렬">
              {[
                { key: 'default', label: '기본' },
                { key: 'profit', label: '손익순' },
                { key: 'value', label: '보유금액순' },
                { key: 'name', label: '종목명순' },
              ].map((item) => (
                <button
                  className={holdingSort === item.key ? 'active' : ''}
                  key={item.key}
                  onClick={() => setHoldingSort(item.key)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="table holdings-table">
            <div className="row head">
              <span>종목명</span>
              <span>수량</span>
              <span>평균단가</span>
              <span>현재가</span>
              <span>평가손익</span>
              <span>동작</span>
            </div>
            {sortedHoldings.map((holding) => (
              <div className="row" key={holding.stockCode}>
                <span>
                  <strong>{holding.stockName}</strong>
                  <small>{holding.stockCode}</small>
                </span>
                <span>{holding.quantity.toLocaleString('ko-KR')}</span>
                <span>{formatWon(holding.avgPrice)}</span>
                <span>{formatWon(holding.currentPrice)}</span>
                <span className={holding.profitLoss >= 0 ? 'positive' : 'negative'}>
                  {formatWon(holding.profitLoss)}
                </span>
                <button onClick={() => setSelectedCode(holding.stockCode)}>선택</button>
              </div>
            ))}
            {portfolio.holdings.length === 0 && <p className="empty">보유 종목이 없습니다.</p>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>TOP 10 랭킹</h2>
            <div className="ranking-tabs">
              <button className={rankingSort === 'asset' ? 'active' : ''} onClick={() => setRankingSort('asset')}>
                총자산
              </button>
              <button className={rankingSort === 'return' ? 'active' : ''} onClick={() => setRankingSort('return')}>
                수익률
              </button>
            </div>
          </div>
          <div className="ranking-guide">
            <strong>{rankingSort === 'asset' ? '총자산 기준 TOP 10' : '수익률 기준 TOP 10'}</strong>
            <span>
              모든 유저는 100,000,000원으로 시작하며, 수익률은 시작 자산 대비 현재 총자산 기준으로 계산됩니다.
            </span>
          </div>
          {myRanking && (
            <div className="my-ranking">
              <span>내 순위</span>
              <strong>{myRanking.rank}위</strong>
              <span>{myRanking.nickname}</span>
              <span>{formatWon(myRanking.totalAsset)}</span>
              <em>{formatPercent(myRanking.returnRate)}</em>
            </div>
          )}
          <div className="ranking-list">
            <div className="ranking-item ranking-head">
              <span>순위</span>
              <span>닉네임</span>
              <span>총자산</span>
              <span>수익률</span>
            </div>
            {ranking.map((item) => (
              <div className={`ranking-item ${myRanking?.userId === item.userId ? 'me' : ''}`} key={item.userId}>
                <strong>{item.rank}</strong>
                <span>{item.nickname}</span>
                <span>{formatWon(item.totalAsset)}</span>
                <em>{formatPercent(item.returnRate)}</em>
              </div>
            ))}
            {ranking.length === 0 && <p className="muted">아직 랭킹이 없습니다.</p>}
          </div>
        </section>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>거래 내역</h2>
          <span className="muted">
            {filteredTrades.length.toLocaleString('ko-KR')} / {trades.length.toLocaleString('ko-KR')}건
          </span>
        </div>
        <div className="trade-history-tools">
          <div className="segmented-tabs" role="tablist" aria-label="거래 구분 필터">
            {[
              { key: 'ALL', label: '전체' },
              { key: 'BUY', label: '매수' },
              { key: 'SELL', label: '매도' },
            ].map((item) => (
              <button
                className={tradeFilter === item.key ? 'active' : ''}
                key={item.key}
                onClick={() => setTradeFilter(item.key)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="search-box compact">
            <Search size={16} />
            <input
              placeholder="종목명 또는 코드"
              value={tradeQuery}
              onChange={(event) => setTradeQuery(event.target.value)}
            />
          </div>
        </div>
        <div className="table trades-table">
          <div className="row head">
            <span>시간</span>
            <span>구분</span>
            <span>종목</span>
            <span>수량</span>
            <span>가격</span>
            <span>금액</span>
          </div>
          {filteredTrades.map((trade) => (
            <div className="row" key={trade.id}>
              <span>{formatDateTime(trade.createdAt)}</span>
              <span className={trade.type === 'BUY' ? 'trade-buy' : 'trade-sell'}>
                {trade.type === 'BUY' ? '매수' : '매도'}
              </span>
              <span>
                <strong>{trade.stockName}</strong>
                <small>{trade.stockCode}</small>
              </span>
              <span>{trade.quantity.toLocaleString('ko-KR')}</span>
              <span>{formatWon(trade.price)}</span>
              <span>{formatWon(trade.totalAmount)}</span>
            </div>
          ))}
          {trades.length === 0 && <p className="empty">거래 내역이 없습니다.</p>}
          {trades.length > 0 && filteredTrades.length === 0 && <p className="empty">조건에 맞는 거래 내역이 없습니다.</p>}
        </div>
      </section>

      <OrderConfirmModal
        order={pendingOrder}
        cashBalance={portfolio.summary.cashBalance}
        onCancel={() => setPendingOrder(null)}
        onConfirm={confirmTrade}
        loading={tradeLoading}
      />
      <AnnouncementModal
        open={announcementOpen}
        onClose={closeAnnouncements}
        announcements={announcements}
        loading={announcementsLoading}
        showSkipToday={announcementAutoOpened}
        skipToday={skipAnnouncementToday}
        onSkipTodayChange={setSkipAnnouncementToday}
      />
      <PasswordChangeModal
        open={passwordModalOpen}
        onCancel={closePasswordModal}
        onConfirm={confirmPasswordChange}
        loading={passwordLoading}
        error={passwordError}
        message={passwordMessage}
      />
      <AccountDeleteModal
        open={deleteModalOpen}
        onCancel={closeDeleteModal}
        onConfirm={confirmDeleteAccount}
        loading={deleteLoading}
        error={deleteError}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </main>
  );
}

function formatUptime(seconds) {
  const safeSeconds = Math.max(Number(seconds || 0), 0);
  const days = Math.floor(safeSeconds / 86400);
  const hours = Math.floor((safeSeconds % 86400) / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

function AdminStatCard({ icon, label, value, detail, tone = 'blue' }) {
  return (
    <section className={`admin-stat-card ${tone}`}>
      <div className="admin-stat-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </section>
  );
}

function AdminUserDetailModal({ detail, loading, error, onClose }) {
  if (!detail && !loading && !error) return null;

  const user = detail?.user || {};
  const summary = detail?.summary || {};
  const holdings = detail?.holdings || [];
  const trades = detail?.trades || [];

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal admin-user-modal" role="dialog" aria-modal="true" aria-labelledby="admin-user-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">User Detail</p>
            <h2 id="admin-user-title">{loading ? '유저 정보를 불러오는 중' : `${user.nickname || '유저'} 상세`}</h2>
          </div>
          <button className="icon-button subtle" onClick={onClose} title="닫기">
            <X size={19} />
          </button>
        </div>

        {loading && <p className="empty">유저 상세 정보를 불러오는 중입니다.</p>}
        {error && <p className="error">{error}</p>}

        {!loading && detail && (
          <div className="admin-user-detail">
            <div className="admin-user-profile">
              <span>
                <strong>{user.nickname}</strong>
                <small>{user.email}</small>
              </span>
              <span>
                가입일
                <strong>{formatDateTime(user.createdAt)}</strong>
              </span>
            </div>

            <div className="admin-user-summary">
              <span>
                현금
                <strong>{formatWon(summary.cashBalance)}</strong>
              </span>
              <span>
                주식 평가
                <strong>{formatWon(summary.stockValue)}</strong>
              </span>
              <span>
                총자산
                <strong>{formatWon(summary.totalAsset)}</strong>
              </span>
              <span>
                수익률
                <strong className={Number(summary.returnRate || 0) >= 0 ? 'positive' : 'negative'}>
                  {formatPercent(summary.returnRate)}
                </strong>
              </span>
            </div>

            <section>
              <h3>보유 종목</h3>
              <div className="admin-detail-list">
                {holdings.map((holding) => (
                  <div key={holding.stockCode}>
                    <span>
                      <strong>{holding.stockName}</strong>
                      <small>{holding.stockCode}</small>
                    </span>
                    <span>{holding.quantity.toLocaleString('ko-KR')}주</span>
                    <span>{formatWon(holding.valuation)}</span>
                    <span className={Number(holding.profitLoss || 0) >= 0 ? 'positive' : 'negative'}>
                      {formatWon(holding.profitLoss)}
                    </span>
                  </div>
                ))}
                {holdings.length === 0 && <p className="empty">보유 종목이 없습니다.</p>}
              </div>
            </section>

            <section>
              <h3>최근 거래</h3>
              <div className="admin-detail-list trades">
                {trades.map((trade) => (
                  <div key={trade.id}>
                    <span>{formatDateTime(trade.createdAt)}</span>
                    <span className={trade.type === 'BUY' ? 'trade-buy' : 'trade-sell'}>
                      {trade.type === 'BUY' ? '매수' : '매도'}
                    </span>
                    <span>
                      <strong>{trade.stockName}</strong>
                      <small>{trade.stockCode}</small>
                    </span>
                    <span>{formatWon(trade.totalAmount)}</span>
                  </div>
                ))}
                {trades.length === 0 && <p className="empty">최근 거래가 없습니다.</p>}
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

function AdminPage({ logout }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedAdminUser, setSelectedAdminUser] = useState(null);
  const [adminUserLoading, setAdminUserLoading] = useState(false);
  const [adminUserError, setAdminUserError] = useState('');
  const [checkedBetaItems, setCheckedBetaItems] = useState(() => {
    const raw = localStorage.getItem(BETA_CHECKLIST_STORAGE_KEY);
    if (!raw) return {};

    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  });

  const loadStatus = async () => {
    setLoading(true);
    setError('');

    try {
      const { data } = await api.get('/admin/status');
      setStatus(data);
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        logout();
        return;
      }

      setError(requestError.response?.data?.message || '관리자 상태를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const stats = status?.stats || {};
  const priceRefresh = status?.priceRefresh || {};
  const recentTrades = status?.recentTrades || [];
  const users = status?.users || [];
  const adminAnnouncements = status?.adminAnnouncements || [];
  const priceRefreshLogs = status?.priceRefreshLogs || [];
  const marketStatus = status?.marketStatus || {};
  const server = status?.server || {};
  const failedCount = Number(priceRefresh.failedCount || 0);
  const betaItems = BETA_CHECKLIST.flatMap((section) => section.items);
  const checkedBetaCount = betaItems.filter((item) => checkedBetaItems[item.id]).length;
  const betaProgress = Math.round((checkedBetaCount / betaItems.length) * 100);
  const emptyAnnouncementForm = { title: '', content: '', isVisible: true, isImportant: false };
  const [announcementForm, setAnnouncementForm] = useState(emptyAnnouncementForm);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState(null);
  const [announcementSaving, setAnnouncementSaving] = useState(false);
  const [announcementError, setAnnouncementError] = useState('');

  const createAnnouncement = async (event) => {
    event.preventDefault();
    setAnnouncementSaving(true);
    setAnnouncementError('');

    try {
      if (editingAnnouncementId) {
        await api.patch(`/admin/announcements/${editingAnnouncementId}`, announcementForm);
      } else {
        await api.post('/admin/announcements', announcementForm);
      }
      setAnnouncementForm(emptyAnnouncementForm);
      setEditingAnnouncementId(null);
      await loadStatus();
    } catch (error) {
      setAnnouncementError(error.response?.data?.message || '공지사항을 저장하지 못했습니다.');
    } finally {
      setAnnouncementSaving(false);
    }
  };

  const startEditAnnouncement = (announcement) => {
    setAnnouncementError('');
    setEditingAnnouncementId(announcement.id);
    setAnnouncementForm({
      title: announcement.title,
      content: announcement.content,
      isVisible: announcement.isVisible,
      isImportant: announcement.isImportant,
    });
  };

  const cancelEditAnnouncement = () => {
    setAnnouncementError('');
    setEditingAnnouncementId(null);
    setAnnouncementForm(emptyAnnouncementForm);
  };

  const toggleAnnouncement = async (announcement) => {
    setAnnouncementError('');

    try {
      await api.patch(`/admin/announcements/${announcement.id}`, {
        isVisible: !announcement.isVisible,
      });
      await loadStatus();
    } catch (error) {
      setAnnouncementError(error.response?.data?.message || '공지사항 상태를 변경하지 못했습니다.');
    }
  };

  const deleteAnnouncement = async (announcement) => {
    if (!window.confirm('공지사항을 삭제하시겠습니까?')) return;

    setAnnouncementError('');

    try {
      await api.delete(`/admin/announcements/${announcement.id}`);
      if (editingAnnouncementId === announcement.id) {
        cancelEditAnnouncement();
      }
      await loadStatus();
    } catch (error) {
      setAnnouncementError(error.response?.data?.message || '공지사항을 삭제하지 못했습니다.');
    }
  };

  const loadAdminUserDetail = async (userId) => {
    setSelectedAdminUser(null);
    setAdminUserError('');
    setAdminUserLoading(true);

    try {
      const { data } = await api.get(`/admin/users/${userId}`);
      setSelectedAdminUser(data);
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        logout();
        return;
      }

      setAdminUserError(requestError.response?.data?.message || '유저 상세 정보를 불러오지 못했습니다.');
    } finally {
      setAdminUserLoading(false);
    }
  };

  const closeAdminUserDetail = () => {
    setSelectedAdminUser(null);
    setAdminUserError('');
    setAdminUserLoading(false);
  };

  const toggleBetaChecklistItem = (itemId) => {
    setCheckedBetaItems((current) => {
      const next = { ...current, [itemId]: !current[itemId] };
      localStorage.setItem(BETA_CHECKLIST_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <main className="app-shell admin-shell">
      <nav className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <ShieldCheck size={27} />
          </span>
          <span>
            <p className="eyebrow">Admin Console</p>
            <h1>운영 상태</h1>
          </span>
        </div>
        <div className="topbar-actions">
          <Link className="secondary-button nav-button" to="/">
            <Home size={17} />
            대시보드
          </Link>
          <button className="icon-button" onClick={logout} title="로그아웃">
            <LogOut size={19} />
          </button>
        </div>
      </nav>

      {loading && <section className="panel admin-message">운영 상태를 불러오는 중입니다.</section>}

      {!loading && error && (
        <section className="panel admin-message error">
          <strong>{error}</strong>
          <span>관리자 이메일 설정과 현재 로그인 계정을 확인해 주세요.</span>
        </section>
      )}

      {!loading && !error && status && (
        <>
          <section className="admin-grid">
            <AdminStatCard icon={<Users size={21} />} label="전체 유저" value={`${stats.userCount || 0}명`} />
            <AdminStatCard icon={<Wallet size={21} />} label="보유 종목" value={`${stats.holdingCount || 0}건`} />
            <AdminStatCard icon={<ArrowDownUp size={21} />} label="전체 거래" value={`${stats.tradeCount || 0}건`} detail={`최근 ${formatDateTime(stats.latestTradeAt)}`} tone="green" />
            <AdminStatCard icon={<Database size={21} />} label="가격 기록" value={`${stats.stockHistoryCount || 0}건`} detail={`최근 ${formatDateTime(stats.latestStockHistoryAt)}`} tone="yellow" />
          </section>

          <section className="panel beta-checklist-panel">
            <div className="panel-heading">
              <div>
                <h2>베타 오픈 점검표</h2>
                <span className="muted">관리자 브라우저에 체크 상태가 저장됩니다.</span>
              </div>
              <strong className="beta-progress">
                {checkedBetaCount} / {betaItems.length} 완료 · {betaProgress}%
              </strong>
            </div>
            <div className="beta-progress-bar" aria-hidden="true">
              <span style={{ width: `${betaProgress}%` }} />
            </div>
            <div className="beta-checklist-grid">
              {BETA_CHECKLIST.map((section) => (
                <section className="beta-checklist-group" key={section.group}>
                  <h3>{section.group}</h3>
                  {section.items.map((item) => (
                    <label className="beta-checklist-item" key={item.id}>
                      <input
                        type="checkbox"
                        checked={Boolean(checkedBetaItems[item.id])}
                        onChange={() => toggleBetaChecklistItem(item.id)}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </section>
              ))}
            </div>
          </section>

          <section className="admin-two-column">
            <section className="panel">
              <div className="panel-heading">
                <h2>가격 API</h2>
                <button className="secondary-button nav-button" onClick={loadStatus}>
                  <RefreshCw size={17} />
                  새로고침
                </button>
              </div>
              <div className="admin-status-list">
                <div>
                  <span>Provider</span>
                  <strong>{priceRefresh.provider || '-'}</strong>
                </div>
                <div>
                  <span>갱신 주기</span>
                  <strong>{priceRefresh.intervalMinutes || 15}분</strong>
                </div>
                <div>
                  <span>갱신 허용</span>
                  <strong>{priceRefresh.refreshWindowLabel || '평일 09:00 ~ 15:45'}</strong>
                </div>
                <div>
                  <span>현재 갱신 상태</span>
                  <strong>{priceRefresh.refreshWindowStatusLabel || '-'}</strong>
                </div>
                <div>
                  <span>마지막 성공</span>
                  <strong>{formatDateTime(priceRefresh.lastSuccessAt)}</strong>
                </div>
                <div>
                  <span>마지막 생략</span>
                  <strong>{formatDateTime(priceRefresh.lastSkippedAt)}</strong>
                </div>
                <div>
                  <span>성공 / 실패</span>
                  <strong>
                    {priceRefresh.successfulCount || 0} / {failedCount}
                  </strong>
                </div>
              </div>
              {failedCount > 0 && (
                <div className="admin-failed-list">
                  {(priceRefresh.failedStocks || []).slice(0, 10).map((stock) => (
                    <span key={stock.code || stock.name}>
                      <strong>{stock.name || stock.code}</strong>
                      <small>{stock.code} · {stock.message || '갱신 실패'}</small>
                    </span>
                  ))}
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel-heading">
                <h2>서버</h2>
                <span className={`status ${marketStatus.canTrade ? 'open' : 'closed'}`}>
                  {marketStatus.label || '조회 전용'}
                </span>
              </div>
              <div className="admin-status-list">
                <div>
                  <span>환경</span>
                  <strong>{server.environment || '-'}</strong>
                </div>
                <div>
                  <span>시작 시간</span>
                  <strong>{formatDateTime(server.startedAt)}</strong>
                </div>
                <div>
                  <span>실행 시간</span>
                  <strong>{formatUptime(server.uptimeSeconds)}</strong>
                </div>
                <div>
                  <span>현재 상태</span>
                  <strong>{marketStatus.canTrade ? '거래 가능' : '조회 전용'}</strong>
                </div>
              </div>
            </section>
          </section>

          <section className="admin-two-column wide">
            <section className="panel">
              <div className="panel-heading">
                <h2>최근 전체 거래</h2>
                <span className="muted">최대 30건</span>
              </div>
              <div className="admin-table trade-admin-table">
                <div className="admin-table-row head">
                  <span>시간</span>
                  <span>유저</span>
                  <span>구분</span>
                  <span>종목</span>
                  <span>수량</span>
                  <span>금액</span>
                </div>
                {recentTrades.map((trade) => (
                  <div className="admin-table-row" key={trade.id}>
                    <span>{formatDateTime(trade.createdAt)}</span>
                    <span>
                      <strong>{trade.userNickname || '-'}</strong>
                      <small>{trade.userEmail || ''}</small>
                    </span>
                    <span className={trade.type === 'BUY' ? 'trade-buy' : 'trade-sell'}>
                      {trade.type === 'BUY' ? '매수' : '매도'}
                    </span>
                    <span>
                      <strong>{trade.stockName}</strong>
                      <small>{trade.stockCode}</small>
                    </span>
                    <span>{Number(trade.quantity || 0).toLocaleString('ko-KR')}</span>
                    <span>{formatWon(trade.totalAmount)}</span>
                  </div>
                ))}
                {recentTrades.length === 0 && <p className="empty">최근 거래가 없습니다.</p>}
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <h2>가격 갱신 로그</h2>
                <span className="muted">최근 20회</span>
              </div>
              <div className="admin-log-list">
                {priceRefreshLogs.map((log) => (
                  <div className={`admin-log-item ${log.status}`} key={log.id}>
                    <strong>
                      {log.status === 'success'
                        ? '성공'
                        : log.status === 'partial'
                          ? '일부 실패'
                          : log.status === 'skipped'
                            ? '생략'
                            : '실패'}
                    </strong>
                    <span>{formatDateTime(log.createdAt)}</span>
                    <small>
                      성공 {log.successfulCount || 0} · 실패 {log.failedCount || 0}
                    </small>
                    <p>{log.message}</p>
                  </div>
                ))}
                {priceRefreshLogs.length === 0 && <p className="empty">아직 기록된 가격 갱신 로그가 없습니다.</p>}
              </div>
            </section>
          </section>

          <section className="admin-two-column wide">
            <section className="panel">
              <div className="panel-heading">
                <h2>{editingAnnouncementId ? '공지사항 수정' : '공지사항 작성'}</h2>
                <span className="muted">{editingAnnouncementId ? '수정 내용을 저장하면 즉시 반영됩니다.' : '확성기 버튼에 표시됩니다'}</span>
              </div>
              <form className="admin-announcement-form" onSubmit={createAnnouncement}>
                <label>
                  제목
                  <input
                    maxLength={120}
                    value={announcementForm.title}
                    onChange={(event) => setAnnouncementForm({ ...announcementForm, title: event.target.value })}
                    required
                  />
                </label>
                <label>
                  내용
                  <textarea
                    maxLength={2000}
                    value={announcementForm.content}
                    onChange={(event) => setAnnouncementForm({ ...announcementForm, content: event.target.value })}
                    required
                  />
                </label>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={announcementForm.isVisible}
                    onChange={(event) =>
                      setAnnouncementForm({ ...announcementForm, isVisible: event.target.checked })
                    }
                  />
                  바로 노출
                </label>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={announcementForm.isImportant}
                    onChange={(event) =>
                      setAnnouncementForm({ ...announcementForm, isImportant: event.target.checked })
                    }
                  />
                  중요 공지
                </label>
                {announcementError && <p className="error">{announcementError}</p>}
                <div className="admin-form-actions">
                  <button className="primary-button" disabled={announcementSaving}>
                    {announcementSaving ? '저장 중' : editingAnnouncementId ? '수정 저장' : '공지 등록'}
                  </button>
                  {editingAnnouncementId && (
                    <button className="secondary-button" type="button" onClick={cancelEditAnnouncement}>
                      취소
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <h2>공지 목록</h2>
                <span className="muted">최근 30건</span>
              </div>
              <div className="admin-announcement-list">
                {adminAnnouncements.map((announcement) => (
                  <article className={announcement.isImportant ? 'important' : ''} key={announcement.id}>
                    <div>
                      <strong>
                        {announcement.isImportant && <span className="important-badge">중요</span>}
                        {announcement.title}
                      </strong>
                      <small className="announcement-time">
                        작성 {formatDateTime(announcement.createdAt)}
                        {wasAnnouncementEdited(announcement) && (
                          <span>수정됨 {formatDateTime(announcement.updatedAt)}</span>
                        )}
                      </small>
                    </div>
                    <p>{announcement.content}</p>
                    <div className="admin-announcement-actions">
                      <button className="secondary-button" onClick={() => startEditAnnouncement(announcement)}>
                        수정
                      </button>
                      <button
                        className={announcement.isVisible ? 'secondary-button' : 'primary-button'}
                        onClick={() => toggleAnnouncement(announcement)}
                      >
                        {announcement.isVisible ? '숨기기' : '노출'}
                      </button>
                      <button className="danger-button" onClick={() => deleteAnnouncement(announcement)}>
                        삭제
                      </button>
                    </div>
                  </article>
                ))}
                {adminAnnouncements.length === 0 && <p className="empty">등록된 공지사항이 없습니다.</p>}
              </div>
            </section>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>유저/랭킹 관리</h2>
              <span className="muted">최근 가입 50명</span>
            </div>
            <div className="admin-table user-admin-table">
              <div className="admin-table-row head">
                <span>유저</span>
                <span>현금</span>
                <span>주식 평가</span>
                <span>총자산</span>
                <span>수익률</span>
                <span>보유</span>
                <span>가입일</span>
                <span>동작</span>
              </div>
              {users.map((user) => (
                <div className="admin-table-row" key={user.userId}>
                  <span>
                    <strong>{user.nickname}</strong>
                    <small>{user.email}</small>
                  </span>
                  <span>{formatWon(user.cashBalance)}</span>
                  <span>{formatWon(user.stockValue)}</span>
                  <span>{formatWon(user.totalAsset)}</span>
                  <span className={Number(user.returnRate || 0) >= 0 ? 'positive' : 'negative'}>
                    {formatPercent(user.returnRate)}
                  </span>
                  <span>{user.holdingCount || 0}건</span>
                  <span>{formatDateTime(user.createdAt)}</span>
                  <button className="secondary-button" onClick={() => loadAdminUserDetail(user.userId)}>
                    상세
                  </button>
                </div>
              ))}
              {users.length === 0 && <p className="empty">가입한 유저가 없습니다.</p>}
            </div>
          </section>
        </>
      )}
      <AdminUserDetailModal
        detail={selectedAdminUser}
        loading={adminUserLoading}
        error={adminUserError}
        onClose={closeAdminUserDetail}
      />
    </main>
  );
}

function InfoPageLayout({ eyebrow, title, children }) {
  const navigate = useNavigate();
  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate('/login');
  };

  return (
    <main className="info-shell">
      <section className="info-page">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <ChartNoAxesCombined size={25} />
          </span>
          <span>
            <p className="eyebrow">{eyebrow}</p>
            <strong>{BRAND_NAME}</strong>
          </span>
        </div>
        <h1>{title}</h1>
        {children}
        <div className="info-actions">
          <button className="secondary-button nav-button" onClick={goBack}>
            돌아가기
          </button>
        </div>
      </section>
    </main>
  );
}

function TermsPage() {
  return (
    <InfoPageLayout eyebrow="Terms" title="이용안내">
      <section>
        <h2>서비스 성격</h2>
        <p>
          한국 주식 모의투자 시뮬레이터는 실제 돈이 아닌 가상 자산으로 한국 주식 거래를 연습하는 학습용
          서비스입니다. 회원가입 시 지급되는 100,000,000원은 게임 내 가상 자산이며 현금화하거나 실제 금융상품
          거래에 사용할 수 없습니다.
        </p>
      </section>
      <section>
        <h2>거래와 가격 데이터</h2>
        <p>
          매수와 매도는 평일 09:00~15:30에만 가능하며, 장외 시간에는 조회만 가능합니다. 주가는 외부 API
          기준으로 장중 약 15분마다 갱신되며, 실제 시장 가격과 차이가 나거나 지연, 누락, 오류가 발생할 수
          있습니다. 데이터 오류가 확인되면 운영 판단에 따라 정정하거나 이전 가격을 유지할 수 있습니다.
        </p>
      </section>
      <section>
        <h2>거래 비용과 랭킹</h2>
        <p>
          모의투자 거래에는 매수/매도 수수료와 매도 거래세가 단순화된 규칙으로 적용됩니다. 랭킹과 수익률은
          게임 내 기록을 비교하기 위한 기능이며 실제 투자 성과, 투자 실력, 수익 가능성을 의미하지 않습니다.
        </p>
      </section>
      <section>
        <h2>투자 관련 고지</h2>
        <p>
          본 서비스는 투자 권유, 투자 자문, 수익 보장을 목적으로 하지 않습니다. 실제 투자 결정에는 사용자의
          독립적인 판단과 책임이 필요합니다.
        </p>
      </section>
      <section>
        <h2>운영 안내</h2>
        <p>
          서비스는 비영리 학습 및 포트폴리오 목적으로 운영됩니다. 서버 점검, API 장애, 데이터 오류, 기능 변경,
          임시 중단이 발생할 수 있으며 필요한 경우 공지사항을 통해 안내하겠습니다.
        </p>
      </section>
      <section>
        <h2>문의</h2>
        <p>
          서비스 이용 중 오류, 개인정보, 운영 관련 문의가 있으면{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>으로 연락해 주세요.
        </p>
      </section>
    </InfoPageLayout>
  );
}

function PrivacyPage() {
  return (
    <InfoPageLayout eyebrow="Privacy" title="개인정보 안내">
      <section>
        <h2>수집하는 정보</h2>
        <p>
          회원가입과 서비스 이용을 위해 이메일, 닉네임, 비밀번호 해시, 보유 종목, 거래 내역, 자산 기록을
          저장합니다. 공지 확인, 로그인 실패 제한, 운영 로그 등 서비스 안정성을 위한 일부 기술 정보가 함께
          기록될 수 있습니다. 비밀번호 원문은 저장하지 않습니다.
        </p>
      </section>
      <section>
        <h2>이용 목적</h2>
        <p>
          수집 정보는 로그인, 계정 관리, 포트폴리오 계산, 랭킹 표시, 운영 상태 확인을 위해 사용됩니다. 관리자
          콘솔에서는 서비스 운영 확인 목적으로 일부 계정 및 거래 정보를 볼 수 있습니다.
        </p>
      </section>
      <section>
        <h2>보관과 삭제</h2>
        <p>
          회원탈퇴 시 계정, 보유 종목, 거래 내역, 자산 기록은 삭제됩니다. 단, 서버 백업 파일에는 일정 기간
          이전 데이터가 남아 있을 수 있으며 백업 보관 정책에 따라 순차적으로 정리됩니다. 백업 데이터는 장애
          복구 목적 외에는 사용하지 않습니다.
        </p>
      </section>
      <section>
        <h2>보안</h2>
        <p>
          서버는 HTTPS를 사용하며, 데이터베이스와 API는 외부에서 직접 접근하지 못하도록 제한했습니다. 계정 보호를
          위해 비밀번호 변경과 로그인 실패 제한 기능을 제공합니다.
        </p>
      </section>
      <section>
        <h2>관리자 열람</h2>
        <p>
          운영자는 장애 대응, 부정 이용 확인, 문의 처리, 서비스 개선을 위해 이메일, 닉네임, 보유 종목, 거래
          내역, 자산 현황을 확인할 수 있습니다.
        </p>
      </section>
      <section>
        <h2>문의</h2>
        <p>
          개인정보 열람, 정정, 삭제, 서비스 이용 문의는{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>으로 요청해 주세요.
        </p>
      </section>
    </InfoPageLayout>
  );
}

export default function App() {
  const auth = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" saveSession={auth.saveSession} />} />
      <Route path="/register" element={<AuthPage mode="register" saveSession={auth.saveSession} />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route
        path="/admin"
        element={auth.user ? <AdminPage logout={auth.logout} /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/"
        element={auth.user ? <Dashboard logout={auth.logout} /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}
