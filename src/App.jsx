import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import {
  ArrowDownUp,
  ChartNoAxesCombined,
  Clock3,
  Lock,
  LogOut,
  Search,
  Trophy,
  Wallet,
  X,
} from 'lucide-react';
import { api } from './api.js';
import { formatDateTime, formatPercent, formatWon } from './format.js';

const BRAND_NAME = '한국 주식 모의투자 시뮬레이터';
const BRAND_SHORT = '모의투자 시뮬레이터';

const PERIODS = [
  { key: '1D', label: '1일', points: 8 },
  { key: '1W', label: '1주', points: 7 },
  { key: '1M', label: '1월', points: 10 },
  { key: '1Y', label: '1년', points: 12 },
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

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const payload = isRegister ? form : { email: form.email, password: form.password };
      const { data } = await api.post(endpoint, payload);
      saveSession(data);
      navigate('/');
    } catch (requestError) {
      setError(requestError.response?.data?.message || '요청을 처리하지 못했습니다.');
    } finally {
      setLoading(false);
    }
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
          <strong>서비스 안내</strong>
          <ul>
            <li>실제 돈이 아닌 가상 자산으로 진행되는 모의투자 게임입니다.</li>
            <li>주가는 한국투자증권 API 기준으로 약 15분마다 갱신됩니다.</li>
            <li>매수/매도는 평일 09:00~15:30에만 가능합니다.</li>
            <li>본 서비스는 비영리 학습 및 포트폴리오 목적으로만 운영됩니다.</li>
            <li>제공 정보는 투자 권유나 수익 보장을 의미하지 않습니다.</li>
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
    </main>
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

function buildChartPoints(stock, period) {
  const count = PERIODS.find((item) => item.key === period)?.points || 8;
  const seed = Number(stock?.code || 1);
  const price = Number(stock?.price || 10000);

  return Array.from({ length: count }, (_, index) => {
    const progress = index / Math.max(count - 1, 1);
    const drift = period === '1D' ? 0.012 : period === '1W' ? 0.028 : period === '1M' ? 0.07 : 0.18;
    const wave = Math.sin(index * 1.17 + seed * 0.001) * price * 0.025;
    return Math.max(100, price * (1 - drift + progress * drift) + wave);
  });
}

function StockChart({ stock, period, setPeriod, history }) {
  const values = useMemo(() => {
    const historyValues = history.map((item) => Number(item.price)).filter((price) => price > 0);
    return historyValues.length >= 2 ? historyValues : buildChartPoints(stock, period);
  }, [history, stock, period]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const points = values
    .map((value, index) => {
      const x = 24 + index * (552 / (values.length - 1));
      const y = 172 - ((value - min) / range) * 118;
      return `${x},${y}`;
    })
    .join(' ');
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
          <p className="muted">15분 갱신 가격 기록</p>
        </div>
        <strong>{formatWon(stock.price)}</strong>
      </div>

      <svg className="stock-chart" viewBox="0 0 600 210" role="img" aria-label={`${stock.name} 가격 차트`}>
        <defs>
          <linearGradient id="stockFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#1f6f8b" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#1f6f8b" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path className="chart-grid" d="M24 54H576M24 93H576M24 132H576M24 172H576" />
        <polygon points={fillPoints} fill="url(#stockFill)" />
        <polyline className="chart-line" points={points} />
        {points.split(' ').map((point) => {
          const [cx, cy] = point.split(',');
          return <circle className="chart-dot" key={point} cx={cx} cy={cy} r="4" />;
        })}
      </svg>

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
  const [period, setPeriod] = useState('1M');
  const [priceHistory, setPriceHistory] = useState([]);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [pendingOrder, setPendingOrder] = useState(null);
  const [tradeLoading, setTradeLoading] = useState(false);

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
          최근 가격 갱신에 실패해 마지막 성공 가격을 표시하고 있습니다.
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
                  <small className="positive">+0.5%</small>
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
        path="/"
        element={auth.user ? <Dashboard logout={auth.logout} /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}
