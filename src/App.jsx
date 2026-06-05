import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import {
  ArrowDownUp,
  ChartNoAxesCombined,
  Clock3,
  Database,
  Home,
  KeyRound,
  Lock,
  LogOut,
  RefreshCw,
  Search,
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
      navigate('/');
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
                required
              />
            </label>
          )}

          <label>
            비밀번호
            <input
              type="password"
              minLength={6}
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required
            />
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
          <p className="muted">실제 갱신 가격 기록</p>
        </div>
        <strong>{formatWon(stock.price)}</strong>
      </div>

      <div className="chart-canvas">
        <svg className="stock-chart" viewBox="0 0 600 210" role="img" aria-label={`${stock.name} 가격 차트`}>
          <defs>
            <linearGradient id="stockFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#1f6f8b" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#1f6f8b" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path className="chart-grid" d="M24 54H576M24 93H576M24 132H576M24 172H576" />
          {hasEnoughHistory && <polygon points={fillPoints} fill="url(#stockFill)" />}
          {hasEnoughHistory && <polyline className="chart-line" points={points} />}
          {plottedPoints.map((point) => (
            <circle
              className="chart-dot interactive"
              key={`${point.recordedAt}-${point.price}`}
              cx={point.x}
              cy={point.y}
              r="5"
              tabIndex="0"
              onBlur={() => setHoveredPoint(null)}
              onFocus={() => setHoveredPoint(point)}
              onMouseEnter={() => setHoveredPoint(point)}
              onMouseLeave={() => setHoveredPoint(null)}
            />
          ))}
        </svg>
        {!hasEnoughHistory && (
          <div className="chart-empty">
            <strong>차트 데이터를 쌓는 중입니다.</strong>
            <span>
              장중 가격 갱신이 2회 이상 기록되면 차트가 표시됩니다. 가격 기록은 평일 09:00~15:45에
              약 15분 간격으로 저장됩니다.
            </span>
          </div>
        )}
        {hoveredPoint && (
          <div
            className="chart-tooltip"
            style={{
              left: `${(hoveredPoint.x / 600) * 100}%`,
              top: `${(hoveredPoint.y / 210) * 100}%`,
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

function OrderConfirmModal({ order, cashBalance, onCancel, onConfirm, loading }) {
  if (!order) return null;

  const totalAmount = order.price * order.quantity;
  const nextCash = order.type === 'buy' ? cashBalance - totalAmount : cashBalance + totalAmount;
  const isBuy = order.type === 'buy';

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
            <strong>{formatWon(totalAmount)}</strong>
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
  const canSubmit = form.currentPassword && form.newPassword.length >= 6 && passwordsMatch;

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
          현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다. 새 비밀번호는 6자 이상이어야 합니다.
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
              minLength={6}
              value={form.newPassword}
              onChange={(event) => setForm({ ...form, newPassword: event.target.value })}
              disabled={loading}
            />
          </label>
          <label>
            새 비밀번호 확인
            <input
              type="password"
              minLength={6}
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

function Dashboard({ logout }) {
  const [portfolio, setPortfolio] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [myRanking, setMyRanking] = useState(null);
  const [rankingSort, setRankingSort] = useState('asset');
  const [trades, setTrades] = useState([]);
  const [assetHistory, setAssetHistory] = useState([]);
  const [query, setQuery] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [selectedCode, setSelectedCode] = useState('');
  const [period, setPeriod] = useState('15M');
  const [priceHistory, setPriceHistory] = useState([]);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [pendingOrder, setPendingOrder] = useState(null);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
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

  const load = async () => {
    const [portfolioResponse, stocksResponse, rankingResponse] = await Promise.all([
      api.get('/portfolio'),
      api.get('/stocks'),
      api.get('/ranking', { params: { sort: rankingSort } }),
    ]);
    const tradesResponse = await api.get('/trades').catch(() => ({ data: { trades: [] } }));
    const assetHistoryResponse = await api.get('/asset-history').catch(() => ({ data: { history: [] } }));

    setPortfolio(portfolioResponse.data);
    setStocks(stocksResponse.data.stocks);
    setSelectedCode((current) => current || stocksResponse.data.stocks[0]?.code || '');
    setRanking(rankingResponse.data.ranking);
    setMyRanking(rankingResponse.data.me);
    setTrades(tradesResponse.data.trades);
    setAssetHistory(assetHistoryResponse.data.history);
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

  const openOrder = (type) => {
    if (!selectedStock) return;
    const orderQuantity = Number(quantity || 1);

    if (!Number.isInteger(orderQuantity) || orderQuantity <= 0) {
      setMessage('수량은 1 이상의 정수여야 합니다.');
      return;
    }

    if (type === 'sell' && (!selectedHolding || orderQuantity > selectedHolding.quantity)) {
      setMessage('선택한 종목의 보유 수량이 부족합니다.');
      return;
    }

    setMessage('');
    setPendingOrder({
      type,
      stockCode: selectedStock.code,
      stockName: selectedStock.name,
      sector: selectedStock.sector,
      quantity: orderQuantity,
      price: selectedStock.price,
    });
  };

  const confirmTrade = async () => {
    if (!pendingOrder) return;

    setTradeLoading(true);
    setMessage('');

    try {
      const { data } = await api.post(`/trade/${pendingOrder.type}`, {
        stockCode: pendingOrder.stockCode,
        quantity: pendingOrder.quantity,
      });
      setPortfolio(data);
      const [rankingResponse, tradesResponse, assetHistoryResponse] = await Promise.all([
        api.get('/ranking', { params: { sort: rankingSort } }),
        api.get('/trades'),
        api.get('/asset-history'),
      ]);
      setRanking(rankingResponse.data.ranking);
      setMyRanking(rankingResponse.data.me);
      setTrades(tradesResponse.data.trades);
      setAssetHistory(assetHistoryResponse.data.history);
      setPendingOrder(null);
      setMessage(pendingOrder.type === 'buy' ? '매수가 완료되었습니다.' : '매도가 완료되었습니다.');
    } catch (error) {
      setMessage(error.response?.data?.message || '거래를 처리하지 못했습니다.');
    } finally {
      setTradeLoading(false);
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
  const estimatedCost = selectedPrice * currentQuantity;
  const maxBuyQuantity = selectedPrice > 0 ? Math.floor(portfolio.summary.cashBalance / selectedPrice) : 0;
  const maxSellQuantity = selectedHolding?.quantity || 0;
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
          {portfolio.isAdmin && (
            <Link className="icon-button" to="/admin" title="관리자">
              <ShieldCheck size={19} />
            </Link>
          )}
          <button className="icon-button" onClick={() => setPasswordModalOpen(true)} title="비밀번호 변경">
            <KeyRound size={18} />
          </button>
          <button className="icon-button danger-icon" onClick={() => setDeleteModalOpen(true)} title="회원탈퇴">
            <Trash2 size={18} />
          </button>
          <button className="icon-button" onClick={logout} title="로그아웃">
            <LogOut size={19} />
          </button>
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

      {message && (
        <div className="notice dismissible-notice">
          <span>{message}</span>
          <button className="notice-close" onClick={() => setMessage('')} title="알림 닫기">
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
          <div className="panel-heading compact">
            <h2>지금 거래</h2>
          </div>
          <label>
            종목
            <input value={selectedStock ? `${selectedStock.name} (${selectedStock.code})` : ''} readOnly />
          </label>
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
            <span>총 추정 비용</span>
            <strong>{formatWon(estimatedCost)}</strong>
            <span>보유 수량</span>
            <strong>{selectedHolding?.quantity?.toLocaleString('ko-KR') || 0}주</strong>
            <span>매수 가능</span>
            <strong>{maxBuyQuantity.toLocaleString('ko-KR')}주</strong>
            <span>매도 가능</span>
            <strong>{maxSellQuantity.toLocaleString('ko-KR')}주</strong>
          </div>

          {currentQuantity > maxBuyQuantity && (
            <p className="inline-warning">현재 현금으로는 {maxBuyQuantity.toLocaleString('ko-KR')}주까지 매수할 수 있습니다.</p>
          )}
          {selectedHolding && currentQuantity > maxSellQuantity && (
            <p className="inline-warning">보유 수량은 {maxSellQuantity.toLocaleString('ko-KR')}주입니다.</p>
          )}

          <div className="order-buttons">
            <button className="buy-button" disabled={!marketOpen} onClick={() => openOrder('buy')}>
              {quantity || 1}주 매수
            </button>
            <button className="sell-button" disabled={!marketOpen || !selectedHolding} onClick={() => openOrder('sell')}>
              {quantity || 1}주 매도
            </button>
          </div>
        </aside>
      </section>

      <section className="bottom-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>내 포트폴리오</h2>
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
            {portfolio.holdings.map((holding) => (
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
          {trades.map((trade) => (
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
        </div>
      </section>

      <OrderConfirmModal
        order={pendingOrder}
        cashBalance={portfolio.summary.cashBalance}
        onCancel={() => setPendingOrder(null)}
        onConfirm={confirmTrade}
        loading={tradeLoading}
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

function AdminPage({ logout }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

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
  const priceRefreshLogs = status?.priceRefreshLogs || [];
  const marketStatus = status?.marketStatus || {};
  const server = status?.server || {};
  const failedCount = Number(priceRefresh.failedCount || 0);

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
                </div>
              ))}
              {users.length === 0 && <p className="empty">가입한 유저가 없습니다.</p>}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

export default function App() {
  const auth = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" saveSession={auth.saveSession} />} />
      <Route path="/register" element={<AuthPage mode="register" saveSession={auth.saveSession} />} />
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
