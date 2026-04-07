import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth }   from '../context/AuthContext';
import { useRoom }   from '../context/RoomContext';
import api from '../services/api';

export const useMyTeam = () => {
  const { user }            = useAuth();
  const { socket }          = useSocket();
  const { teamAssignments } = useRoom();

  const [myTeam,   setMyTeam]   = useState(null);
  const [allTeams, setAllTeams] = useState([]);
  const [loading,  setLoading]  = useState(true);

  const myAssignment = user ? teamAssignments?.[user.id] : null;
  const myTeamId     = myAssignment?.teamId ?? null;

  // ── Fetch full team data from server ─────────────────────────────────────────
  const fetchTeams = useCallback(async () => {
    try {
      const [allRes, myRes] = await Promise.all([
        api.get('/teams'),
        myTeamId ? api.get(`/teams/${myTeamId}`) : Promise.resolve({ data: null }),
      ]);
      setAllTeams(allRes.data ?? []);
      setMyTeam(myRes.data);
    } catch (err) {
      console.error('[useMyTeam] fetchTeams error:', err.message);
    } finally {
      setLoading(false);
    }
  }, [myTeamId]);

  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  // ── Socket: update state directly from event data (no API round-trip) ────────
  useEffect(() => {
    if (!socket) return;

    const onSold = ({ player, team: soldTeam, amount }) => {
      const soldTeamId = String(soldTeam._id);

      // Build a minimal player record matching what the API returns
      const playerRecord = {
        _id:         player._id,
        name:        player.name,
        role:        player.role,
        soldPrice:   amount,
        nationality: player.nationality,
        fitness:     player.fitness,
      };

      // Update allTeams — adjust purse and add player to the buying team's list
      setAllTeams((prev) =>
        prev.map((t) => {
          if (String(t._id) !== soldTeamId) return t;
          return {
            ...t,
            remainingPurse: soldTeam.remainingPurse,
            players: [...(t.players || []), playerRecord],
          };
        })
      );

      // Update myTeam if I own the buying team
      if (myTeamId && soldTeamId === String(myTeamId)) {
        setMyTeam((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            remainingPurse: soldTeam.remainingPurse,
            // Use full player data for the squad view
            players: [...(prev.players || []), { ...player, soldPrice: amount }],
          };
        });
      }
    };

    socket.on('auction:sold', onSold);
    return () => socket.off('auction:sold', onSold);
  }, [socket, myTeamId]);

  // ── Derived data ──────────────────────────────────────────────────────────────
  const squadByRole = (myTeam?.players ?? []).reduce((acc, p) => {
    const key = p.role ?? 'Unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  return { myTeam, allTeams, squadByRole, loading, refetch: fetchTeams };
};
