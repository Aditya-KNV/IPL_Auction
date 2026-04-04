import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { useRoom } from '../context/RoomContext';
import api from '../services/api';
import { normalizeCroreAmount } from '../utils/currency';

export const useAuction = () => {
  const { socket } = useSocket();
  const { room } = useRoom();

  const [session,       setSession]       = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [currentBid,    setCurrentBid]    = useState(0);
  const [minNextBid,    setMinNextBid]    = useState(0);
  const [highestBidder, setHighestBidder] = useState(null);
  const [withdrawnTeams, setWithdrawnTeams] = useState([]);
  const [timeLeft,      setTimeLeft]      = useState(0);
  const [timerTotal,    setTimerTotal]    = useState(10); // full duration of current period
  const [bidHistory,    setBidHistory]    = useState([]);
  const [bidError,      setBidError]      = useState('');
  const [soldFlash,     setSoldFlash]     = useState(null);
  const [unsoldFlash,   setUnsoldFlash]   = useState(null);
  const [loading,       setLoading]       = useState(true);

  const tickRef = useRef(null);

  const startLocalTick = useCallback((expiresAt) => {
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) clearInterval(tickRef.current);
    }, 250);
  }, []);

  const stopLocalTick = useCallback(() => {
    clearInterval(tickRef.current);
    tickRef.current = null;
  }, []);

  useEffect(() => () => stopLocalTick(), [stopLocalTick]);

  // ── Initial load ────────────────────────────────────────────────────────────
  const fetchSession = useCallback(async () => {
    try {
      const { data } = await api.get('/auction/session');
      if (!data) {
        setSession(null);
        setCurrentPlayer(null);
        setCurrentBid(0);
        setMinNextBid(0);
        setHighestBidder(null);
        setWithdrawnTeams([]);
        setTimeLeft(0);
        setBidHistory([]);
        setBidError('');
        setSoldFlash(null);
        setLoading(false);
        return;
      }

      setSession(data);
      setCurrentPlayer(data.currentPlayer || null);
      setCurrentBid(normalizeCroreAmount(data.currentBid || 0));
      setMinNextBid(normalizeCroreAmount(data.minNextBid || 0));
      setHighestBidder(data.currentHighestBidder || null);
      setWithdrawnTeams(data.withdrawnTeams || []);

      if (data.timerEndsAt && data.status === 'active') {
        const endsAt    = new Date(data.timerEndsAt).getTime();
        const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        setTimeLeft(remaining);
        setTimerTotal(data.timerDuration || remaining || 10);
        if (remaining > 0) startLocalTick(endsAt);
      } else {
        setTimeLeft(0);
      }

      setBidHistory(
        (data.bids || [])
          .slice(-20)
          .reverse()
          .map((bid) => ({ ...bid, amount: normalizeCroreAmount(bid.amount) }))
      );
    } finally {
      setLoading(false);
    }
  }, [startLocalTick]);

  useEffect(() => {
    setLoading(true);
    fetchSession();
  }, [fetchSession, room?.code]);

  // ── Socket events ─────────────────────────────────────────────────────────
  // IMPORTANT: always pass the named handler to socket.off — generic
  // socket.off('event') removes ALL listeners including other hooks'.
  useEffect(() => {
    if (!socket) return;

    const onNextPlayer = ({ player, currentBid, timerDuration, timerEndsAt, minNextBid }) => {
      const endsAt    = timerEndsAt ? new Date(timerEndsAt).getTime() : Date.now() + timerDuration * 1000;
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setCurrentPlayer(player);
      setCurrentBid(normalizeCroreAmount(currentBid));
      setMinNextBid(normalizeCroreAmount(minNextBid || 0));
      setHighestBidder(null);
      setWithdrawnTeams([]);
      setBidHistory([]);
      setBidError('');
      setTimerTotal(timerDuration || 10);
      setTimeLeft(remaining);
      startLocalTick(endsAt);
    };

    const onBidUpdate = ({ currentBid, highestBidder, minNextBid, bidEntry, timerEndsAt }) => {
      setCurrentBid(normalizeCroreAmount(currentBid));
      setMinNextBid(normalizeCroreAmount(minNextBid || 0));
      setHighestBidder(highestBidder);
      setWithdrawnTeams([]);
      if (timerEndsAt) {
        const endsAt    = new Date(timerEndsAt).getTime();
        const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        setTimerTotal(remaining); // ring resets to full on each bid
        setTimeLeft(remaining);
        startLocalTick(endsAt);
      }
      if (bidEntry) {
        setBidHistory((prev) => [
          { ...bidEntry, amount: normalizeCroreAmount(bidEntry.amount) },
          ...prev,
        ].slice(0, 20));
      }
    };

    // Server emits auction:timer only at key moments (start/extend/expire=0).
    // Use expiresAt to compute remaining locally — avoids server/client clock skew.
    const onTimer = ({ expiresAt }) => {
      if (!expiresAt) { setTimeLeft(0); return; }
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      startLocalTick(expiresAt);
    };

    const onSold = ({ player, team, amount, auto }) => {
      stopLocalTick();
      setTimeLeft(0);
      setSoldFlash({ player, team, amount: normalizeCroreAmount(amount), auto });
      setTimeout(() => setSoldFlash(null), 800);
      setCurrentPlayer(null);
      setCurrentBid(0);
      setMinNextBid(0);
      setHighestBidder(null);
      setWithdrawnTeams([]);
      setBidHistory([]);
      setSession((prev) => prev ? {
        ...prev,
        soldPlayers: [...(prev.soldPlayers || []), player],
      } : prev);
    };

    const onUnsold = ({ player }) => {
      stopLocalTick();
      setTimeLeft(0);
      setUnsoldFlash(player);
      setTimeout(() => setUnsoldFlash(null), 2500);
      setCurrentPlayer(null);
      setCurrentBid(0);
      setMinNextBid(0);
      setHighestBidder(null);
      setWithdrawnTeams([]);
      setBidHistory([]);
      setSession((prev) => prev ? {
        ...prev,
        unsoldPlayers: [...(prev.unsoldPlayers || []), player],
      } : prev);
    };

    const onStatus = ({ status }) => {
      setSession((prev) => prev ? { ...prev, status } : prev);
      if (status === 'active' && Notification.permission === 'granted') {
        new Notification('IPL Auction', {
          body: 'Auction has started! Head to the Auction tab to bid.',
          icon: '/favicon.ico',
        });
      }
      if (status === 'waiting') {
        stopLocalTick();
        setCurrentPlayer(null);
        setCurrentBid(0);
        setMinNextBid(0);
        setHighestBidder(null);
        setWithdrawnTeams([]);
        setTimeLeft(0);
        setBidHistory([]);
        setBidError('');
        setSoldFlash(null);
      }
      if (status === 'paused') { stopLocalTick(); setTimeLeft(0); }
    };

    const onResumed = ({ timerDuration, timerEndsAt, currentBid, minNextBid, highestBidder }) => {
      const endsAt    = timerEndsAt ? new Date(timerEndsAt).getTime() : Date.now() + timerDuration * 1000;
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      if (typeof currentBid === 'number') setCurrentBid(normalizeCroreAmount(currentBid));
      if (typeof minNextBid === 'number') setMinNextBid(normalizeCroreAmount(minNextBid));
      if (highestBidder !== undefined) setHighestBidder(highestBidder || null);
      setTimerTotal(timerDuration || remaining || 10);
      setTimeLeft(remaining);
      startLocalTick(endsAt);
    };

    const onWithdrawUpdated = ({ withdrawnTeams = [], reason }) => {
      setWithdrawnTeams(withdrawnTeams);
      if (reason === 'reset') {
        setWithdrawnTeams([]);
      }
    };

    const onCompleted = () => {
      stopLocalTick();
      setSession((prev) => prev ? { ...prev, status: 'completed' } : prev);
      setCurrentPlayer(null);
      setWithdrawnTeams([]);
    };

    const onBidError = ({ message }) => {
      setBidError(message);
      setTimeout(() => setBidError(''), 3500);
    };

    socket.on('auction:nextPlayer', onNextPlayer);
    socket.on('bid:update',         onBidUpdate);
    socket.on('auction:timer',      onTimer);
    socket.on('auction:sold',       onSold);
    socket.on('auction:unsold',     onUnsold);
    socket.on('auction:status',     onStatus);
    socket.on('auction:resumed',    onResumed);
    socket.on('auction:completed',  onCompleted);
    socket.on('auction:withdraw-updated', onWithdrawUpdated);
    socket.on('bid:error',          onBidError);

    return () => {
      socket.off('auction:nextPlayer', onNextPlayer);
      socket.off('bid:update',         onBidUpdate);
      socket.off('auction:timer',      onTimer);
      socket.off('auction:sold',       onSold);
      socket.off('auction:unsold',     onUnsold);
      socket.off('auction:status',     onStatus);
      socket.off('auction:resumed',    onResumed);
      socket.off('auction:completed',  onCompleted);
      socket.off('auction:withdraw-updated', onWithdrawUpdated);
      socket.off('bid:error',          onBidError);
    };
  }, [socket, startLocalTick, stopLocalTick]);

  const placeBid = useCallback((amount) => {
    setBidError('');
    socket?.emit('bid:place', { amount: normalizeCroreAmount(amount) });
  }, [socket]);

  const withdraw = useCallback(() => {
    setBidError('');
    socket?.emit('auction:withdraw');
  }, [socket]);

  return {
    session, currentPlayer, currentBid, minNextBid,
    highestBidder, withdrawnTeams, timeLeft, timerTotal, bidHistory, bidError,
    soldFlash, unsoldFlash, loading, placeBid, withdraw, refetch: fetchSession,
  };
};
